/* Icons the player picks for the item menu in Edit mode. They live on the player's own device, outside the app's
   files, so every later version of the app keeps using them:
   - the Windows app writes each one as <item id>.png in an "icons" folder next to its saved data
   - the phone site and the browser keep them in the browser's own storage (IndexedDB) */

type DesktopIcons = {
  list(): Promise<Record<string, string>>;
  put(id: string, dataUrl: string): Promise<void>;
  remove(id: string): Promise<void>;
  open(): Promise<void>;
};
const desk = (): DesktopIcons | undefined => (globalThis as any).ootmmIcons;

const DB = 'ootmm-icons', STORE = 'icons';
function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((ok, fail) => {
    const t = d.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => ok(req ? req.result : undefined);
    t.onerror = () => fail(t.error);
  });
}

/** Item id to picture, as data URLs. */
export const customIcons = new Map<string, string>();
export const iconFolderAvailable = () => !!desk();

export async function loadIcons() {
  try {
    const all: Record<string, string> = desk()
      ? await desk()!.list()
      : await (async () => {
        const out: Record<string, string> = {};
        const d = await db();
        await new Promise<void>((ok, fail) => {
          const cur = d.transaction(STORE).objectStore(STORE).openCursor();
          cur.onsuccess = () => { const c = cur.result; if (!c) return ok(); out[String(c.key)] = String(c.value); c.continue(); };
          cur.onerror = () => fail(cur.error);
        });
        return out;
      })();
    customIcons.clear();
    for (const [k, v] of Object.entries(all)) customIcons.set(k, v);
  } catch { /* no storage: the drawn icons stay */ }
}

export async function putIcon(id: string, dataUrl: string) {
  if (desk()) await desk()!.put(id, dataUrl);
  else await tx('readwrite', s => s.put(dataUrl, id));
  customIcons.set(id, dataUrl);
}
export async function removeIcon(id: string) {
  if (desk()) await desk()!.remove(id);
  else await tx('readwrite', s => s.delete(id));
  customIcons.delete(id);
}
export async function removeAllIcons() {
  for (const id of [...customIcons.keys()]) await removeIcon(id);
}
export const openIconFolder = () => desk()?.open();

/** Reads a picked picture and shrinks it to at most 128 pixels a side, kept as a PNG. */
export function readIconFile(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 128 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = k < 1 && img.width > 48;
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('not an image')); };
    img.src = url;
  });
}
