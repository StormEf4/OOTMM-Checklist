/*
 * Reachable checks against real seeds. OoTMM's solver places a seed's entrances; the
 * test logs them the way a player would and checks the checklist reaches exactly the
 * spots OoTMM's own pathfinder reaches on the solved world, with the same items.
 * The real connections are only used here, to grade the app. The app never sees them.
 *
 * LOGIC_FUZZ=n adds n random settings on top of the fixed cases. LOGIC_CASE=word runs only matching cases.
 */
import { Monitor, SETTINGS, TRICKS, options } from '@ootmm/core';
import { ExprParser, Items, Pathfinder, makePlayerItem, solvedWorldState } from '@ootmm/logic';
import { computeLogic } from '../src/engine/logic';
import { ROLLABLE } from '../src/engine/spoiler';

const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });
const realParse = ExprParser.prototype.parse;
let rngState = Number(process.env.FUZZ_SEED ?? 4242);
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 2 ** 32; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

const dungeons = { erDungeons: 'full', erMajorDungeons: true, erMinorDungeons: true, erSpiderHouses: true, erPirateFortress: true, erBeneathWell: true, erIkanaCastle: true, erSecretShrine: true };
const cases: [string, any][] = [
  ['defaults', {}],
  ['interiors and grottos', { erIndoors: 'full', erIndoorsMajor: true, erGrottos: 'full' }],
  ['overworld and dungeons', { erOverworld: 'full', erDungeons: 'full', erMajorDungeons: true }],
  ['spawns', { erSpawns: 'both', erGrottos: 'full' }],
  ['MM only', { games: 'mm', goal: 'majora' }],
  ['OoT only', { games: 'oot', goal: 'ganon' }],
  ['random Master Quest', { mqDungeons: { type: 'random' } }],
  ['pre-completed dungeons', { preCompletedDungeons: true, preCompletedDungeonsMajor: 2 }],
  ['pre-completed, dungeon beaten state', { preCompletedDungeons: true, preCompletedDungeonsMajor: 3, regionState: 'dungeonBeaten' }],
  ['pre-completed, most dungeons with souls', { preCompletedDungeons: true, preCompletedDungeonsMajor: 10, regionState: 'dungeonBeaten', soulsBossOot: true, soulsBossMm: true }],
  ['shops and prices', { shopShuffleOot: 'full', shopShuffleMm: 'full', priceOotShops: 'affordable', priceMmShops: 'affordable' }],
  ['songs anywhere, keys anywhere', { songs: 'anywhere', smallKeyShuffleOot: 'anywhere', smallKeyShuffleMm: 'anywhere', bossKeyShuffleOot: 'anywhere', bossKeyShuffleMm: 'anywhere' }],
  ['adult start, cross age', { startingAgeOot: 'adult', crossAge: true }],
  ['souls', { soulsBossOot: true, soulsBossMm: true, soulsEnemyOot: true }],
  ['starting items', { startingItems: { OOT_HOOKSHOT: 1, MM_MASK_DEKU: 1, OOT_BOMB_BAG: 1, MM_BOW: 1 } }],
  ['tricks', { tricks: Object.keys(TRICKS).filter(k => !(TRICKS as any)[k].glitch).filter((_, i) => i % 2 === 0) }],
  ['full ER', { songs: 'anywhere', ...dungeons, erBoss: 'full', erRegions: 'full', erIndoors: 'full', erIndoorsMajor: true, erOneWays: 'full', erOneWaysMajor: true, erOneWaysSongs: true, erOneWaysStatues: true, erOneWaysOwls: true }],
  ['decoupled', { erDecoupled: true, erIndoors: 'full', erIndoorsMajor: true, erGrottos: 'full' }],
  ['wallmasters and warps', { erWallmasters: 'full', erWarps: 'full' }],
  ['custom bridge and moon', { rainbowBridge: 'custom', moon: 'custom', specialConds: { BRIDGE: { stones: true, medallions: true, count: 4 }, MOON: { remains: true, masksTransform: true, count: 5 } } }],
  ['glitches', { tricks: Object.keys(TRICKS).filter(k => (TRICKS as any)[k].glitch).filter((_, i) => i % 3 === 0) }],
];

function randomSettings() {
  const intensity = pick([0.05, 0.15, 0.3]);
  const out: any = {};
  for (const s of SETTINGS as readonly any[]) {
    if (['players', 'teams', 'mode', 'games', 'logic', 'generateSpoilerLog'].includes(s.key) || rnd() > intensity) continue;
    if (s.type === 'boolean') out[s.key] = rnd() < 0.5;
    else if (s.type === 'enum') {
      const vals = s.values.map((v: any) => v.value).filter((v: string) => v !== 'random');
      if (vals.length) out[s.key] = pick(vals);
    } else if (s.type === 'set') {
      const vals = s.values.map((v: any) => v.value);
      const r = rnd();
      out[s.key] = r < 0.3 ? { type: 'all' } : r < 0.6 ? { type: 'none' } : r < 0.75 ? { type: 'random' } : { type: 'specific', values: vals.filter(() => rnd() < 0.5) };
    }
  }
  if (rnd() < 0.3) out.tricks = Object.keys(TRICKS).filter(() => rnd() < 0.3);
  out.games = pick(['ootmm', 'ootmm', 'ootmm', 'oot', 'mm']);
  return out;
}

const fuzz = Number(process.env.LOGIC_FUZZ ?? 0);
for (let i = 0; i < fuzz; ++i) cases.push([`random ${i + 1}`, randomSettings()]);
const only = process.env.LOGIC_CASE;

let fail = 0, ran = 0, skipped = 0;
for (const [name, s] of cases) {
  if (only && !name.includes(only)) continue;
  ExprParser.prototype.parse = realParse;
  const settings: any = { ...s, mode: 'single', players: 1, teams: 1 };
  let state: any = null, err = '';
  for (let t = 0; t < 3 && !state; ++t) {
    try { state = await solvedWorldState(monitor, options({ seed: `logic-${name}-${t}`, settings } as any)); } catch (e: any) { err = String(e?.message ?? e).slice(0, 100); }
  }
  if (!state) { skipped++; console.log(`SKIP ${name}: no seed generated (${err})`); continue; }
  ran++;
  const world = state.worlds[0];

  /* What the player knows: the entrances they logged, what the seed rolled, and which dungeons were pre-completed. */
  const known: any = { ...settings };
  for (const key of ROLLABLE) {
    if (['random', 'random-mixed'].includes(known[key]?.type)) known[key] = { type: 'specific', values: [...(world.resolvedFlags as any)[key].values] };
  }
  const input = { settings: known, entrances: Object.fromEntries(world.entranceOverrides) as Record<string, string>, preCompleted: [...world.preCompleted] as string[] };

  let first: any;
  try { first = await computeLogic({ ...input, items: {} }); }
  catch (e: any) { fail++; console.log(`FAIL ${name}: checklist logic threw ${String(e?.message ?? e).slice(0, 160)}`); continue; }
  const catalog = first.catalog as { id: string; max: number }[];
  /* Items a pre-completed dungeon handed over, like a stone found at its boss, are in the player's inventory from the start, so they log them. */
  const gifts: Record<string, number> = {};
  for (const [pi, n] of state.startingItems as Map<any, number>) {
    const c = (first.catalog as { id: string; start: number }[]).find(x => x.id === pi.item.id);
    if (c && n > c.start) gifts[c.id] = n - c.start;
  }
  const sets: [string, Record<string, number>][] = [
    ['no items', {}],
    ['a third', Object.fromEntries(catalog.filter(() => rnd() < 0.33).map(i => [i.id, Math.ceil(i.max * rnd())]))],
    ['half', Object.fromEntries(catalog.filter((_, i) => i % 2 === 0).map(i => [i.id, i.max]))],
    ['every item', Object.fromEntries(catalog.map(i => [i.id, i.max]))],
  ];
  const lines: string[] = [];
  let caseFail = false;
  for (const [label, items] of sets) {
    const logged = { ...items };
    for (const [id, n] of Object.entries(gifts)) logged[id] = (logged[id] ?? 0) + n;
    const mine = new Set((await computeLogic({ ...input, items: logged })).reach);
    const assumed = new Map<any, number>();
    for (const [id, n] of Object.entries(items)) assumed.set(makePlayerItem((Items as any)[id], 0), n);
    const res = new Pathfinder(state.worlds, state.settings, state.startingItems).run(null, { recursive: true, assumedItems: assumed as any });
    const theirs = new Set([...res.locations].map((l: string) => l.replace(/@\d+$/, '')));
    const missing = [...theirs].filter(x => !mine.has(x));
    const extra = [...mine].filter(x => !theirs.has(x));
    if (missing.length || extra.length) {
      caseFail = true;
      lines.push(`  ${label}: OoTMM ${theirs.size}, checklist ${mine.size}; missing ${missing.length} [${missing.slice(0, 3).join(', ')}] extra ${extra.length} [${extra.slice(0, 3).join(', ')}]`);
    } else lines.push(`  ${label}: ${theirs.size}`);
  }
  if (caseFail) fail++;
  console.log(`${caseFail ? 'FAIL' : 'OK  '} ${name}${caseFail ? '\n' + lines.join('\n') : `: ${lines.map(l => l.trim()).join(', ')}`}`);
  if (caseFail && name.startsWith('random')) console.log('  settings', JSON.stringify(s).slice(0, 600));
}
console.log(`${ran} seeds, ${fail} failed, ${skipped} skipped`);
process.exitCode = fail ? 1 : 0;
