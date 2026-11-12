import { writeFileSync } from 'node:fs';
import { compute, enableFastMode, SETTINGS } from '../src/engine/engine';

enableFastMode();
type Sig = { checks: string; entrances: string };
const sig = async (s: any): Promise<Sig> => {
  const r = await compute(s);
  return {
    checks: r.checks.filter(c => !c.fixed).map(c => c.id).sort().join('|'),
    entrances: r.entrances.list.map(e => `${e.id}:${e.allowed}`).sort().join('|') + '#' + r.entrances.dests.map(d => d.id).sort().join('|'),
  };
};
const list = SETTINGS as readonly any[];

const isShuffle = (s: any) => /shuffle/i.test(s.key) || s.category === 'main.shuffle';
const richValue = (s: any) => {
  if (s.type === 'boolean') return true;
  if (s.type === 'set') return { type: 'all' };
  if (s.type === 'enum') {
    const v = s.values.map((x: any) => x.value);
    return v.includes('all') ? 'all' : v.includes('anywhere') ? 'anywhere' : v.includes('full') ? 'full' : s.default;
  }
  return s.default;
};

/* Baselines. Some settings only matter alongside others (Termina Field grass needs
   grass shuffle on), so each setting is tried against several starting points. */
const rich: any = {};
for (const s of list) if (isShuffle(s) && ['boolean', 'enum', 'set'].includes(s.type)) rich[s.key] = richValue(s);
const entrancesOn: any = {};
for (const s of list) {
  if (s.category !== 'entrances') continue;
  if (s.type === 'boolean') entrancesOn[s.key] = true;
  else if (s.type === 'enum') { const v = s.values.map((x: any) => x.value); entrancesOn[s.key] = v.includes('full') ? 'full' : v[v.length - 1]; }
}
const baselines = [{}, rich, { ...rich, ...entrancesOn }, { games: 'oot' }, { games: 'mm' }];

const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
/** Every value a setting can take that differs from the one in the baseline. */
const candidates = (s: any, base: any): any[] => {
  const cur = base[s.key] ?? s.default;
  let vals: any[] = [];
  if (s.type === 'boolean') vals = [true, false];
  else if (s.type === 'enum') vals = s.values.map((v: any) => v.value).filter((v: string) => v !== 'random');
  else if (s.type === 'set') vals = [{ type: 'all' }, { type: 'none' }, ...s.values.map((v: any) => ({ type: 'specific', values: [v.value] }))];
  else if (s.type === 'number') vals = [0, 1, 2, 3, 5, 10, 20, 30, 50, 100, 999].filter(n => (typeof s.min !== 'number' || n >= s.min) && (typeof s.max !== 'number' || n <= s.max));
  return vals.filter(v => !same(v, cur));
};

const affects = new Set<string>(), entrances = new Set<string>();
for (const base of baselines) {
  let baseSig: Sig;
  try { baseSig = await sig(base); } catch { continue; }
  for (const s of list) {
    if (['mode', 'players', 'teams'].includes(s.key)) continue;
    if (affects.has(s.key) && entrances.has(s.key)) continue;
    if (s.cond) { try { if (!s.cond({ ...Object.fromEntries(list.map(x => [x.key, x.default])), ...base })) continue; } catch {} }
    for (const v of candidates(s, base)) {
      try {
        const r = await sig({ ...base, [s.key]: v });
        if (r.checks !== baseSig.checks) affects.add(s.key);
        if (r.entrances !== baseSig.entrances) entrances.add(s.key);
        if (affects.has(s.key) && entrances.has(s.key)) break;
      } catch {}
    }
  }
}
affects.add('games');

/* Settings that can be left to chance when the seed is made. */
const randomised = list.filter(s => affects.has(s.key) && (s.type === 'set' || (s.type === 'enum' && s.values.some((v: any) => v.value === 'random')))).map(s => ({ key: s.key, type: s.type }));
writeFileSync(process.env.AUDIT_OUT!, JSON.stringify({ affects: [...affects].sort(), entrances: [...entrances].sort(), randomised }));
console.log('settings', list.length, 'that change checks', affects.size, 'that change entrances', entrances.size);
console.log(randomised.map(r => r.key + ':' + r.type).join(' '));
process.exit(0);
