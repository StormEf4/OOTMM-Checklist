// The two helpers OoTMM's settings strings use.
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
