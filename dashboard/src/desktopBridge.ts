/**
 * Runtime abstraction so the same React components can either upload files
 * through the web API or read them locally when running inside the Tauri
 * desktop wrapper.
 *
 * Detection is a one-liner: Tauri injects a `__TAURI__` global on window at
 * boot. When absent, every method here throws — callers should gate on
 * `isDesktop()` first.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
interface TauriWindow extends Window {
  __TAURI__?: {
    tauri: { invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
    dialog: {
      open: (opts?: { multiple?: boolean; directory?: boolean; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | string[] | null>;
      save: (opts?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
    };
    fs: {
      readTextFile: (p: string) => Promise<string>;
      readBinaryFile: (p: string) => Promise<Uint8Array>;
    };
    path: { basename: (p: string) => Promise<string>; extname: (p: string) => Promise<string> };
  };
}

const win = (): TauriWindow['__TAURI__'] => (window as TauriWindow).__TAURI__;

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(win());
}

export interface LocalFileEntry {
  name: string;
  path: string;
  size: number;
  stem: string;
  extension: string;
  modifiedMs: number;
}

export async function pickFolder(): Promise<string | null> {
  const t = win();
  if (!t) throw new Error('desktop bridge unavailable');
  const result = await t.dialog.open({ directory: true, multiple: false });
  return typeof result === 'string' ? result : null;
}

export async function pickFile(extensions: string[]): Promise<string | null> {
  const t = win();
  if (!t) throw new Error('desktop bridge unavailable');
  const result = await t.dialog.open({
    directory: false,
    multiple: false,
    filters: [{ name: 'Files', extensions }],
  });
  return typeof result === 'string' ? result : null;
}

export async function pickSaveTarget(defaultName: string, extension: string): Promise<string | null> {
  const t = win();
  if (!t) throw new Error('desktop bridge unavailable');
  return await t.dialog.save({
    defaultPath: defaultName,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
}

export async function listFolder(path: string, extensions?: string[]): Promise<LocalFileEntry[]> {
  const t = win();
  if (!t) throw new Error('desktop bridge unavailable');
  const rows = await t.tauri.invoke<Array<{
    name: string; path: string; size: number; modified_ms: number; stem: string; extension: string;
  }>>('list_folder', { path, extensions: extensions ?? null });
  return rows.map((r) => ({
    name: r.name, path: r.path, size: r.size, stem: r.stem,
    extension: r.extension, modifiedMs: r.modified_ms,
  }));
}

export async function readBytesBase64(path: string): Promise<string> {
  const t = win();
  if (!t) throw new Error('desktop bridge unavailable');
  return await t.tauri.invoke<string>('read_bytes_base64', { path });
}

export async function readBytes(path: string): Promise<Uint8Array> {
  const t = win();
  if (!t) throw new Error('desktop bridge unavailable');
  return await t.fs.readBinaryFile(path);
}

export async function writeBytesBase64(path: string, b64: string): Promise<void> {
  const t = win();
  if (!t) throw new Error('desktop bridge unavailable');
  await t.tauri.invoke('write_bytes_base64', { path, b64 });
}

/** Convert a file path into a `data:` URL so <img> / Konva can render it. */
export async function pathToDataUrl(path: string, mime?: string): Promise<string> {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const guessed = mime ?? (ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream');
  const b64 = await readBytesBase64(path);
  return `data:${guessed};base64,${b64}`;
}
