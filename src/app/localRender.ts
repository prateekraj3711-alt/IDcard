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
import type { TemplateLayout, TemplateElement } from '@/app/types';

export interface RenderSubject {
  bindings: Record<string, string | undefined>;
  photoDataUrl?: string;       // data: URL for the student's local photo
  signatureDataUrl?: string;   // organization's authorised signature
  logoDataUrl?: string;        // organization's logo
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

/** Minimum print resolution for every rendered card. */
export const MIN_DPI = 500;
/** ISO/IEC 7810 ID-1 card, in millimetres. */
export const CARD_MM = { short: 54, long: 86 };

export function cardSizeMm(layout: Pick<TemplateLayout, 'width' | 'height'>) {
  return layout.width >= layout.height
    ? { w: CARD_MM.long, h: CARD_MM.short }
    : { w: CARD_MM.short, h: CARD_MM.long };
}

/** Pixel scale so the card is drawn at >= MIN_DPI at 54x86 mm. */
export function renderScale(layout: TemplateLayout): number {
  const { w } = cardSizeMm(layout);
  const targetPx = Math.ceil((w / 25.4) * Math.max(MIN_DPI, layout.dpi ?? 0));
  return Math.max(1, targetPx / layout.width);
}

function fontFor(el: TemplateElement, size: number) {
  const weight = el.fontWeight === 'bold' ? '700' : '400';
  return `${weight} ${size}px ${el.fontFamily ?? 'Inter, sans-serif'}`;
}

/** Break text into lines that fit `maxWidth` (words, then characters for very long words). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width <= maxWidth || !line) {
        if (!line && ctx.measureText(word).width > maxWidth) {
          // hard-break a single over-long word
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) { out.push(chunk); chunk = ch; }
            else chunk += ch;
          }
          line = chunk;
        } else line = trial;
      } else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

export function textFor(el: TemplateElement, subject: RenderSubject): string {
  const value = el.text || (el.binding ? subject.bindings[el.binding] : '') || '';
  if (!el.prefix) return String(value);
  return value ? `${el.prefix} ${value}` : '';
}

interface TextPlan { lines: string[]; size: number; lineH: number; height: number }

function planText(ctx: CanvasRenderingContext2D, el: TemplateElement, text: string, maxH?: number): TextPlan {
  let size = el.fontSize ?? 14;
  const wrap = el.wrap !== false;
  const w = Math.max(1, el.width ?? 0);
  const minSize = Math.max(6, size * (el.pinned ? 0.5 : 0.7));
  // Pinned fields sit next to labels printed on the design: prefer one line,
  // shrinking a little, before wrapping.
  if (el.pinned && w > 1) {
    for (let s = size; s >= size * 0.65; s -= 1) {
      ctx.font = fontFor(el, s);
      if (ctx.measureText(text).width <= w) {
        const lineH = s * (el.lineHeight ?? 1.2);
        return { lines: [text], size: s, lineH, height: lineH };
      }
    }
  }
  for (;;) {
    ctx.font = fontFor(el, size);
    const lineH = size * (el.lineHeight ?? 1.2);
    let lines = wrap && w > 1 ? wrapLines(ctx, text, w) : [text];
    if (el.maxLines && lines.length > el.maxLines) {
      lines = lines.slice(0, el.maxLines);
    }
    const height = lines.length * lineH;
    if (maxH === undefined || height <= maxH || size <= minSize) return { lines, size, lineH, height };
    size = Math.max(minSize, size - 1);
  }
}

/**
 * Lay out text blocks so wrapped text never overlaps fields beneath it:
 * every element that sits below a growing text block and shares horizontal
 * space with it is pushed down by the extra height. If that would run off
 * the card, the block's font shrinks (last resort).
 */
export function layoutElements(
  ctx: CanvasRenderingContext2D, layout: TemplateLayout, subject: RenderSubject,
): Array<{ el: TemplateElement; y: number; plan?: TextPlan; text?: string }> {
  const els = (layout.elements ?? []).map((el) => ({ el, y: el.y ?? 0 }));
  const order = [...els].sort((a, b) => a.y - b.y);
  const result = new Map<TemplateElement, { y: number; plan?: TextPlan; text?: string }>();
  for (const item of order) {
    const { el } = item;
    if (el.kind !== 'text') { result.set(el, { y: item.y }); continue; }
    const text = textFor(el, subject);
    let room = layout.height - item.y;
    if (el.pinned) {
      // Never move anything: fit inside the gap down to the next field below.
      const x0 = el.x ?? 0, x1 = x0 + (el.width ?? 0);
      for (const o of order) {
        if (o === item) continue;
        const ox0 = o.el.x ?? 0, ox1 = ox0 + (o.el.width ?? 0);
        if (ox0 < x1 && ox1 > x0 && o.y > item.y + 1) room = Math.min(room, o.y - item.y);
      }
      room = Math.max(room, el.height ?? 0);
    }
    const plan = planText(ctx, el, text, room);
    result.set(el, { y: item.y, plan, text });
    if (el.pinned) continue;
    const boxH = Math.max(el.height ?? 0, (el.fontSize ?? 14) * (el.lineHeight ?? 1.2));
    const extra = plan.height - boxH;
    if (extra <= 0) continue;
    const x0 = el.x ?? 0, x1 = x0 + (el.width ?? 0);
    for (const other of order) {
      if (other === item || other.el.locked) continue;
      const ox0 = other.el.x ?? 0, ox1 = ox0 + (other.el.width ?? 0);
      const overlapsX = ox0 < x1 && ox1 > x0;
      if (overlapsX && other.y >= item.y + Math.min(boxH, 1) && !result.has(other.el)) other.y += extra;
    }
  }
  return els.map(({ el }) => ({ el, ...result.get(el)! }));
}

async function drawElement(
  ctx: CanvasRenderingContext2D,
  el: TemplateElement,
  subject: RenderSubject,
  y: number,
  plan?: TextPlan,
) {
  const x = el.x ?? 0, w = el.width ?? 0, h = el.height ?? 0;

  if (el.kind === 'text') {
    if (!plan) return;
    ctx.fillStyle = el.fill ?? '#111111';
    ctx.font = fontFor(el, plan.size);
    ctx.textBaseline = 'top';
    const align = el.align ?? 'left';
    ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
    const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    // Pinned values: centre the first line on the printed label's line.
    const slot = Math.min(h, (el.fontSize ?? 14) * 1.35);
    const dy = el.pinned ? Math.max(0, (slot - plan.size) / 2) : 0;
    plan.lines.forEach((line, i) => ctx.fillText(line, anchorX, y + dy + i * plan.lineH));
    return;
  }

  if (el.kind === 'image') {
    let src: string | undefined;
    const isSign = /signature$/.test(el.binding ?? '');
    const isLogo = /\.logo$/.test(el.binding ?? '');
    if (el.binding === 'photo' && subject.photoDataUrl) src = subject.photoDataUrl;
    else if (isSign && subject.signatureDataUrl) src = subject.signatureDataUrl;
    else if (isLogo && subject.logoDataUrl) src = subject.logoDataUrl;
    else if (el.url) src = el.url;
    else if (el.src) src = el.src;
    if (!src) { if (!isSign && !isLogo) { ctx.strokeStyle = '#888'; ctx.strokeRect(x, y, w, h); } return; }
    try {
      const img = await loadImage(src);
      if (isSign || isLogo) {
        // Keep proportions; signatures sit on the caption line, centred.
        const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
        ctx.drawImage(img, x + (w - dw) / 2, y + (isSign ? h - dh : (h - dh) / 2), dw, dh);
      } else ctx.drawImage(img, x, y, w, h);
    } catch { ctx.strokeStyle = '#888'; ctx.strokeRect(x, y, w, h); }
    return;
  }

  if (el.kind === 'qr') {
    const payload = subject.qrPayload ?? {};
    const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      errorCorrectionLevel: 'M', margin: 0, width: Math.ceil(Math.max(w, h) * 4),
    });
    const img = await loadImage(dataUrl);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    return;
  }

  if (el.kind === 'barcode') {
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);
  }
}

/** Renders at >= 500 DPI (template coordinates are scaled up as needed). */
export async function renderCardCanvas(
  layout: TemplateLayout,
  subject: RenderSubject,
  opts: { scale?: number } = {},
): Promise<HTMLCanvasElement> {
  const scale = opts.scale ?? renderScale(layout);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.scale(scale, scale);

  ctx.fillStyle = layout.background || '#ffffff';
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (layout.background_image?.url) {
    try {
      const bg = await loadImage(layout.background_image.url);
      ctx.drawImage(bg, 0, 0, layout.width, layout.height);
    } catch { /* bg optional */ }
  }

  for (const item of layoutElements(ctx, layout, subject)) {
    await drawElement(ctx, item.el, subject, item.y, item.plan);
  }
  return canvas;
}

export async function renderCardPng(
  layout: TemplateLayout,
  subject: RenderSubject,
  opts: { scale?: number } = {},
): Promise<Blob> {
  const canvas = await renderCardCanvas(layout, subject, opts);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png', 1.0);
  });
}

const A4_MM = { w: 210, h: 297 };
export const CARDS_PER_SHEET = 10;

/**
 * PDF bundle. Cards are always 54x86 mm at >= 500 DPI.
 * 'a4-sheet' puts exactly 10 cards per A4 page with cut marks:
 * landscape cards → A4 portrait, 2x5; portrait cards → A4 landscape, 5x2.
 */
export async function renderBundlePdf(
  layout: TemplateLayout,
  subjects: RenderSubject[],
  opts: { mode: 'single' | 'a4-sheet'; dpi?: number } = { mode: 'a4-sheet' },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const card = cardSizeMm(layout);
  const mmToPt = (mm: number) => (mm / 25.4) * 72;

  if (opts.mode === 'single') {
    for (const subject of subjects) {
      const png = await renderCardPng(layout, subject);
      const embed = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
      const page = pdf.addPage([mmToPt(card.w), mmToPt(card.h)]);
      page.drawImage(embed, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    }
    return await pdf.save();
  }

  const landscapeCard = card.w > card.h;
  const sheet = landscapeCard ? { w: A4_MM.w, h: A4_MM.h } : { w: A4_MM.h, h: A4_MM.w };
  const cols = landscapeCard ? 2 : 5;
  const rows = landscapeCard ? 5 : 2;
  const gap = 3;
  const gridW = cols * card.w + (cols - 1) * gap;
  const gridH = rows * card.h + (rows - 1) * gap;
  const left = (sheet.w - gridW) / 2;
  const top = (sheet.h - gridH) / 2;
  const mark = 2;

  for (let i = 0; i < subjects.length; i += CARDS_PER_SHEET) {
    const page = pdf.addPage([mmToPt(sheet.w), mmToPt(sheet.h)]);
    const batch = subjects.slice(i, i + CARDS_PER_SHEET);
    for (let j = 0; j < batch.length; j++) {
      const col = j % cols, row = Math.floor(j / cols);
      const xMm = left + col * (card.w + gap);
      const yMm = sheet.h - (top + row * (card.h + gap)) - card.h;
      const png = await renderCardPng(layout, batch[j]);
      const embed: PDFImage = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
      page.drawImage(embed, { x: mmToPt(xMm), y: mmToPt(yMm), width: mmToPt(card.w), height: mmToPt(card.h) });
      // corner cut marks, outside the card
      const corners: Array<[number, number, number, number]> = [
        [xMm, yMm, -1, -1], [xMm + card.w, yMm, 1, -1], [xMm, yMm + card.h, -1, 1], [xMm + card.w, yMm + card.h, 1, 1],
      ];
      for (const [cx, cy, dx, dy] of corners) {
        page.drawLine({ start: { x: mmToPt(cx + dx * 0.5), y: mmToPt(cy) }, end: { x: mmToPt(cx + dx * (0.5 + mark)), y: mmToPt(cy) }, thickness: 0.3 });
        page.drawLine({ start: { x: mmToPt(cx), y: mmToPt(cy + dy * 0.5) }, end: { x: mmToPt(cx), y: mmToPt(cy + dy * (0.5 + mark)) }, thickness: 0.3 });
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
