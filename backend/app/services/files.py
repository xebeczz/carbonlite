from __future__ import annotations

import hashlib
import io
from pathlib import Path

MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

EXT_BY_MIME = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sniff_mime(content: bytes) -> str | None:
    if content.startswith(b"%PDF"):
        return "application/pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(content) > 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def make_image_preview(source: Path, destination: Path, max_side: int = 1800) -> bool:
    try:
        from PIL import Image, ImageOps

        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode not in ("RGB", "L"):
                background = Image.new("RGB", image.size, (255, 255, 255))
                if image.mode in ("RGBA", "LA", "P"):
                    rgba = image.convert("RGBA")
                    background.paste(rgba, mask=rgba.split()[-1])
                    image = background
                else:
                    image = image.convert("RGB")
            image.thumbnail((max_side, max_side))
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, "JPEG", quality=86, optimize=True)
        return True
    except Exception:
        return False


def image_bytes_as_png(source: Path, max_side: int = 2200) -> bytes | None:
    try:
        from PIL import Image, ImageOps

        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGB")
            image.thumbnail((max_side, max_side))
            buffer = io.BytesIO()
            image.save(buffer, "PNG")
            return buffer.getvalue()
    except Exception:
        return None
