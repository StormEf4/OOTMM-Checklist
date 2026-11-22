// The OoTMM files the memory reader's layout (src/generated/ram-layout.json) is worked out from. If any of them
// changes, run tools/ram-layout.mjs again; until then the build leaves the memory reader off.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const headerDirs = ['packages/generator/include/combo', 'packages/generator/include/combo/oot', 'packages/generator/include/combo/mm'];
export const RAM_LAYOUT_INPUTS = ['packages/generator/src/link_oot.in', 'packages/generator/src/link_mm.in', 'packages/generator/src/oot/play/play.c', 'packages/generator/src/mm/play/play.c'];

export function ramLayoutHash(ootmm) {
  const h = createHash('sha256');
  const files = [...RAM_LAYOUT_INPUTS];
  for (const d of headerDirs) {
    const dir = path.join(ootmm, d);
    if (existsSync(dir)) for (const f of readdirSync(dir).sort()) if (f.endsWith('.h')) files.push(path.join(d, f));
  }
  for (const f of files) {
    const p = path.join(ootmm, f);
    h.update(f + '\0' + (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '') + '\0');
  }
  return h.digest('hex').slice(0, 16);
}
