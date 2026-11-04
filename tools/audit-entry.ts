import { writeFileSync } from 'node:fs';
import { compute, enableFastMode, SETTINGS } from '../src/engine/engine';

enableFastMode();
const sig = async (s: any) => {
  const r = await compute(s);
  return r.checks.filter(c => !c.fixed).map(c => c.id).sort().join('|');
};
const list = SETTINGS as readonly any[];

/* A second baseline with every check-adding option on, so settings that only
   matter alongside another setting still get noticed. */
const rich: any = {};
for (const s of list) {
  if (s.type === 'enum' && /shuffle|Shuffle/.test(s.key)) {
    const v = s.values.map((x: any) => x.value);
    rich[s.key] = v.includes('all') ? 'all' : v.includes('anywhere') ? 'anywhere' : s.default;
  } else if (s.type === 'boolean' && /shuffle|Shuffle/i.test(s.key)) rich[s.key] = true;
}

const candidates = (s: any): any[] => {
  if (s.type === 'boolean') return [!s.default];
  if (s.type === 'enum') return s.values.map((v: any) => v.value).filter((v: string) => v !== 'random');
  if (s.type === 'set') {
    const vals = s.values.map((v: any) => v.value);
    return [{ type: 'all' }, { type: 'none' }, ...vals.map((v: string) => ({ type: 'specific', values: [v] }))];
  }
  if (s.type === 'number') {
    const pts = [0, 1, 2, 5, 10, 50, 100, 999].filter(n => (typeof s.min !== 'number' || n >= s.min) && (typeof s.max !== 'number' || n <= s.max));
    return pts;
  }
  return [];
};

const affects = new Set<string>();
for (const base of [{}, rich]) {
  const baseSig = await sig(base);
  for (const s of list) {
    if (affects.has(s.key) || ['mode', 'players', 'teams'].includes(s.key)) continue;
    for (const v of candidates(s)) {
      try {
        if (await sig({ ...base, [s.key]: v }) !== baseSig) { affects.add(s.key); break; }
      } catch {}
    }
  }
}
affects.add('games');

/* Settings that can be left to chance when the seed is made. */
const randomised = list.filter(s => affects.has(s.key) && (s.type === 'set' || (s.type === 'enum' && s.values.some((v: any) => v.value === 'random')))).map(s => ({ key: s.key, type: s.type }));
writeFileSync(process.env.AUDIT_OUT!, JSON.stringify({ affects: [...affects].sort(), randomised }));
console.log('settings', list.length, 'that change checks', affects.size);
console.log(randomised.map(r => r.key + ':' + r.type).join(' '));
process.exit(0);
