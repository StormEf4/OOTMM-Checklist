// Works out the few spots in the game's memory that game tracking's memory reader looks at, from OoTMM's own code.
// Writes src/generated/ram-layout.json, which the Windows app's reader (desktop/memreader.js) and the entrance logging
// (src/entrance-feed.ts) use.
//
// The reader only ever looks at:
// - each game's save context name tag ("ZELDAZ" in OoT, "ZELDA3" in MM), to find the game's memory and tell which game
//   is running;
// - each game's "grotto data" (gGrottoData in OoTMM, one byte), the number a grotto hole sets as Link drops in, which says which
//   of the plain grottos it was;
// - each game's ocarina note buffer (the last notes played, as the free-play staff shows them), its length, and the
//   note each button plays, which say which warp song was just played.
// It never reads OoTMM's entrance table or anything else that says where a door leads.
//
// Where the save contexts sit comes from OoTMM's link_oot.in and link_mm.in. Which field gGrottoData is comes from
// OoTMM's headers, and its offset from compiling those headers for the N64 (as tools/save-layout.mjs does; bool is
// spelled out for older compilers, which doesn't change any layout). Which number
// means which grotto comes from Play_EntranceForOverride in OoTMM's play.c files. The ocarina buffer's place is in the
// link files too. Each warp song's buttons come from OoTMM's MM song list (src/mm/ocarina.c, the same songs OoT plays),
// and which warp each song is from the order OoTMM writes its warp song table in (randomizerWarps in config.ts).
//
// Needs mips-linux-gnu-gcc (apt install gcc-mips-linux-gnu) and OoTMM's ultralib (OoTMM's scripts/deps.sh). Run:
// node tools/ram-layout.mjs
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ROOT, OOTMM } from './paths.mjs';
import { ramLayoutHash, RAM_LAYOUT_INPUTS } from './ram-layout-hash.mjs';

const gen = path.join(OOTMM, 'packages/generator');
const read = f => readFileSync(path.join(gen, f), 'utf8');
const need = (cond, what) => { if (!cond) throw new Error(`OoTMM changed: ${what}. Update tools/ram-layout.mjs to match.`); };

/* Where each game's save context sits in memory. */
const linkAddr = (file, sym) => { const m = read(file).match(new RegExp(`^${sym}\\s*=\\s*(0x[0-9a-fA-F]+);`, 'm')); need(m, `${sym} in ${file}`); return parseInt(m[1], 16); };
const ctx = { oot: linkAddr('src/link_oot.in', 'gSaveContext'), mm: linkAddr('src/link_mm.in', 'gSaveContext') };

/* Which save context field is gGrottoData in each game. */
const grottoField = (file) => { const m = read(file).match(/#\s*define gGrottoData\s+\(gSaveContext\.([\w.[\]]+)\)/); need(m, `gGrottoData in ${file}`); return m[1]; };
const grotto = { oot: grottoField('include/combo/oot/save.h'), mm: grottoField('include/combo/misc.h') };

/* Which grotto data number means which plain grotto, from Play_EntranceForOverride. */
const codes = (file, game) => {
  const src = read(file);
  const fn = src.slice(src.indexOf('u32 Play_EntranceForOverride('));
  const sw = fn.slice(fn.indexOf(`case ENTR_${game}_GROTTO_TYPE_GENERIC:`), fn.indexOf('UNREACHABLE();', fn.indexOf(`case ENTR_${game}_GROTTO_TYPE_GENERIC:`)));
  need(/switch \(gGrottoData & 0x1f\)/.test(sw), `${game} generic grottos in ${file}`);
  const out = {};
  for (const [, n, e] of sw.matchAll(/case (0x[0-9a-fA-F]+): return ENTR_(\w+);/g)) out[parseInt(n, 16)] = e;
  need(Object.keys(out).length >= 8, `${game} generic grotto numbers in ${file}`);
  return out;
};
const grottoCodes = { oot: codes('src/oot/play/play.c', 'OOT'), mm: codes('src/mm/play/play.c', 'MM') };
const mask = 0x1f;

/* The ocarina's last notes. */
const ocarina = Object.fromEntries([['oot', 'src/link_oot.in'], ['mm', 'src/link_mm.in']].map(([g, f]) =>
  [g, { buf: linkAddr(f, 'gOcarinaSongBuffer'), cursor: linkAddr(f, 'gOcarinaSongBufferCursor'), pitch: linkAddr(f, 'gOcarinaButtonPitchMap') }]));

/* The buffer sits just before its length in both games, as in the games' own code. */
for (const g of ['oot', 'mm']) need(ocarina[g].cursor - ocarina[g].buf === 8, `${g} ocarina buffer of 8 notes`);

/* The warp songs: which warp each is, in the order of OoTMM's warp song table, and the buttons that play it. */
const warpRows = (() => {
  const src = readFileSync(path.join(gen, 'lib/combo/randomizer/config.ts'), 'utf8');
  const m = src.match(/const songs = \[([^\]]*)\];\s*const warpSongs = /);
  need(m, 'the warp song list in randomizerWarps');
  return [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1]);
})();
need(warpRows.length === 6, 'six warp songs');
const btn = (() => {
  const h = read('include/combo/common/ocarina.h');
  const e = h.slice(h.indexOf('OCARINA_BTN_A = 0'), h.indexOf('OcarinaButtonIndex;'));
  const names = [...e.matchAll(/(OCARINA_BTN_\w+)/g)].map(x => x[1]);
  need(names[0] === 'OCARINA_BTN_A' && names.includes('OCARINA_BTN_C_UP'), 'the ocarina button list');
  return Object.fromEntries(names.slice(0, 5).map((n, i) => [n, i]));
})();
const warpButtons = (() => {
  const src = read('src/mm/ocarina.c');
  const list = src.slice(src.indexOf('sCustomSongs['), src.indexOf('};', src.indexOf('sCustomSongs[')));
  const songs = [...list.matchAll(/\/\*\s*(\w+)\s*\*\/\s*\{\s*(\d+),\s*\{([^}]*)\}/g)].map(([, name, n, b]) => ({ name, buttons: [...b.matchAll(/OCARINA_BTN_\w+/g)].map(x => btn[x[0]]), n: Number(n) }));
  const want = ['MINUET', 'BOLERO', 'SERENADE', 'REQUIEM', 'NOCTURNE', 'PRELUDE'];
  need(songs.length >= 6 && want.every((w, i) => songs[i].name.startsWith(w)), 'the warp songs in sCustomSongs');
  for (const s of songs.slice(0, 6)) need(s.buttons.length === s.n && s.buttons.every(x => x !== undefined), `the notes of ${s.name}`);
  return songs.slice(0, 6).map(s => s.buttons);
})();

/* Offsets, from OoTMM's headers compiled for the N64. */
const inc = ['third_party/ultralib/include', 'third_party/ultralib/include/compiler/modern_gcc', 'packages/generator/include', 'packages/generator/build/include', 'packages/data/dist/include'];
for (const i of inc) need(existsSync(path.join(OOTMM, i)), `${i} is missing (run OoTMM's scripts/deps.sh, and tools/save-layout.mjs once for OoTMM's codegen)`);
const offsets = {};
for (const [game, def, newf] of [['oot', 'GAME_OOT', 'save.info.playerData.newf'], ['mm', 'GAME_MM', 'save.info.playerData.newf']]) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'ootmm-ram-'));
  const fields = { newf: `offsetof(__typeof__(gSaveContext), ${newf})`, grotto: `offsetof(__typeof__(gSaveContext), ${grotto[game]})`,
    grottoSize: `sizeof(gSaveContext.${grotto[game]})` };
  writeFileSync(path.join(tmp, 'ram.c'), `#include <combo.h>\n#include <stddef.h>\nunsigned int layout[] = {\n${Object.values(fields).join(',\n')}\n};\n`);
  execFileSync('mips-linux-gnu-gcc', ['-std=gnu2x', '-Dbool=_Bool', '-Dtrue=1', '-Dfalse=0', '-EB', '-mabi=32', '-march=vr4300', '-G', '0', '-c', '-ffreestanding', '-nostdinc', '-D_LANGUAGE_C=1', `-D${def}`, '-DF3DEX_GBI_2=1',
    ...inc.map(i => '-I' + path.join(OOTMM, i)), path.join(tmp, 'ram.c'), '-o', path.join(tmp, 'ram.o')], { stdio: 'inherit' });
  const dump = execFileSync('mips-linux-gnu-objdump', ['-s', '-j', '.data', path.join(tmp, 'ram.o')]).toString();
  const words = [...dump.matchAll(/^ [0-9a-f]{4} ((?:[0-9a-f]{8} ?){1,4})/gm)].flatMap(m => m[1].trim().split(/\s+/)).map(h => parseInt(h, 16));
  need(words.length >= 3, `reading ${game} offsets`);
  offsets[game] = { newf: ctx[game] + words[0], grotto: ctx[game] + words[1], grottoSize: words[2] };
}
need(offsets.oot.grottoSize === 1 && offsets.mm.grottoSize === 1, 'gGrottoData is no longer one byte');

const out = {
  version: 1, hash: ramLayoutHash(OOTMM),
  tags: { oot: 'ZELDAZ', mm: 'ZELDA3' },
  addr: { oot: { tag: offsets.oot.newf, grotto: offsets.oot.grotto }, mm: { tag: offsets.mm.newf, grotto: offsets.mm.grotto } },
  grottoMask: mask, grottoCodes,
  ocarina, ocarinaBufLen: ocarina.oot.cursor - ocarina.oot.buf, warpSongs: warpRows.map((row, i) => ({ row, buttons: warpButtons[i] })),
};
writeFileSync(path.join(ROOT, 'src/generated/ram-layout.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`RAM layout written from ${RAM_LAYOUT_INPUTS.length} OoTMM files.`, JSON.stringify(out.addr));
