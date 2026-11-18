/*
 * Game tracking's catch-up: reads which checks a game's save file says are collected.
 *
 * OoTMM marks every check it gives out in its save (mark.c's Mark_Set), and writes the save to the cartridge's flash,
 * which Project64-EM keeps as a .fla file. Where everything sits in that file comes from OoTMM's own code, worked out by
 * tools/save-layout.mjs into src/generated/save-layout.json. What each kind of check reads mirrors mark.c's Mark_GetOot
 * and Mark_GetMm, which that tool checks are unchanged.
 *
 * Only whether a check is done can be read here, not what was there. Entrances are never read.
 */
import { CHECKS } from '@ootmm/data';
import layout from './generated/save-layout.json';

export type SaveSlot = { slot: number; name: string; collected: Set<string> };
const L = layout as any;
const O = L.offsets as Record<string, number>;
const MAGIC = [0x5a, 0x45, 0x4c, 0x44, 0x41, 0x5a]; /* ZELDAZ, the OoT save's own marker */

/* Project64 may keep the flash in the N64's byte order or swapped by halves or words. The OoT save's marker says which. */
function inN64Order(raw: Uint8Array): Uint8Array | null {
  const swaps: ((i: number) => number)[] = [i => i, i => i ^ 3, i => i ^ 1];
  for (const sw of swaps) {
    for (let s = 0; s < L.files.count; s++) {
      const at = L.files.oot[0] + L.files.oot[1] * s + O.ootNewf;
      if (MAGIC.every((b, k) => raw[sw(at + k)] === b)) {
        if (sw(1) === 1) return raw;
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw[sw(i)];
        return out;
      }
    }
  }
  return null;
}

function fileName(b: Uint8Array, at: number) {
  const N = L.names;
  let s = '';
  for (let i = 0; i < 8; i++) {
    const c = b[at + i];
    if (c >= N.digit && c < N.digit + 10) s += String.fromCharCode(48 + c - N.digit);
    else if (c >= N.upper && c < N.upper + 26) s += String.fromCharCode(65 + c - N.upper);
    else if (c >= N.lower && c < N.lower + 26) s += String.fromCharCode(97 + c - N.lower);
    else if (c === N.space) s += ' ';
    else s += '_';
  }
  return s.trimEnd();
}

export function readSave(raw: Uint8Array): SaveSlot[] | null {
  const b = inN64Order(raw);
  if (!b) return null;
  const u32 = (at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
  const bit32 = (at: number, n: number) => ((u32(at) >>> n) & 1) === 1;
  const bit8 = (at: number, n: number) => ((b[at + (n >> 3)] >> (n & 7)) & 1) === 1;
  const slots: SaveSlot[] = [];
  for (let s = 0; s < L.files.count; s++) {
    const oot = L.files.oot[0] + L.files.oot[1] * s;
    const mm = L.files.mm[0] + L.files.mm[1] * s;
    const cu = L.files.custom[0] + L.files.custom[1] * s;
    if (!MAGIC.every((v, k) => b[oot + O.ootNewf + k] === v) || cu + O.customSize > b.length) continue;
    const ootPerm = (scene: number, field: number) => oot + O.ootPerm + O.ootPermSize * (L.merges.oot[scene] ?? scene) + field;
    const mmPerm = (scene: number, field: number) => mm + O.mmPerm + O.mmPermSize * (L.merges.mm[scene] ?? scene) + field;
    const mmCollectible = (scene: number, id: number) => bit32(mmPerm(scene, O.mmCollectible), id);
    const mmSwitch = (scene: number, id: number) => id >= 0x20 ? bit32(mmPerm(scene, O.mmSwitch1), id & 0x1f) : bit32(mmPerm(scene, O.mmSwitch0), id & 0x1f);
    const xflag = (x: number) => x < O.xflagsSize * 8 && bit8(cu + O.xflags, x);
    const collected = new Set<string>();
    for (const c of CHECKS as any[]) {
      const key = c.key >>> 0, scene = (key >>> 16) & 0xff, room = (key >>> 8) & 0xff, id = key & 0xff;
      let got = false;
      if (c.game === 'oot') {
        switch (c.ov) {
          case 'chest': got = bit32(ootPerm(scene, O.ootChests), id); break;
          case 'collectible': got = bit32(ootPerm(scene, O.ootCollectibles), id); break;
          case 'npc': got = bit8(cu + O.ootNpc, id); break;
          case 'gs': { const g = id > 0xb0 ? id - 0xb0 : id; got = bit32(oot + O.ootGs + (g >> 5) * 4, g & 0x1f); break; }
          case 'cow': got = bit32(cu + O.cows, id); break;
          case 'shop': got = bit8(cu + O.ootShops, id); break;
          case 'scrub': got = bit8(cu + O.ootScrubs, id & 0x7f); break;
          case 'sr': got = bit8(cu + O.ootSr, id & 0x7f); break;
          case 'fish': got = bit8(cu + O.fish, id); break;
          case 'xflag': got = xflag((room << 8) | id); break;
        }
      } else {
        switch (c.ov) {
          case 'chest': got = bit32(mmPerm(scene, O.mmChest), id); break;
          case 'collectible': got = mmCollectible(scene, id); break;
          case 'npc': got = bit8(cu + O.mmNpc, id); break;
          case 'sf': got = id >= 0x20 ? mmSwitch(scene, id) : mmCollectible(scene, id); break;
          case 'cow': got = bit32(cu + O.cows, id); break;
          case 'shop': got = bit8(cu + O.mmShops, id); break;
          case 'xflag': got = xflag((room << 8) | id); break;
        }
      }
      if (got) collected.add(c.location);
    }
    slots.push({ slot: s, name: fileName(b, oot + O.ootName), collected });
  }
  return slots;
}
