/*
 * Reachable checks against real seeds. OoTMM's solver places a seed's entrances; the
 * test logs them the way a player would and checks the checklist reaches exactly the
 * spots OoTMM's own pathfinder reaches on the solved world, with the same items.
 * The real connections are only used here, to grade the app. The app never sees them.
 */
import { Monitor, options } from '@ootmm/core';
import { ExprParser, Items, Pathfinder, makePlayerItem, solvedWorldState } from '@ootmm/logic';
import { computeLogic } from '../src/engine/logic';

const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });
const realParse = ExprParser.prototype.parse;
const cases: [string, any][] = [
  ['defaults', {}],
  ['interiors and grottos', { erIndoors: 'full', erIndoorsMajor: true, erGrottos: 'full' }],
  ['overworld and dungeons', { erOverworld: 'full', erDungeons: 'full', erMajorDungeons: true }],
  ['spawns', { erSpawns: 'both', erGrottos: 'full' }],
  ['MM only', { games: 'mm', goal: 'majora' }],
];
let fail = 0;
for (const [name, s] of cases) {
  ExprParser.prototype.parse = realParse;
  const settings = { ...s, mode: 'single', players: 1, teams: 1 };
  let state: any = null;
  for (let t = 0; t < 4 && !state; ++t) {
    try { state = await solvedWorldState(monitor, options({ seed: `logic-${name}-${t}`, settings } as any)); } catch { /* another seed */ }
  }
  if (!state) { console.log(`SKIP ${name}: no seed generated`); continue; }
  const world = state.worlds[0];
  const logged = Object.fromEntries(world.entranceOverrides);
  const first = await computeLogic({ settings, entrances: logged, items: {} });
  const catalog = first.catalog;
  const sets: [string, Record<string, number>][] = [
    ['no items', {}],
    ['half the items', Object.fromEntries(catalog.filter((_, i) => i % 2 === 0).map(i => [i.id, i.max]))],
    ['every item', Object.fromEntries(catalog.map(i => [i.id, i.max]))],
  ];
  for (const [label, items] of sets) {
    const mine = new Set((await computeLogic({ settings, entrances: logged, items })).reach);
    const assumed = new Map<any, number>();
    for (const [id, n] of Object.entries(items)) assumed.set(makePlayerItem((Items as any)[id], 0), n);
    const res = new Pathfinder(state.worlds, state.settings, state.startingItems).run(null, { recursive: true, assumedItems: assumed as any });
    const theirs = new Set([...res.locations].map(l => l.replace(/@\d+$/, '')));
    const missing = [...theirs].filter(x => !mine.has(x));
    const extra = [...mine].filter(x => !theirs.has(x));
    const good = !missing.length && !extra.length;
    if (!good) fail++;
    console.log(`${good ? 'OK  ' : 'FAIL'} ${name}, ${label}: OoTMM reaches ${theirs.size}, checklist ${mine.size}${good ? '' : `, missing ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''} extra ${extra.slice(0, 3).join(', ')}`}`);
  }
  const closed = (await computeLogic({ settings, entrances: {}, items: Object.fromEntries(catalog.map(i => [i.id, i.max])) }));
  if (closed.shuffled) console.log(`     with nothing logged: ${closed.reach.length} reachable, ${closed.shuffled} entrances waiting`);
}
console.log(fail ? `${fail} failed` : 'All matched');
process.exitCode = fail ? 1 : 0;
