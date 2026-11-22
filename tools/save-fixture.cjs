// A stand-in Project64-EM save file for the browser tests, shared by ui-gamefeed.cjs and ui-save-seeds.cjs.
const fs = require('fs'), path = require('path');
/* A stand-in save file (Project64-EM's .fla), laid out as src/generated/save-layout.json says, with flags set the way
   OoTMM's Mark_Set (mark.c) sets them. */
const OOTMM = process.env.OOTMM_SRC || path.join(__dirname, '../../OoTMM-v33');
const LAYOUT = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/generated/save-layout.json'), 'utf8'));
const CHECKS = JSON.parse(fs.readFileSync(path.join(OOTMM, 'packages/data/dist/lib/data-checks.json'), 'utf8'));
function makeSave(slots, swap = i => i) {
  const L = LAYOUT, O = L.offsets, b = new Uint8Array(0x20000);
  const or32 = (at, n) => { const v = ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) | (1 << n); b[at] = v >>> 24; b[at + 1] = (v >>> 16) & 255; b[at + 2] = (v >>> 8) & 255; b[at + 3] = v & 255; };
  const or8 = (at, n) => { b[at + (n >> 3)] |= 1 << (n & 7); };
  slots.forEach(({ name, locations }, s) => {
    const oot = L.files.oot[0] + L.files.oot[1] * s, mm = L.files.mm[0] + L.files.mm[1] * s, cu = L.files.custom[0] + L.files.custom[1] * s;
    [...'ZELDAZ'].forEach((ch, k) => { b[oot + O.ootNewf + k] = ch.charCodeAt(0); });
    for (let k = 0; k < 8; k++) b[oot + O.ootName + k] = L.names.space;
    [...name].forEach((ch, k) => { b[oot + O.ootName + k] = ch.charCodeAt(0) - 65 + L.names.upper; });
    for (const loc of locations) {
      const c = CHECKS.find(x => x.location === loc), key = c.key >>> 0, scene = (key >>> 16) & 255, room = (key >>> 8) & 255, id = key & 255;
      const op = (L.merges[c.game][scene] ?? scene);
      if (c.ov === 'xflag') or8(cu + O.xflags, (room << 8) | id);
      else if (c.game === 'oot' && c.ov === 'chest') or32(oot + O.ootPerm + O.ootPermSize * op + O.ootChests, id);
      else if (c.game === 'mm' && c.ov === 'chest') or32(mm + O.mmPerm + O.mmPermSize * op + O.mmChest, id);
      else if (c.ov === 'npc') or8(cu + (c.game === 'oot' ? O.ootNpc : O.mmNpc), id);
      else if (c.ov === 'shop') or8(cu + (c.game === 'oot' ? O.ootShops : O.mmShops), id);
      else throw new Error('test save: no setter for ' + c.game + ' ' + c.ov);
    }
  });
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[swap(i)] = b[i];
  return Buffer.from(out).toString('base64');
}

module.exports = { makeSave, CHECKS, LAYOUT };
