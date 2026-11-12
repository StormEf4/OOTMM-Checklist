/*
 * Tries every value of every OoTMM setting, one at a time, on a few starting points, and
 * checks the checklist matches OoTMM's own locationList() each time. It also checks that
 * every setting that changes the list is marked "changes checks" in the app.
 * SHARD=i/n splits the work across processes.
 */
import { compute, enableFastMode, engineSettings, SETTINGS } from '../src/engine/engine';
import { locationList } from '@ootmm/location-list';
import { ExprParser } from '@ootmm/logic';
import audit from '../src/generated/audit.json';

const realParse = ExprParser.prototype.parse;
const list = SETTINGS as readonly any[];
const affects = new Set<string>(audit.affects);
const [shard, shards] = (process.env.SHARD ?? '0/1').split('/').map(Number);

const rich: any = {};
for (const s of list) if (/shuffle/i.test(s.key) || s.category === 'main.shuffle') {
  if (s.type === 'boolean') rich[s.key] = true;
  else if (s.type === 'set') rich[s.key] = { type: 'all' };
  else if (s.type === 'enum') { const v = s.values.map((x: any) => x.value); rich[s.key] = v.includes('all') ? 'all' : v.includes('anywhere') ? 'anywhere' : s.default; }
}
const baselines: [string, any][] = [['defaults', {}], ['all shuffles', rich], ['OoT only', { games: 'oot', goal: 'ganon' }], ['MM only', { games: 'mm', goal: 'majora' }]];

const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
function values(s: any, settings: any): any[] {
  const cur = settings[s.key];
  let v: any[] = [];
  if (s.type === 'boolean') v = [true, false];
  else if (s.type === 'enum') v = s.values.map((x: any) => x.value).filter((x: string) => x !== 'random');
  else if (s.type === 'set') v = [{ type: 'all' }, { type: 'none' }, ...s.values.map((x: any) => ({ type: 'specific', values: [x.value] }))];
  else if (s.type === 'number') {
    const min = typeof s.min === 'function' ? s.min(settings) : s.min ?? 0;
    const max = typeof s.max === 'function' ? s.max(settings) : s.max ?? 999;
    v = [...new Set([min, Math.floor((min + max) / 2), max, 1].filter(n => n >= min && n <= max))];
  }
  return v.filter(x => !same(x, cur));
}

async function both(raw: any) {
  const settings = engineSettings(raw);
  ExprParser.prototype.parse = realParse;
  let official: string[] | null = null, err = '';
  try { official = await locationList(settings); } catch (e: any) { err = String(e?.message ?? e).slice(0, 80); }
  enableFastMode();
  let mine: string[] | null = null, mineErr = '';
  try { mine = (await compute(settings, '--- INTERNAL ---')).checks.filter(c => !c.fixed).map(c => c.id).sort(); } catch (e: any) { mineErr = String(e?.message ?? e).slice(0, 80); }
  return { official, mine, err, mineErr };
}

let runs = 0, ok = 0, refused = 0, bad = 0, hidden = 0;
const t0 = Date.now();
let job = 0;
for (const [bname, braw] of baselines) {
  const base = engineSettings(braw);
  const b = await both(braw);
  const baseSig = (b.official ?? []).join('|');
  for (const s of list) {
    if (['mode', 'players', 'teams'].includes(s.key)) continue;
    if (s.cond && !s.cond(base)) continue;
    for (const v of values(s, base)) {
      if (job++ % shards !== shard) continue;
      runs++;
      const r = await both({ ...braw, [s.key]: v });
      const label = `${bname} | ${s.key}=${JSON.stringify(v)}`;
      if (!r.official) {
        if (/not allowed at runtime/.test(r.err)) { refused++; continue; }
        if (!r.mine) { refused++; continue; }
        bad++; console.log(`ERROR ${label}: OoTMM threw "${r.err}", checklist didn't`); continue;
      }
      if (!r.mine) { bad++; console.log(`ERROR ${label}: checklist threw "${r.mineErr}"`); continue; }
      if (!same(r.official, r.mine)) {
        bad++;
        const a = new Set(r.official), m = new Set(r.mine);
        console.log(`MISMATCH ${label}: OoTMM ${r.official.length}, checklist ${r.mine.length}; missing ${JSON.stringify([...a].filter(x => !m.has(x)).slice(0, 3))} extra ${JSON.stringify([...m].filter(x => !a.has(x)).slice(0, 3))}`);
        continue;
      }
      ok++;
      if (r.official.join('|') !== baseSig && !affects.has(s.key)) { hidden++; console.log(`HIDDEN ${label}: changes the list but isn't marked "changes checks"`); }
    }
  }
}
console.log(JSON.stringify({ shard: `${shard}/${shards}`, runs, ok, refused, bad, hidden, minutes: Math.round((Date.now() - t0) / 60000) }));
process.exit(bad || hidden ? 1 : 0);
