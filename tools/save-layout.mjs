// Works out where OoTMM keeps each "collected" flag in its save file, from OoTMM's own C code, for game tracking's
// catch-up (src/savefile.ts). Writes src/generated/save-layout.json.
//
// Struct offsets come from compiling OoTMM's own headers for the N64's CPU (mips-linux-gnu-gcc, big-endian, 32-bit:
// the same layout rules OoTMM's own build uses) and reading the numbers back. Where each save sits in the file, and
// which scenes share flags, are read from OoTMM's save.c, play.c and mark.c, and checked to still say what this file
// expects. A hash of every file read is kept, so the build can tell when OoTMM changed and this needs running again.
//
// Needs mips-linux-gnu-gcc (apt install gcc-mips-linux-gnu) and OoTMM's ultralib (run OoTMM's scripts/deps.sh in its
// folder). OoTMM's generated headers are made here when missing. Run: node tools/save-layout.mjs
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ROOT, OOTMM, aliases, esbuild, plugins } from './paths.mjs';
import { saveLayoutHash, SAVE_LAYOUT_INPUTS } from './save-layout-hash.mjs';

const gen = path.join(OOTMM, 'packages/generator');
const read = f => readFileSync(path.join(gen, f), 'utf8');
const need = (cond, what) => { if (!cond) throw new Error(`OoTMM changed: ${what}. Update tools/save-layout.mjs and src/savefile.ts to match.`); };

/* Where each part of a save file sits, from save.c. */
const saveC = read('src/common/save.c');
need(/base = 0x20 \+ 0x1450 \* gSaveContext\.fileNum;/.test(saveC), 'OoT save position in save.c');
need(/base = 0x8000 \+ 0x8000 \* gSaveContext\.fileNum;/.test(saveC), 'MM save position in save.c');
need(/Flash_ReadWrite\(0x18000 \+ 0x4000 \* gSaveContext\.fileNum, &gSharedCustomSave/.test(saveC), 'custom save position in save.c');
const files = { oot: [0x20, 0x1450], mm: [0x8000, 0x8000], custom: [0x18000, 0x4000], count: 2 };

/* What each kind of check reads, from mark.c. The checks below are what src/savefile.ts does for each kind. */
const markC = read('src/common/mark.c');
const getOot = markC.slice(markC.indexOf('int Mark_GetOot('), markC.indexOf('int Mark_GetMm('));
const getMm = markC.slice(markC.indexOf('int Mark_GetMm('), markC.indexOf('int Mark_GetQuery('));
const expectOot = {
  OV_CHEST: 'return getChestMarkOot(play, sceneId, id);', OV_COLLECTIBLE: 'return getCollectibleMarkOot(play, sceneId, id);',
  OV_NPC: 'return BITMAP8_GET(gSharedCustomSave.oot.npc, id);', OV_GS: 'return getGsFlagOot(id);',
  OV_COW: 'return !!(gSharedCustomSave.cows & (1 << id));', OV_SHOP: 'return BITMAP8_GET(gSharedCustomSave.oot.shops, id);',
  OV_SCRUB: 'return BITMAP8_GET(gSharedCustomSave.oot.scrubs, id & 0x7f);', OV_SR: 'return BITMAP8_GET(gSharedCustomSave.oot.sr, id & 0x7f);',
  OV_FISH: 'return BITMAP8_GET(gSharedCustomSave.caughtFishFlags, id);', OV_XFLAG: 'return Xflag_Get(roomId << 8 | id);',
};
const expectMm = {
  OV_CHEST: 'return getChestMarkMm(play, sceneId, id);', OV_COLLECTIBLE: 'return getCollectibleMarkMm(play, sceneId, id);',
  OV_NPC: 'return BITMAP8_GET(gSharedCustomSave.mm.npc, id);', OV_SF: 'return getStrayFairyMarkMm(play, sceneId, id);',
  OV_COW: 'return !!(gSharedCustomSave.cows & (1 << id));', OV_SHOP: 'return BITMAP8_GET(gSharedCustomSave.mm.shops, id);',
  OV_XFLAG: 'return Xflag_Get(roomId << 8 | id);',
};
for (const [k, v] of Object.entries(expectOot)) need(new RegExp(`case ${k}:\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(getOot), `Mark_GetOot ${k}`);
for (const [k, v] of Object.entries(expectMm)) need(new RegExp(`case ${k}:\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(getMm), `Mark_GetMm ${k}`);
need(/return !!\(gOotSave\.info\.perm\[sceneId\]\.chests & \(1 << flagId\)\);/.test(markC), 'OoT chest flags');
need(/return !!\(gOotSave\.info\.perm\[sceneId\]\.collectibles & \(1 << flagId\)\);/.test(markC), 'OoT collectible flags');
need(/return !!\(gMmSave\.info\.permanentSceneFlags\[sceneId\]\.chest & \(1 << flagId\)\);/.test(markC), 'MM chest flags');
need(/return !!\(gMmSave\.info\.permanentSceneFlags\[sceneId\]\.collectible & \(1 << flagId\)\);/.test(markC), 'MM collectible flags');
need(/if \(id > 0xb0\)\s*id -= 0xb0;\s*return BITMAP32_GET\(gOotSave\.info\.gsFlags, id\);/.test(markC), 'OoT skulltula flags');
need(/if \(id >= 0x20\)\s*return getSwitchMarkMm\(play, sceneId, id\);\s*else\s*return getCollectibleMarkMm\(play, sceneId, id\);/.test(markC), 'MM stray fairy flags');
need(/if \(flagId >= 0x20\)\s*return getSwitch1MarkMm\(play, sceneId, flagId & 0x1f\);\s*else\s*return getSwitch0MarkMm\(play, sceneId, flagId & 0x1f\);/.test(markC), 'MM switch flags');
need(/return BITMAP8_GET\(gSharedCustomSave\.xflags, id\);/.test(read('src/common/xflags.c')), 'xflag bitmap');

/* Scenes that share flags with another (MQ dungeons, MM's seasons), from play.c and mark.c. */
const SCENES = JSON.parse(readFileSync(path.join(OOTMM, 'packages/data/dist/lib/data-scenes.json'), 'utf8'));
const scene = n => { need(n in SCENES, `scene ${n}`); return SCENES[n]; };
const merges = { oot: {}, mm: {} };
const mq = read('src/common/play.c');
const mqBody = mq.slice(mq.indexOf('int Play_MergeMQ('), mq.indexOf('return sceneId;', mq.indexOf('int Play_MergeMQ(')));
for (const [, a, b] of mqBody.matchAll(/case SCE_(OOT_\w+): return SCE_(OOT_\w+);/g)) merges.oot[scene(a)] = scene(b);
need(Object.keys(merges.oot).length >= 12, 'Play_MergeMQ');
const mmBody = markC.slice(markC.indexOf('static int Mark_NormalizeSceneIdMm('), markC.indexOf('static int getChestMarkOot('));
for (const [, a, b] of mmBody.matchAll(/case SCE_(MM_\w+):\s*return SCE_(MM_\w+);/g)) merges.mm[scene(a)] = scene(b);
need(Object.keys(merges.mm).length >= 6, 'Mark_NormalizeSceneIdMm');

/* How the OoT save spells file names, from OoTMM's oot/message.h, so a save slot can be matched to the game playing. */
const msgH = read('include/combo/oot/message.h');
const fnum = re => { const m = msgH.match(re); need(m, `file name letters (${re})`); return parseInt(m[1], 16); };
const names = {
  digit: (need(/#define FILENAME_DIGIT\(c\)\s+\(\(c\) - '0'\)/.test(msgH), 'file name digits'), 0),
  upper: fnum(/#define FILENAME_UPPERCASE\(c\)\s+\(\(c\) - 'A' \+ (0x[0-9A-Fa-f]+)\)/),
  lower: fnum(/#define FILENAME_LOWERCASE\(c\)\s+\(\(c\) - 'a' \+ (0x[0-9A-Fa-f]+)\)/),
  space: fnum(/#define FILENAME_SPACE\s+(0x[0-9A-Fa-f]+)/),
};

/* Struct offsets, from OoTMM's headers compiled for the N64. */
const tmp = mkdtempSync(path.join(tmpdir(), 'ootmm-save-'));
const fields = {
  ootSize: 'sizeof(OotSave)', ootPerm: 'offsetof(OotSave, info.perm)', ootPermSize: 'sizeof(OotPermanentSceneFlags)',
  ootChests: 'offsetof(OotPermanentSceneFlags, chests)', ootCollectibles: 'offsetof(OotPermanentSceneFlags, collectibles)',
  ootGs: 'offsetof(OotSave, info.gsFlags)', ootNewf: 'offsetof(OotSave, info.playerData.newf)', ootName: 'offsetof(OotSave, info.playerData.playerName)',
  mmSize: 'sizeof(MmSave)', mmPerm: 'offsetof(MmSave, info.permanentSceneFlags)', mmPermSize: 'sizeof(MmPermanentSceneFlags)',
  mmChest: 'offsetof(MmPermanentSceneFlags, chest)', mmCollectible: 'offsetof(MmPermanentSceneFlags, collectible)',
  mmSwitch0: 'offsetof(MmPermanentSceneFlags, switch0)', mmSwitch1: 'offsetof(MmPermanentSceneFlags, switch1)',
  customSize: 'sizeof(SharedCustomSave)', ootNpc: 'offsetof(SharedCustomSave, oot.npc)', ootShops: 'offsetof(SharedCustomSave, oot.shops)',
  ootScrubs: 'offsetof(SharedCustomSave, oot.scrubs)', ootSr: 'offsetof(SharedCustomSave, oot.sr)', mmNpc: 'offsetof(SharedCustomSave, mm.npc)',
  mmShops: 'offsetof(SharedCustomSave, mm.shops)', xflags: 'offsetof(SharedCustomSave, xflags)', xflagsSize: 'sizeof(((SharedCustomSave*)0)->xflags)',
  cows: 'offsetof(SharedCustomSave, cows)', fish: 'offsetof(SharedCustomSave, caughtFishFlags)',
};
writeFileSync(path.join(tmp, 'layout.c'), `#include <combo.h>\n#include <stddef.h>\nunsigned int layout[] = {\n${Object.values(fields).join(',\n')}\n};\n`);
/* OoTMM's generated headers (scenes, config values...), made by its own codegen. */
if (!existsSync(path.join(gen, 'build/include/combo/generated_config.h'))) {
  writeFileSync(path.join(tmp, 'codegen.ts'), `import { codegen } from ${JSON.stringify(path.join(gen, 'lib/combo/codegen.ts'))};\nawait codegen({ log() {}, setProgress() {} } as any);\n`);
  await esbuild.build({ entryPoints: [path.join(tmp, 'codegen.ts')], bundle: true, platform: 'node', format: 'esm', outfile: path.join(tmp, 'codegen.mjs'), alias: aliases, plugins,
    loader: { '.json': 'json' }, logLevel: 'error', banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" } });
  execFileSync(process.execPath, [path.join(tmp, 'codegen.mjs')], { cwd: gen, stdio: 'inherit' });
}
const inc = ['third_party/ultralib/include', 'third_party/ultralib/include/compiler/modern_gcc', 'packages/generator/include', 'packages/generator/build/include', 'packages/data/dist/include'];
for (const i of inc) need(existsSync(path.join(OOTMM, i)), `${i} is missing (run OoTMM's scripts/deps.sh and its codegen)`);
execFileSync('mips-linux-gnu-gcc', ['-EB', '-mabi=32', '-march=vr4300', '-G', '0', '-c', '-ffreestanding', '-nostdinc', '-D_LANGUAGE_C=1', '-DGAME_OOT', '-DF3DEX_GBI_2=1',
  ...inc.map(i => '-I' + path.join(OOTMM, i)), path.join(tmp, 'layout.c'), '-o', path.join(tmp, 'layout.o')], { stdio: 'inherit' });
const dump = execFileSync('mips-linux-gnu-objdump', ['-s', '-j', '.data', path.join(tmp, 'layout.o')]).toString();
const words = [...dump.matchAll(/^ [0-9a-f]{4} ((?:[0-9a-f]{8} ?){1,4})/gm)].flatMap(m => m[1].trim().split(/\s+/)).map(h => parseInt(h, 16));
const keys = Object.keys(fields);
need(words.length >= keys.length, 'reading the compiled offsets');
const offsets = Object.fromEntries(keys.map((k, i) => [k, words[i]]));
need(offsets.ootSize <= files.oot[1] && offsets.mmSize <= 0x4000 && offsets.customSize <= files.custom[1], 'save sizes no longer fit their places in the file');

const out = { version: 1, hash: saveLayoutHash(OOTMM), files, offsets, merges, names };
writeFileSync(path.join(ROOT, 'src/generated/save-layout.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`Save layout written from ${SAVE_LAYOUT_INPUTS.length} OoTMM files.`, offsets);
