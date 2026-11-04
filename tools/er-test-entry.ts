/* Real entrance-shuffled seeds: every connection OoTMM makes must be on the tab's list and in its picker. */
import { writeFileSync } from 'node:fs';
import { Monitor, options } from '@ootmm/core';
import { ExprParser, logic } from '@ootmm/logic';
import { makeSpoilerLog } from '@ootmm/spoiler';
import { compute, enableFastMode } from '../src/engine/engine';

const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });
const realParse = ExprParser.prototype.parse;
const dungeons = { erDungeons: 'full', erMajorDungeons: true, erMinorDungeons: true, erSpiderHouses: true, erPirateFortress: true, erBeneathWell: true, erIkanaCastle: true, erSecretShrine: true };
const cases: [string, any][] = [
  ['boss', { erBoss: 'full' }],
  ['dungeons own game', { ...dungeons, erDungeons: 'ownGame' }],
  ['grottos', { erGrottos: 'full' }],
  ['full ER', { songs: 'anywhere', ...dungeons, erBoss: 'full', erRegions: 'full', erRegionsShortcuts: true, erIndoors: 'full', erIndoorsMajor: true, erIndoorsExtra: true, erOneWays: 'full', erOneWaysMajor: true, erOneWaysIkana: true, erOneWaysSongs: true, erOneWaysStatues: true, erOneWaysOwls: true }],
  ['decoupled interiors and grottos', { erDecoupled: true, erIndoors: 'full', erIndoorsMajor: true, erGrottos: 'full' }],
  ['mixed', { erMixed: 'full', erMixedDungeons: true, erMixedGrottos: true, erMixedIndoors: true, ...dungeons, erGrottos: 'full', erIndoors: 'full', erIndoorsMajor: true }],
  ['spawns and wallmasters', { erSpawns: 'both', erWallmasters: 'full', erGrottos: 'full' }],
  ['warps', { erWarps: 'full' }],
  ['overworld', { erOverworld: 'full' }],
];
const only = process.env.ER_CASE;
let fail = 0, ran = 0;
for (const [name, s] of cases) {
  if (only && !name.includes(only)) continue;
  let log = '', opts: any = null, tries = 0;
  for (; tries < 4 && !log; ++tries) {
    ExprParser.prototype.parse = realParse;
    opts = options({ seed: `er-${name}-${tries}`, settings: { ...s, generateSpoilerLog: true } });
    try { log = makeSpoilerLog(await logic(monitor, opts), opts); }
    catch (e: any) { if (tries === 3) console.log(`SKIP ${name}: ${String(e?.message ?? e).slice(0, 120)}`); }
  }
  if (!log) continue;
  ran++;
  if (name === 'full ER') writeFileSync('.cache/spoiler-er.txt', log);
  const real = new Map<string, string>();
  for (const l of log.split(/\r?\n/)) {
    const m = l.match(/\(([A-Z0-9_]+)\)\s+->\s+.*\(([A-Z0-9_]+)\)\s*$/);
    if (m) real.set(m[1], m[2]);
  }
  enableFastMode();
  const { entrances: e } = await compute(opts.settings);
  const links = new Set(['OOT_SHOP_MASKS', 'MM_CLOCK_TOWER_FROM_CLOCK_TOWN']);
  const ids = new Map(e.list.map(x => [x.id, x]));
  const notListed = [...real.keys()].filter(k => !ids.has(k) && !links.has(k));
  const notShuffled = [...ids.keys()].filter(k => !real.has(k));
  const badDest: string[] = [], badBack: string[] = [];
  for (const [src, dst] of real) {
    const x = ids.get(src);
    if (!x) continue;
    if (!e.sets[x.allowed].some(i => e.dests[i].id === dst)) badDest.push(`${src}->${dst}`);
    const home = e.rev[src], back = e.rev[dst];
    if (home && back && ids.has(back) && real.get(back) !== home) badBack.push(`${src}->${dst}`);
  }
  const ok = !notListed.length && !notShuffled.length && !badDest.length && !badBack.length;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${real.size} real connections, ${e.list.length} listed, ${e.dests.length} places, decoupled ${!Object.keys(e.rev).length}, attempt ${tries}`);
  if (!ok) console.log('  not listed', notListed.slice(0, 5), 'never shuffled', notShuffled.slice(0, 5), 'bad dest', badDest.slice(0, 5), 'bad way back', badBack.slice(0, 5));
}
console.log(`done: ${ran} seeds, ${fail} failed`);
process.exit(fail ? 1 : 0);
