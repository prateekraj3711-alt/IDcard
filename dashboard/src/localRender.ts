/**
 * Local canvas-based ID card renderer + PDF bundler.
 *
 * Used from the desktop app (and the web, when the operator uploads a
 * small batch) so we don't need a server-side render worker for the
 * common case. Renders each card at the template's native pixel
 * resolution — a 500 DPI portrait CR80 template stays at 1063×1687 px
 * on the output PNG.
 */

import { PDFDocument, PDFImage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { TemplateLayout, TemplateElement } from '@/types';

export interface RenderSubject {
  bindings: Record<string, string | undefined>;
  photoDataUrl?: string;       // data: URL for the student's local photo
  qrPayload?: Record<string, unknown>;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src.slice(0, 64)}…`));
    img.src = src;
  });
}

async function drawElement(
  ctx: CanvasRenderingContext2D,
  el: TemplateElement,
  subject: RenderSubject,
) {
  const x = el.x ?? 0, y = el.y ?? 0, w = el.width ?? 0, h = el.height ?? 0;

  if (el.kind === 'text') {
    const text = el.text
      ?? (el.binding ? (subject.bindings[el.binding] ?? '') : '')
      ?? el.label
      ?? '';
    const size = el.fontSize ?? 14;
    const family = el.fontFamily ?? 'Inter, sans-serif';
    ctx.fillStyle = el.fill ?? '#111111';
    ctx.font = `${size}px ${family}`;
    ctx.textBaseline = 'top';
    const align = el.align ?? 'left';
    ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
    const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    ctx.fillText(String(text), anchorX, y);
    return;
  }

  if (el.kind === 'image') {
    let src: string | undefined;
    if (el.binding === 'photo' && subject.photoDataUrl) src = subject.photoDataUrl;
    else if (el.url) src = el.url;
    else if (el.src) src = el.src;
    if (!src) {
      ctx.strokeStyle = '#888';
      ctx.strokeRect(x, y, w, h);
      return;
    }
    try {
      const img = await loadImage(src);
      ctx.drawImage(img, x, y, w, h);
    } catch {
      ctx.strokeStyle = '#888';
      ctx.strokeRect(x, y, w, h);
    }
    return;
  }

  if (el.kind === 'qr') {
    const payload = subject.qrPayload ?? {};
    const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: Math.max(w, h),
    });
    const img = await loadImage(dataUrl);
    ctx.drawImage(img, x, y, w, h);
    return;
  }

  if (el.kind === 'barcode') {
    // Placeholder — production would use jsbarcode or bwip-js.
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);
    return;
  }
}

export async function renderCardCanvas(
  layout: TemplateLayout,
  subject: RenderSubject,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  ctx.fillStyle = layout.background || '#ffffff';
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (layout.background_image?.url) {
    try {
      const bg = await loadImage(layout.background_image.url);
      ctx.drawImage(bg, 0, 0, layout.width, layout.height);
    } catch { /* fall through — bg optional */ }
  }

  for (const el of layout.elements ?? []) {
    await drawElement(ctx, el, subject);
  }
  return canvas;
}

export async function renderCardPng(
  layout: TemplateLayout,
  subject: RenderSubject,
): Promise<Blob> {
  const canvas = await renderCardCanvas(layout, subject);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
      1.0,
    );
  });
}

/** A4 sheet layout — grid of card thumbnails for print. */
const A4_MM = { w: 210, h: 297 };
const CUT_MARGIN_MM = 8;

export async function renderBundlePdf(
  layout: TemplateLayout,
  subjects: RenderSubject[],
  opts: { mode: 'single' | 'a4-sheet'; dpi?: number } = { mode: 'a4-sheet' },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const dpi = opts.dpi ?? layout.dpi ?? 300;
  const cardWmm = (layout.width / dpi) * 25.4;
  const cardHmm = (layout.height / dpi) * 25.4;

  const mmToPt = (mm: number) => (mm / 25.4) * 72;

  if (opts.mode === 'single') {
    for (const subject of subjects) {
      const png = await renderCardPng(layout, subject);
      const bytes = new Uint8Array(await png.arrayBuffer());
      const embed = await pdf.embedPng(bytes);
      const page = pdf.addPage([mmToPt(cardWmm), mmToPt(cardHmm)]);
      page.drawImage(embed, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    }
  } else {
    // A4 sheet — fit as many as possible in a grid with a cut margin
    const availW = A4_MM.w - CUT_MARGIN_MM * 2;
    const availH = A4_MM.h - CUT_MARGIN_MM * 2;
    const cols = Math.max(1, Math.floor(availW / (cardWmm + 2)));
    const rows = Math.max(1, Math.floor(availH / (cardHmm + 2)));
    const perPage = cols * rows;

    for (let i = 0; i < subjects.length; i += perPage) {
      const page = pdf.addPage([mmToPt(A4_MM.w), mmToPt(A4_MM.h)]);
      const batch = subjects.slice(i, i + perPage);
      for (let j = 0; j < batch.length; j++) {
        const col = j % cols;
        const row = Math.floor(j / cols);
        const xMm = CUT_MARGIN_MM + col * (cardWmm + 2);
        const yMmFromTop = CUT_MARGIN_MM + row * (cardHmm + 2);
        // pdf-lib origin is bottom-left; flip:
        const yMm = A4_MM.h - yMmFromTop - cardHmm;
        const png = await renderCardPng(layout, batch[j]);
        const bytes = new Uint8Array(await png.arrayBuffer());
        const embed: PDFImage = await pdf.embedPng(bytes);
        page.drawImage(embed, {
          x: mmToPt(xMm),
          y: mmToPt(yMm),
          width: mmToPt(cardWmm),
          height: mmToPt(cardHmm),
        });
      }
    }
  }
  return await pdf.save();
}

/** Convert Uint8Array to base64 (no external dep). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
