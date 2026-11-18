// Checks src/savefile.ts against a stand-in save with flags set the way OoTMM's Mark_Set (mark.c) sets them, for every
// kind of check and both games, including scenes that share flags (MQ dungeons, MM seasons). Run: node tools/savefile-test.mjs
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, OOTMM, aliases, esbuild, plugins } from './paths.mjs';

const r = await esbuild.build({ entryPoints: [path.join(ROOT, 'src/savefile.ts')], bundle: true, write: false, format: 'esm', platform: 'node',
  alias: aliases, plugins, loader: { '.json': 'json' }, logLevel: 'error' });
const { readSave } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
const L = JSON.parse(readFileSync(path.join(ROOT, 'src/generated/save-layout.json'), 'utf8')), O = L.offsets;
const CHECKS = JSON.parse(readFileSync(path.join(OOTMM, 'packages/data/dist/lib/data-checks.json'), 'utf8'));
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!c) fails++; };

const b = new Uint8Array(0x20000);
const or32 = (at, n) => { const v = (((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) | (1 << n)) >>> 0; b.set([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], at); };
const or8 = (at, n) => { b[at + (n >> 3)] |= 1 << (n & 7); };
const s = 1, oot = L.files.oot[0] + L.files.oot[1] * s, mm = L.files.mm[0] + L.files.mm[1] * s, cu = L.files.custom[0] + L.files.custom[1] * s;
[...'ZELDAZ'].forEach((ch, k) => { b[oot + O.ootNewf + k] = ch.charCodeAt(0); });
/* One check of every (game, kind), preferring scenes that merge into another, set with mark.c's setters. */
const picks = new Map();
for (const c of CHECKS) {
  const k = `${c.game} ${c.ov}`, scene = (c.key >>> 16) & 255;
  if (!picks.has(k) || (L.merges[c.game][scene] !== undefined && !picks.get(k).merged)) picks.set(k, { c, merged: L.merges[c.game][scene] !== undefined });
}
const unread = new Set(['oot sf', 'mm gs', 'mm scrub', 'mm sr', 'mm fish']); /* mark.c's Mark_Get* reads nothing for these */
for (const { c } of picks.values()) {
  const key = c.key >>> 0, scene = (key >>> 16) & 255, room = (key >>> 8) & 255, id = key & 255, sc = L.merges[c.game][scene] ?? scene;
  const ootP = f => oot + O.ootPerm + O.ootPermSize * sc + f, mmP = f => mm + O.mmPerm + O.mmPermSize * sc + f;
  switch (`${c.game} ${c.ov}`) {
    case 'oot chest': or32(ootP(O.ootChests), id); break;
    case 'oot collectible': or32(ootP(O.ootCollectibles), id); break;
    case 'oot npc': or8(cu + O.ootNpc, id); break;
    case 'oot gs': { const g = id > 0xb0 ? id - 0xb0 : id; or32(oot + O.ootGs + (g >> 5) * 4, g & 31); break; }
    case 'oot cow': case 'mm cow': or32(cu + O.cows, id); break;
    case 'oot shop': or8(cu + O.ootShops, id); break;
    case 'oot scrub': or8(cu + O.ootScrubs, id & 0x7f); break;
    case 'oot sr': or8(cu + O.ootSr, id & 0x7f); break;
    case 'oot fish': or8(cu + O.fish, id); break;
    case 'oot xflag': case 'mm xflag': or8(cu + O.xflags, (room << 8) | id); break;
    case 'mm chest': or32(mmP(O.mmChest), id); break;
    case 'mm collectible': or32(mmP(O.mmCollectible), id); break;
    case 'mm npc': or8(cu + O.mmNpc, id); break;
    case 'mm shop': or8(cu + O.mmShops, id); break;
    case 'mm sf': if (id >= 0x20) or32(mmP((id & 0x3f) >= 0x20 ? O.mmSwitch1 : O.mmSwitch0), id & 0x1f); else or32(mmP(O.mmCollectible), id); break;
  }
}
const slots = readSave(b);
ok('one saved game found, in the second file', slots?.length === 1 && slots[0].slot === 1);
const got = slots?.[0]?.collected ?? new Set();
for (const [k, { c, merged }] of picks) {
  if (unread.has(k)) continue;
  ok(`${k}${merged ? ' (shared scene)' : ''}`, got.has(c.location), c.location);
}
ok('no stray checks beyond what was set (and any sharing the same flag)', got.size <= picks.size * 4, String(got.size));
ok('a save file with no saved game yet finds nothing', !readSave(new Uint8Array(0x20000).fill(0xff))?.length);
ok('a file that isn\'t a save is refused', readSave(new Uint8Array(100)) === null);
if (fails) process.exit(1);
