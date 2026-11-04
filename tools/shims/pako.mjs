// OoTMM uses pako 3's `toText` option. This keeps it working on any pako version.
import * as real from 'pako-real';
const lib = real.default ?? real;
const wrap = fn => (data, opts = {}) => {
  const { toText, ...rest } = opts;
  const out = fn(data, rest);
  return toText ? new TextDecoder().decode(out) : out;
};
export const inflate = wrap(lib.inflate);
export const inflateRaw = wrap(lib.inflateRaw);
export const deflate = (d, o) => lib.deflate(typeof d === 'string' ? new TextEncoder().encode(d) : d, o);
export const deflateRaw = (d, o) => lib.deflateRaw(typeof d === 'string' ? new TextEncoder().encode(d) : d, o);
