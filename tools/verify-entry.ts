import { compute, enableFastMode, engineSettings, SETTINGS } from '../src/engine/engine';
import { locationList } from '@ootmm/location-list';
import { ExprParser } from '@ootmm/logic';

const realParse = ExprParser.prototype.parse;
let rngState = Number(process.env.FUZZ_SEED ?? 12345);
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 2 ** 32; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

function randomSettings(intensity: number) {
  const out: any = {};
  for (const s of SETTINGS as readonly any[]) {
    if (['players', 'teams', 'mode', 'games'].includes(s.key)) continue;
    if (rnd() > intensity) continue;
    if (s.type === 'boolean') out[s.key] = rnd() < 0.5;
    else if (s.type === 'enum') {
      const vals = s.values.map((v: any) => v.value).filter((v: string) => v !== 'random');
      if (vals.length) out[s.key] = pick(vals);
    } else if (s.type === 'set') {
      const vals = s.values.map((v: any) => v.value);
      const r = rnd();
      out[s.key] = r < 0.3 ? { type: 'all' } : r < 0.6 ? { type: 'none' } : { type: 'specific', values: vals.filter(() => rnd() < 0.5) };
    }
  }
  out.games = pick(['ootmm', 'ootmm', 'ootmm', 'oot', 'mm']);
  return out;
}

const N = Number(process.env.FUZZ_N ?? 20);
let same = 0, bad = 0, threw = 0, entranceErrors = 0, withEntrances = 0, sizes: number[] = [];
const t0 = Date.now();
for (let i = 0; i < N; ++i) {
  const raw = randomSettings(pick([0.05, 0.2, 0.5, 1]));
  const settings = engineSettings(raw);
  let official: string[] | null = null, officialErr = '';
  ExprParser.prototype.parse = realParse;
  try { official = await locationList(settings); } catch (e: any) { officialErr = String(e?.message ?? e); }
  enableFastMode();
  let mine: string[] | null = null, mineErr = '';
  try {
    const r = await compute(settings, '--- INTERNAL ---');
    mine = r.checks.filter(c => !c.fixed).map(c => c.id).sort();
    if (r.entrances.error) { entranceErrors++; console.log('ENTRANCE NOTE', i, r.entrances.error.slice(0, 120)); }
    if (r.entrances.list.length) withEntrances++;
  } catch (e: any) { mineErr = String(e?.message ?? e); }
  if (!official || !mine) {
    if (!official && !mine) threw++;
    else { bad++; console.log('ERROR MISMATCH', i, 'official:', officialErr, 'mine:', mineErr); }
    continue;
  }
  if (official.length === mine.length && official.every((x, j) => x === mine![j])) { same++; sizes.push(mine.length); }
  else {
    bad++;
    const a = new Set(official), b = new Set(mine);
    console.log('LIST MISMATCH', i, official.length, mine.length, [...a].filter(x => !b.has(x)).slice(0, 5), [...b].filter(x => !a.has(x)).slice(0, 5));
  }
}
console.log(JSON.stringify({ runs: N, same, bad, bothThrew: threw, withEntrances, entranceErrors, min: Math.min(...sizes), max: Math.max(...sizes), seconds: Math.round((Date.now() - t0) / 1000) }));
process.exit(bad ? 1 : 0);
