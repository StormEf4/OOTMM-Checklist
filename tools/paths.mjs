import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argIdx = process.argv.indexOf('--ootmm');
export const OOTMM = path.resolve(argIdx > 0 ? process.argv[argIdx + 1] : (process.env.OOTMM_SRC || path.join(ROOT, '..', 'src', 'OoTMM-v33')));
if (!existsSync(path.join(OOTMM, 'packages/logic/src/index.ts'))) {
  throw new Error(`No OoTMM source found at ${OOTMM}. Pass --ootmm <path to your OoTMM checkout>.`);
}

const searchPaths = [ROOT, '/opt/npm-tools'];
const req = createRequire(path.join(ROOT, 'package.json'));
export const resolvePkg = name => {
  const p = req.resolve.paths(name) ?? [];
  for (const base of [...p, ...searchPaths.map(s => path.join(s, 'node_modules'))]) {
    const dir = path.join(base, name);
    if (existsSync(path.join(dir, 'package.json'))) return dir;
  }
  throw new Error(`Missing dependency ${name}. Run npm install.`);
};
const esbuildDir = resolvePkg('esbuild');
export const esbuild = createRequire(path.join(esbuildDir, 'package.json'))('./lib/main.js');

export const aliases = {
  '@ootmm/core': path.join(OOTMM, 'packages/core/src/index.ts'),
  '@ootmm/logic': path.join(OOTMM, 'packages/logic/src/index.ts'),
  '@ootmm/data': path.join(OOTMM, 'packages/data/lib/index.ts'),
  '@ootmm/regions': path.join(OOTMM, 'packages/generator/lib/combo/regions.ts'),
  '@ootmm/names': path.join(OOTMM, 'packages/generator/lib/combo/names.ts'),
  '@ootmm/gi': path.join(OOTMM, 'packages/generator/lib/combo/randomizer/util.ts'),
  'fast-xml-parser': path.join(ROOT, 'tools/shims/fast-xml-parser.mjs'),
  'csv/sync': path.join(ROOT, 'tools/shims/csv-sync.mjs'),
  'uint8array-extras': path.join(ROOT, 'tools/shims/uint8array-extras.mjs'),
  'lodash-es': resolvePkg('lodash-es'),
  'pako': path.join(ROOT, 'tools/shims/pako.mjs'),
  'pako-real': resolvePkg('pako'),
  'yaml': resolvePkg('yaml'),
};

/* OoTMM keeps its entrance pool logic, and how pre-completed dungeons change the game,
   in private classes. This exposes them to the checklist at build time, without
   changing the randomizer's source. */
export const plugins = [{
  name: 'expose-world-shuffler',
  setup(build) {
    build.onLoad({ filter: /solver[\\/]entrances\.ts$/ }, args => {
      const text = readFileSync(args.path, 'utf8');
      if (!/class WorldShuffler\b/.test(text)) throw new Error('OoTMM no longer has a WorldShuffler class. Update src/engine/entrances.ts to match.');
      if (!/class LogicPassEntrances\b/.test(text)) throw new Error('OoTMM no longer has a LogicPassEntrances class. Update src/engine/entrances.ts to match.');
      return { contents: `${text}\nexport { WorldShuffler as ChecklistWorldShuffler, LogicPassEntrances as ChecklistLogicPassEntrances };\n`, loader: 'ts' };
    });
    /* OoTMM drops logic for items its seed didn't put in the pool. Some pools are rolled per seed
       (bottle contents, pond fish), so the checklist keeps that logic and lets the player log what they found. */
    build.onLoad({ filter: /world[\\/]transform\.ts$/ }, args => {
      const text = readFileSync(args.path, 'utf8');
      const call = 'this.state.worlds.map((world, i) => optimizeWorldStartingAndPool(world, i, this.state.startingItems, allItems))';
      if (!text.includes(call)) throw new Error('OoTMM changed how it optimizes worlds. Update the expose-world-shuffler plugin in tools/paths.mjs to match.');
      return { contents: text.replace(call, call.replace('allItems))', '(globalThis as any).__checklistKeepPool ? ({ get: () => Infinity, has: () => true } as any) : allItems))')), loader: 'ts' };
    });
    /* Tricks, glitches and "logical" settings like Hookshot Anywhere become a plain "true" or "false" when OoTMM reads
       its rules, so nothing shows which rule leaned on one. This makes each one a marked node instead. It works exactly
       as before (on when the seed's logic settings turn it on), except:
       - globalThis.__checklistAllAids: directions ask with every trick and glitch on, whatever the seed's logic
         settings say (owner, Nov 22 2026), and Hookshot Anywhere / Climb Most Surfaces whenever the game has them on;
       - globalThis.__checklistAidsOff: turns single ones off for a moment, so directions can name what a step uses.
       CHECKLIST_BOMB_HOVER is the checklist's own: never in logic, only in directions (see bombHover in logic.ts). */
    build.onLoad({ filter: /expr[\\/]builder\.ts$/ }, args => {
      const text = readFileSync(args.path, 'utf8');
      const trick = 'return settings.tricks.includes(trick as TrickKey) ? EXPR_TRUE : EXPR_FALSE;';
      const setting = 'return v === value ? EXPR_TRUE : EXPR_FALSE;';
      const cond = 'if (cond === EXPR_TRUE) {';
      const condFalse = 'if (cond === EXPR_FALSE) {';
      const known = 'if (!TRICKS.hasOwnProperty(trick)) {';
      if (!text.includes(known)) throw new Error('OoTMM changed how it checks trick names. Update the expr builder patch in tools/paths.mjs to match.');
      if (!text.includes(trick) || !text.includes(setting) || !text.includes(cond) || !text.includes(condFalse)) throw new Error('OoTMM changed how it reads tricks and settings in rules. Update the expr builder patch in tools/paths.mjs to match.');
      const aid = `
const checklistAids: Record<string, Expr> = {};
let checklistAidId = 2_000_000_000;
/** on: the seed's logic counts it. game: it works in the game (every trick and glitch; a setting unless it's off). */
function checklistAid(aid: string, on: boolean, game: boolean): Expr {
  const R_TRUE = { result: true }, R_FALSE = { result: false };
  return checklistAids[aid + ':' + on + ':' + game] ??= Object.freeze({ type: 'true', checklistAid: aid, checklistOn: on, id: checklistAidId++, eval: () => {
    const g = globalThis as any;
    if (g.__checklistAidsOff?.has(aid)) return R_FALSE;
    return (g.__checklistAllAids ? game : on) ? R_TRUE : R_FALSE;
  } }) as any;
}
`;
      return { contents: text
        .replace(known, "if (trick === 'CHECKLIST_BOMB_HOVER') return checklistAid('trick:' + trick, false, true);\n  " + known)
        .replace(trick, "return checklistAid('trick:' + trick, settings.tricks.includes(trick as TrickKey), true);")
        .replace(setting, "return value === 'logical' ? checklistAid('setting:' + setting, v === value, v !== 'off') : v === value ? EXPR_TRUE : EXPR_FALSE;")
        .replace(cond, 'if (cond === EXPR_TRUE || (cond as any).checklistOn === true) {')
        .replace(condFalse, 'if (cond === EXPR_FALSE || (cond as any).checklistOn === false) {') + aid, loader: 'ts' };
    });
    build.onLoad({ filter: /solver[\\/]solve\.ts$/ }, args => {
      const text = readFileSync(args.path, 'utf8');
      if (!/class LogicPassSolver\b/.test(text) || !/private preCompleteDungeons\(/.test(text)) throw new Error('OoTMM no longer has LogicPassSolver.preCompleteDungeons. Update preCompleteEffects in src/engine/logic.ts to match.');
      if (!/const DUNGEON_ITEMS\b/.test(text)) throw new Error('OoTMM no longer has DUNGEON_ITEMS. Update dungeonItems in src/engine/entrances.ts to match.');
      return { contents: `${text}\nexport { LogicPassSolver as ChecklistLogicPassSolver, normalDungeons as checklistNormalDungeons, DUNGEON_ITEMS as checklistDungeonItems };\n`, loader: 'ts' };
    });
  },
}];
