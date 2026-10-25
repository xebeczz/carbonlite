from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Business, Document
from .files import MIME_BY_EXT, make_image_preview, sha256_bytes, sniff_mime
from .extraction.local_parser import render_pdf_preview

logger = logging.getLogger("carbonlite.documents")


class UploadRejected(Exception):
    pass


class DuplicateDocument(Exception):
    def __init__(self, existing_id: int, filename: str):
        self.existing_id = existing_id
        self.filename = filename
        super().__init__(f"This document was already uploaded as {filename or f'document #{existing_id}'}")


@dataclass
class SanitisedFile:
    original_name: str
    extension: str
    mime_type: str
    content: bytes
    sha256: str


def inspect_upload(filename: str | None, content: bytes) -> SanitisedFile:
    if not content:
        raise UploadRejected("The file is empty. Try taking the photo again.")
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise UploadRejected(f"That file is larger than {settings.max_upload_mb} MB. Try a smaller photo or PDF.")
    original = Path(filename or "upload").name
    extension = Path(original).suffix.lower()
    mime_type = MIME_BY_EXT.get(extension)
    sniffed = sniff_mime(content)
    if mime_type is None:
        if sniffed:
            mime_type = sniffed
            extension = next((ext for ext, mime in MIME_BY_EXT.items() if mime == sniffed), extension)
        else:
            raise UploadRejected("Only PDF, JPG, PNG, or WebP documents are supported.")
    if sniffed is None:
        raise UploadRejected("That file does not look like a PDF or an image. Please upload a bill photo or PDF.")
    if mime_type != sniffed:
        raise UploadRejected("The file extension does not match its contents. Please upload the original document.")
    return SanitisedFile(
        original_name=original,
        extension=extension,
        mime_type=mime_type,
        content=content,
        sha256=sha256_bytes(content),
    )


def store_upload(db: Session, business: Business, sanitised: SanitisedFile) -> Document:
    duplicate = db.scalar(
        select(Document).where(
            Document.business_id == business.id,
            Document.file_hash == sanitised.sha256,
        )
    )
    if duplicate:
        raise DuplicateDocument(duplicate.id, duplicate.original_filename)

    relative = Path(str(business.id)) / f"{uuid.uuid4().hex}{sanitised.extension}"
    absolute = settings.upload_dir / relative
    absolute.parent.mkdir(parents=True, exist_ok=True)
    absolute.write_bytes(sanitised.content)

    preview_relative: str | None = None
    if sanitised.mime_type == "application/pdf":
        preview_relative = str(relative.with_name(relative.stem + "_preview.png"))
        if not render_pdf_preview(str(absolute), str(settings.upload_dir / preview_relative)):
            preview_relative = None
    else:
        preview_relative = str(relative.with_name(relative.stem + "_preview.jpg"))
        if not make_image_preview(absolute, settings.upload_dir / preview_relative):
            preview_relative = None

    document = Document(
        business_id=business.id,
        file_path=str(relative),
        preview_path=preview_relative,
        original_filename=sanitised.original_name,
        mime_type=sanitised.mime_type,
        file_hash=sanitised.sha256,
        status="uploaded",
        doc_type="unknown",
        is_demo=business.is_demo,
    )
    db.add(document)
    db.flush()
    logger.info("Stored document %s for business %s", document.id, business.id)
    return document


def resolve_stored_path(relative: str | None) -> Path | None:
    if not relative:
        return None
    base = settings.upload_dir.resolve()
    candidate = (base / relative).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def remove_stored_document(document: Document) -> None:
    for relative in (document.file_path, document.preview_path):
        path = resolve_stored_path(relative)
        if path:
            try:
                path.unlink()
            except OSError:
                pass
