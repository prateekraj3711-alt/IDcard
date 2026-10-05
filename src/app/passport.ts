// Passport-photo helper: finds the face, crops head-and-shoulders 3:4 and paints the
// background white. Uses MediaPipe (wasm, loaded on first use). Falls back to a plain
// centre crop if the models can't load or no face is found.
import type { FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

let models: Promise<{ face: FaceDetector; seg: ImageSegmenter }> | null = null;
function loadModels() {
  if (!models) {
    models = (async () => {
      const v = await import('@mediapipe/tasks-vision');
      const fs = await v.FilesetResolver.forVisionTasks(WASM);
      const [face, seg] = await Promise.all([
        v.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'IMAGE' }),
        v.ImageSegmenter.createFromOptions(fs, { baseOptions: { modelAssetPath: SEG_MODEL }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false }),
      ]);
      return { face, seg };
    })();
    models.catch(() => { models = null; });
  }
  return models;
}
/** Start downloading models early (e.g. when the camera opens). */
export const preloadPassportModels = () => { loadModels().catch(() => undefined); };

export type Box = { x: number; y: number; w: number; h: number };

/** 3:4 crop around a face box, clamped to the image. */
export function passportBox(face: Box | null, W: number, H: number): Box {
  let h: number, cx: number, top: number;
  if (face) { h = face.h * 2.3; cx = face.x + face.w / 2; top = face.y - face.h * 0.6; }
  else { h = Math.min(H, (W * 4) / 3); cx = W / 2; top = (H - h) / 2; }
  let w = (h * 3) / 4;
  if (w > W) { w = W; h = (w * 4) / 3; }
  if (h > H) { h = H; w = (h * 3) / 4; }
  const x = Math.min(Math.max(0, cx - w / 2), W - w);
  const y = Math.min(Math.max(0, top), H - h);
  return { x, y, w, h };
}

export async function makePassportPhoto(src: HTMLCanvasElement, opts: { whiteBackground: boolean; autoCrop: boolean }): Promise<HTMLCanvasElement> {
  const W = src.width, H = src.height;
  const work = document.createElement('canvas');
  work.width = W; work.height = H;
  const ctx = work.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  let face: Box | null = null;
  try {
    if (opts.whiteBackground || opts.autoCrop) {
      const m = await loadModels();
      if (opts.autoCrop) {
        const d = m.face.detect(src).detections
          .map((x) => x.boundingBox).filter(Boolean)
          .sort((a, b) => b!.width * b!.height - a!.width * a!.height)[0];
        if (d) face = { x: d.originX, y: d.originY, w: d.width, h: d.height };
      }
      if (opts.whiteBackground) {
        const res = m.seg.segment(src);
        const mask = res.confidenceMasks?.[0]?.getAsFloat32Array();
        if (mask && mask.length === W * H) {
          const img = ctx.getImageData(0, 0, W, H);
          const p = img.data;
          for (let i = 0; i < mask.length; i++) {
            const a = Math.min(1, Math.max(0, (mask[i] - 0.3) / 0.4)); // soft edge
            const k = i * 4;
            p[k] = p[k] * a + 255 * (1 - a);
            p[k + 1] = p[k + 1] * a + 255 * (1 - a);
            p[k + 2] = p[k + 2] * a + 255 * (1 - a);
          }
          ctx.putImageData(img, 0, 0);
        }
        res.close?.();
      }
    }
  } catch {
    // models unavailable — keep the original pixels
  }
  const b = opts.autoCrop ? passportBox(face, W, H) : passportBox(null, W, H);
  const out = document.createElement('canvas');
  const scale = Math.min(1, 720 / b.w);
  out.width = Math.round(b.w * scale); out.height = Math.round(b.h * scale);
  const o = out.getContext('2d')!;
  o.fillStyle = '#ffffff'; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(work, b.x, b.y, b.w, b.h, 0, 0, out.width, out.height);
  return out;
}
