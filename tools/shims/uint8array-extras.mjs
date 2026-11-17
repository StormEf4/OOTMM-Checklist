// The helpers OoTMM's settings strings use, plus the one its item code (gi, for game tracking) brings along.
export function uint8ArrayToBase64(bytes, { urlSafe = false } = {}) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const out = btoa(bin);
  return urlSafe ? out.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') : out;
}
export function base64ToUint8Array(str) {
  const clean = str.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(clean.padEnd(clean.length + (4 - clean.length % 4) % 4, '='));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
export function concatUint8Arrays(arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) { out.set(a, at); at += a.length; }
  return out;
}
