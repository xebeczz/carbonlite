from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

import fitz
from PIL import Image
from pydantic import ValidationError

from ...config import settings
from .llm import LLMClient, LLMError, parse_json_object
from .local_parser import extract_pdf_text, parse_document_text
from .prompts import (
    SYSTEM_PROMPT,
    correction_prompt,
    text_user_prompt,
    vision_user_prompt,
)
from .schemas import ExtractedFields

logger = logging.getLogger("carbonlite.extraction")

METHOD_LABELS = {
    "vision_llm": "AI vision reader",
    "text_llm": "AI text reader",
    "pdf_text_parser": "Offline PDF reader",
    "ocr_parser": "OCR offline reader",
    "manual": "Manual entry",
}


@dataclass
class ExtractionOutcome:
    fields: ExtractedFields
    method: str
    provider: str
    raw: dict = field(default_factory=dict)
    error: str | None = None
    warnings: list[str] = field(default_factory=list)
    manual_required: bool = False

    @property
    def method_label(self) -> str:
        return METHOD_LABELS.get(self.method, self.method)


def ocr_available() -> bool:
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _ocr_image_bytes(content: bytes) -> str | None:
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        image = Image.open(io.BytesIO(content))
        return pytesseract.image_to_string(image)
    except Exception:
        return None


def _pdf_first_page_png(path: Path, zoom: float = 2.0) -> bytes | None:
    try:
        document = fitz.open(str(path))
        try:
            page = document.load_page(0)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            return pixmap.tobytes("png")
        finally:
            document.close()
    except Exception:
        return None


class ExtractionService:
    def __init__(self, llm: LLMClient | None = None):
        self.llm = llm if llm is not None else (LLMClient(settings) if settings.llm_configured else None)

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm and self.llm.configured)

    def capabilities(self) -> dict:
        return {
            "llm_configured": self.llm_configured,
            "vision_model": settings.llm_vision_model if self.llm_configured else None,
            "text_model": settings.llm_text_model if self.llm_configured else None,
            "ocr_available": ocr_available(),
            "pdf_reader_available": True,
            "manual_entry_available": True,
        }

    def _llm_fields_from_image(
        self, image_bytes: bytes, mime: str, filename: str
    ) -> tuple[ExtractedFields, dict]:
        assert self.llm is not None
        correction = None
        last_error: Exception | None = None
        for _ in range(2):
            try:
                raw = self.llm.extract_from_image(
                    SYSTEM_PROMPT, vision_user_prompt(filename), image_bytes, mime, correction
                )
                data = parse_json_object(raw)
                fields = ExtractedFields.model_validate(data)
                if not fields.has_any_data():
                    raise ValueError("the extraction did not contain any readable fields")
                return fields, data
            except (LLMError, ValueError, ValidationError) as exc:
                last_error = exc
                correction = correction_prompt(str(exc)[:300])
        raise LLMError(f"Vision extraction failed after one retry: {last_error}")

    def _llm_fields_from_text(self, text: str, filename: str) -> tuple[ExtractedFields, dict]:
        assert self.llm is not None
        correction = None
        last_error: Exception | None = None
        for _ in range(2):
            try:
                raw = self.llm.extract_from_text(
                    SYSTEM_PROMPT, text_user_prompt(text, filename), correction
                )
                data = parse_json_object(raw)
                fields = ExtractedFields.model_validate(data)
                if not fields.has_any_data():
                    raise ValueError("the extraction did not contain any readable fields")
                return fields, data
            except (LLMError, ValueError, ValidationError) as exc:
                last_error = exc
                correction = correction_prompt(str(exc)[:300])
        raise LLMError(f"Text extraction failed after one retry: {last_error}")

    def extract(self, path: Path, mime_type: str, filename: str) -> ExtractionOutcome:
        warnings: list[str] = []
        errors: list[str] = []
        is_pdf = mime_type == "application/pdf" or path.suffix.lower() == ".pdf"

        try:
            if is_pdf:
                text = extract_pdf_text(str(path))
                image_bytes = _pdf_first_page_png(path)
                image_mime = "image/png"
            else:
                text = ""
                image_bytes = path.read_bytes()
                image_mime = mime_type

            if self.llm_configured and image_bytes:
                try:
                    fields, raw = self._llm_fields_from_image(image_bytes, image_mime, filename)
                    return ExtractionOutcome(
                        fields=fields,
                        method="vision_llm",
                        provider=f"AI vision ({settings.llm_vision_model})",
                        raw={**raw, "_method": "vision_llm"},
                        warnings=warnings,
                    )
                except LLMError as exc:
                    logger.warning("Vision extraction failed for %s: %s", filename, exc)
                    errors.append(str(exc))
                    warnings.append("AI vision could not read this document; trying a fallback reader.")

            if not is_pdf and not text:
                ocr_text = _ocr_image_bytes(image_bytes or b"")
                if ocr_text and ocr_text.strip():
                    text = ocr_text
                elif ocr_text is None:
                    warnings.append("OCR is not available on this machine.")

            if self.llm_configured and text:
                try:
                    fields, raw = self._llm_fields_from_text(text, filename)
                    return ExtractionOutcome(
                        fields=fields,
                        method="text_llm",
                        provider=f"AI text ({settings.llm_text_model})",
                        raw={**raw, "_method": "text_llm"},
                        warnings=warnings,
                    )
                except LLMError as exc:
                    logger.warning("Text extraction failed for %s: %s", filename, exc)
                    errors.append(str(exc))
                    warnings.append("AI text extraction failed; using the offline reader.")

            if text.strip():
                fields = parse_document_text(text, filename)
                if fields.has_any_data():
                    warnings.append(
                        "Fields were read by the offline reader. Check them carefully before counting."
                    )
                    return ExtractionOutcome(
                        fields=fields,
                        method="ocr_parser" if not is_pdf else "pdf_text_parser",
                        provider="Offline document reader",
                        raw={**fields.model_dump(mode="json"), "_method": "offline_parser"},
                        warnings=warnings,
                    )

            message = (
                "We could not read this document automatically. Enter the fields manually; "
                "your file is safely saved."
            )
            if not self.llm_configured:
                warnings.append("No AI vision key is configured, so automatic image reading is unavailable.")
            return ExtractionOutcome(
                fields=ExtractedFields(),
                method="manual",
                provider="Manual entry",
                raw={"_method": "manual", "_errors": errors},
                error=message,
                warnings=warnings,
                manual_required=True,
            )
        except Exception as exc:  # never let extraction break an upload
            logger.exception("Unexpected extraction failure for %s", filename)
            return ExtractionOutcome(
                fields=ExtractedFields(),
                method="manual",
                provider="Manual entry",
                raw={"_method": "manual"},
                error="The document reader hit an unexpected error. Enter the fields manually.",
                warnings=warnings,
                manual_required=True,
            )
