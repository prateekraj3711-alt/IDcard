"""
Pillow-based card renderer.

Composites the template background image + typed field values + QR
codes at the layout's native pixel size, so a 500 DPI source template
produces a 500 DPI PNG with no downsampling anywhere in the pipeline.

Used by:
- IdCardService.render_preview (dashboard preview panel)
- IdCardJobService (bulk generation — Celery worker in production)
"""
from __future__ import annotations

import io
import json
from typing import Any

import qrcode
from PIL import Image, ImageDraw, ImageFont

from app.core.config import settings
from app.infrastructure.storage.s3 import get_s3_client


_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "arial.ttf",
)


def _load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _fetch_object(bucket: str, key: str) -> bytes | None:
    try:
        obj = get_s3_client().get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()
    except Exception:
        return None


def _resolve(binding: str | None, subject: dict[str, Any]) -> str:
    if not binding:
        return ""
    if binding == "photo" or binding == "qr" or binding == "barcode":
        return ""   # rendered separately
    # Dot path against the flat subject dict; falls back to empty string.
    return str(subject.get(binding, "") or "")


def render_card_png(
    layout: dict[str, Any],
    subject: dict[str, Any],
    *,
    photo_bytes: bytes | None = None,
    background_bytes: bytes | None = None,
    qr_payload: dict[str, Any] | None = None,
    barcode_payload: str | None = None,
) -> bytes:
    """Return a PNG of the finished card at the layout's native pixel size.

    `subject` is a flat dict keyed by binding string, e.g.
        {"student.name": "Aarav Verma",
         "student.enrollment_no": "DPS2025-0421",
         "student.class_section": "Grade 5 - A",
         "school.name": "Delhi Public School"}
    """
    width = int(layout.get("width") or 1062)
    height = int(layout.get("height") or 1687)
    dpi = int(layout.get("dpi") or 500)

    # Base canvas — either the imported background image (at native size) or
    # a solid background colour.
    if background_bytes is None:
        bg = layout.get("background_image")
        if isinstance(bg, dict) and bg.get("storage_key"):
            background_bytes = _fetch_object(settings.s3_bucket_idcards, bg["storage_key"])

    if background_bytes:
        canvas = Image.open(io.BytesIO(background_bytes)).convert("RGBA")
        if canvas.size != (width, height):
            # Only resize if the layout was manually adjusted after import.
            canvas = canvas.resize((width, height), Image.LANCZOS)
    else:
        canvas = Image.new("RGBA", (width, height), layout.get("background") or "#ffffff")

    draw = ImageDraw.Draw(canvas)

    for el in layout.get("elements") or []:
        kind = el.get("kind")
        x, y = int(el.get("x") or 0), int(el.get("y") or 0)
        w, h = int(el.get("width") or 0), int(el.get("height") or 0)

        if kind == "text":
            text = el.get("text") or _resolve(el.get("binding"), subject) or (el.get("label") or "")
            font_size = int(el.get("fontSize") or 14)
            font = _load_font(font_size)
            fill = el.get("fill") or "#111111"
            draw.text((x, y), text, fill=fill, font=font)

        elif kind == "image":
            binding = el.get("binding")
            src_bytes: bytes | None = None
            if binding == "photo" and photo_bytes:
                src_bytes = photo_bytes
            elif el.get("storage_key"):
                src_bytes = _fetch_object(settings.s3_bucket_idcards, el["storage_key"])
            if src_bytes:
                try:
                    im = Image.open(io.BytesIO(src_bytes)).convert("RGBA")
                    im = im.resize((max(1, w), max(1, h)), Image.LANCZOS)
                    canvas.paste(im, (x, y), im)
                except Exception:
                    draw.rectangle((x, y, x + w, y + h), outline="#888", width=2)
            else:
                draw.rectangle((x, y, x + w, y + h), outline="#888", width=2)

        elif kind == "qr":
            payload = qr_payload if el.get("binding") == "qr" else None
            if payload:
                qr_img = qrcode.make(json.dumps(payload, separators=(",", ":")))
                qr_img = qr_img.convert("RGBA").resize((max(1, w), max(1, h)), Image.NEAREST)
                canvas.paste(qr_img, (x, y), qr_img)

        elif kind == "barcode":
            # Barcode rendering left to the worker (python-barcode). For preview,
            # draw a placeholder rectangle so positioning is still verifiable.
            draw.rectangle((x, y, x + w, y + h), outline="#333", width=1)

    out = io.BytesIO()
    canvas.convert("RGB").save(out, "PNG", dpi=(dpi, dpi), optimize=True)
    return out.getvalue()
