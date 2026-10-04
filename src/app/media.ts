/**
 * Photo pipeline + storage helpers (Supabase Storage replaces S3/R2 presigned URLs).
 *
 *   file → validate → resize/crop to 720×960 JPEG (~300 KB) → SHA-256
 *        → upload to `student-photos/{school_id}/{student_id}/{sha256}.jpg`
 *        → record metadata via `record_student_photo` RPC (atomic primary swap)
 */
import { supabase } from '@/integrations/supabase/client';

export const PHOTO_BUCKET = 'student-photos';
export const CARD_BUCKET = 'id-cards';

export const PHOTO_TARGET_W = 720;
export const PHOTO_TARGET_H = 960;
export const PHOTO_TARGET_BYTES = 300 * 1024;
export const PHOTO_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const PHOTO_ACCEPT = ['image/*', '.heic', '.heif', 'image/heic', 'image/heif'];

const HEIF_RE = /\.(heic|heif)$/i;
/** HEIC/HEIF photos (iPhone, many Androids) are converted to JPEG in the browser, since only Safari can draw them. */
export async function toDecodable<T extends Blob & { name?: string }>(file: T): Promise<Blob & { name?: string }> {
  const isHeif = /image\/hei[cf]/i.test(file.type) || (!!file.name && HEIF_RE.test(file.name));
  if (!isHeif) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
    const blob = Array.isArray(out) ? out[0] : out;
    return Object.assign(blob, { name: (file.name ?? 'photo').replace(HEIF_RE, '.jpg') });
  } catch {
    throw new UserFacingError('This HEIC/HEIF photo could not be opened. Please try another photo.');
  }
}

export class UserFacingError extends Error {}

/** Translate storage / database / network errors into a readable message. */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof UserFacingError) return err.message;
  const e = err as { message?: string; code?: string; statusCode?: string | number; status?: number } | null;
  const msg = e?.message ?? '';
  const status = Number(e?.statusCode ?? e?.status ?? 0);
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Network problem — check your connection and try again.';
  if (/jwt|expired|not authenticated|invalid claim/i.test(msg) || status === 401)
    return 'Your session has expired. Please sign in again.';
  if (/row-level security|permission|not authorized|unauthorized/i.test(msg) || status === 403)
    return "You don't have permission to access this school's records.";
  if (/payload too large|exceeded the maximum/i.test(msg) || status === 413) return 'The file is too large.';
  if (/duplicate|already exists|unique/i.test(msg) || e?.code === '23505') return 'A record with the same details already exists.';
  return msg || fallback;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new UserFacingError('This browser cannot open this image format (common with TIFF on some devices). Please try another photo or format.')); };
    img.src = url;
  });
}

export interface ProcessedPhoto {
  blob: Blob;
  bytes: ArrayBuffer;
  sha256: string;
  width: number;
  height: number;
}

/** Validate + centre-crop to 3:4 + resize to 720×960 + JPEG at the highest quality ≤ ~300 KB. */
export async function processPhoto(input: Blob & { name?: string }): Promise<ProcessedPhoto> {
  if (input.size > PHOTO_MAX_INPUT_BYTES) throw new UserFacingError('Photo is larger than 20 MB. Please choose a smaller file.');
  const file = await toDecodable(input);
  const type = file.type || '';
  const imageExt = /\.(jpe?g|jfif|pjpeg|pjp|png|apng|webp|gif|bmp|dib|ico|cur|svg|tiff?|avif|heic|heif)$/i;
  if (type && !type.startsWith('image/')) {
    throw new UserFacingError('Unsupported file type. Please choose an image file.');
  }
  if (!type && file.name && !imageExt.test(file.name)) {
    throw new UserFacingError('Unsupported file type. Please choose an image file.');
  }
  if (file.size > PHOTO_MAX_INPUT_BYTES) throw new UserFacingError('Photo is larger than 20 MB. Please choose a smaller file.');
  if (file.size === 0) throw new UserFacingError('The selected file is empty.');

  const img = await loadImageFromBlob(file);
  const srcRatio = img.naturalWidth / img.naturalHeight;
  const dstRatio = PHOTO_TARGET_W / PHOTO_TARGET_H;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (srcRatio > dstRatio) { sw = sh * dstRatio; sx = (img.naturalWidth - sw) / 2; }
  else { sh = sw / dstRatio; sy = (img.naturalHeight - sh) / 2; }

  // Never upscale tiny photos beyond their source resolution.
  const scale = Math.min(1, sw / PHOTO_TARGET_W);
  const w = Math.round(PHOTO_TARGET_W * (scale < 1 ? scale : 1));
  const h = Math.round(PHOTO_TARGET_H * (scale < 1 ? scale : 1));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UserFacingError('Your browser could not process the image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const toBlob = (q: number) => new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new UserFacingError('Image compression failed.'))), 'image/jpeg', q));

  let quality = 0.92;
  let blob = await toBlob(quality);
  while (blob.size > PHOTO_TARGET_BYTES && quality > 0.6) {
    quality -= 0.06;
    blob = await toBlob(quality);
  }
  const bytes = await blob.arrayBuffer();
  return { blob, bytes, sha256: await sha256Hex(bytes), width: w, height: h };
}

/** Upload a processed photo for a student and make it the primary photo. */
export async function uploadStudentPhoto(
  student: { id: string; school_id: string },
  photo: ProcessedPhoto,
  onStage?: (stage: 'checking' | 'uploading' | 'saving') => void,
) {
  onStage?.('checking');
  const { data: existing, error: dupErr } = await supabase
    .from('photos').select('id, is_primary').eq('student_id', student.id).eq('sha256', photo.sha256).maybeSingle();
  if (dupErr) throw dupErr;
  if (existing?.is_primary) throw new UserFacingError('This exact photo is already the current photo for this student.');

  const path = `${student.school_id}/${student.id}/${photo.sha256}.jpg`;
  if (!existing) {
    onStage?.('uploading');
    const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET)
      .upload(path, photo.blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (upErr) throw upErr;
  }
  onStage?.('saving');
  const { data, error } = await supabase.rpc('record_student_photo', {
    _student_id: student.id, _storage_path: path, _size_bytes: photo.blob.size,
    _width: photo.width, _height: photo.height, _sha256: photo.sha256, _content_type: 'image/jpeg',
  });
  if (error) {
    if (!existing) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function signedUrl(bucket: string, path: string | null | undefined, expiresIn = 3600, download?: string) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn, download ? { download } : undefined);
  if (error) return null;
  return data.signedUrl;
}

export async function signedUrls(bucket: string, paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** Download a private object as a data: URL (safe for canvas — no CORS taint). */
export async function storageDataUrl(bucket: string, path: string | null | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return undefined;
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(data);
  });
}

export async function downloadFromStorage(bucket: string, path: string, fileName: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw error ?? new UserFacingError('Download failed.');
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
