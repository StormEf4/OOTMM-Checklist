// The OoTMM files the save layout (src/generated/save-layout.json) is worked out from. If any of them changes, the
// layout needs working out again with tools/save-layout.mjs; until then the app leaves save file catch-up off.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const headerDirs = ['packages/generator/include/combo', 'packages/generator/include/combo/oot', 'packages/generator/include/combo/mm'];
export const SAVE_LAYOUT_INPUTS = [
  'packages/generator/src/common/save.c', 'packages/generator/src/common/mark.c', 'packages/generator/src/common/play.c',
  'packages/generator/src/common/xflags.c', 'packages/generator/include/combo/oot/message.h', 'packages/data/dist/include/combo/data/xflags.h', 'packages/data/dist/lib/data-scenes.json',
];

export function saveLayoutHash(ootmm) {
  const h = createHash('sha256');
  const files = [...SAVE_LAYOUT_INPUTS];
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
