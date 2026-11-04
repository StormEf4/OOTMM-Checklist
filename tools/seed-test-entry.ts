/* Generates real seeds with OoTMM's solver and compares its spoiler log with the checklist. */
import { Monitor, options, DEFAULT_SETTINGS } from '@ootmm/core';
import { ExprParser, logic } from '@ootmm/logic';
import { makeSpoilerLog } from '@ootmm/spoiler';
import { compute, enableFastMode } from '../src/engine/engine';
import { parseSpoilerHeader } from '../src/engine/spoiler';

const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });
const cases: [string, any][] = [
  ['defaults', {}],
  ['shops, skulls, cows, pots', { shopShuffleOot: 'full', shopShuffleMm: 'full', goldSkulltulaTokens: 'all', housesSkulltulaTokens: 'all', cowShuffleOot: true, cowShuffleMm: true, shufflePotsOot: 'all', shufflePotsMm: 'all' }],
  ['random Master Quest', { mqDungeons: { type: 'random' } }],
  ['pre-completed dungeons', { preCompletedDungeons: true, preCompletedDungeonsMajor: 2 }],
  ['MM only', { games: 'mm', goal: 'majora' }],
  ['OoT only', { games: 'oot', goal: 'ganon' }],
];
let fail = 0;
const realParse = ExprParser.prototype.parse;
for (const [name, s] of cases) {
  ExprParser.prototype.parse = realParse;
  const opts = options({ seed: 'seedtest-' + name, settings: { ...s, generateSpoilerLog: true } });
  const t = Date.now();
  let log: string;
  try {
    const res = await logic(monitor, opts);
    log = makeSpoilerLog(res, opts);
  } catch (e: any) { console.log(`SKIP ${name}: seed failed to generate: ${String(e?.message ?? e).slice(0, 100)}`); continue; }

  const head = parseSpoilerHeader(log);
  enableFastMode();
  const given = { ...opts.settings } as any;
  for (const [k, v] of Object.entries(head.rolled)) if (['random', 'random-mixed'].includes(given[k]?.type)) given[k] = { type: 'specific', values: v };
  const r = await compute(given, 'whatever');
  const mine = new Set(r.checks.map(c => c.id));

  const at = log.split(/\r?\n/);
  const idx = at.findIndex(l => /^\s*Location List \(/.test(l));
  const spoiler = new Set(at.slice(idx + 1).map(l => l.match(/^\s*((?:OOT|MM) .+?):/)?.[1]).filter(Boolean) as string[]);
  const missing = [...spoiler].filter(x => !mine.has(x));
  const extra = [...mine].filter(x => !spoiler.has(x));
  const unshuffled = r.checks.filter(c => c.fixed).length;
  const ok = !missing.length && !extra.length;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: spoiler ${spoiler.size}, checklist ${r.checks.length} (${r.checks.length - unshuffled} shuffled), rolled ${JSON.stringify(head.rolled.mqDungeons ?? [])}, pre-completed ${JSON.stringify(head.preCompleted)}, string ok ${head.settings?.startsWith('v2.')}, ${Math.round((Date.now() - t) / 1000)}s`);
  if (!ok) console.log('  missing', missing.slice(0, 6), 'extra', extra.slice(0, 6));
}
process.exit(fail ? 1 : 0);
