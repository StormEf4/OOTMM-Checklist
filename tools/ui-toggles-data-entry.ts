/* Expected results for tools/ui-toggles.cjs: for each setting the app shows on default settings, and each
   value its control can pick, the settings string OoTMM makes and how many checks the list should count. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { DEFAULT_SETTINGS, compute, enableFastMode, exportSettings, makeSettings, SETTINGS } from '../src/engine/engine';

enableFastMode();
const countOf = async (s: any) => (await compute(s)).checks.filter(c => !c.fixed && !c.junk).length;
/* Default settings, then everything shuffled with entrance shuffles on, so settings that only show
   alongside another one get tried too. */
const rich: any = {};
for (const s of SETTINGS as readonly any[]) {
  if (s.type === 'boolean' && (/shuffle/i.test(s.key) || s.category === 'main.shuffle' || s.category === 'entrances')) rich[s.key] = true;
  else if (s.type === 'enum' && (/shuffle/i.test(s.key) || s.category === 'main.shuffle' || s.category === 'entrances')) {
    const v = s.values.map((x: any) => x.value); rich[s.key] = v.includes('all') ? 'all' : v.includes('full') ? 'full' : v.includes('anywhere') ? 'anywhere' : s.default;
  }
}
const baselines: any[] = [];
const seen = new Set<string>();
const list = SETTINGS as readonly any[];
const runs: [string, any, Set<string> | null][] = [['defaults', {}, null], ['all shuffles', rich, null]];
/* Settings still hidden on both get a starting point of their own: the first single change that shows them. */
const shownOn = (raw: any) => { const b = makeSettings(raw); return list.filter(s => !s.cond || s.cond(b)).map(s => s.key); };
const covered = new Set([...shownOn({}), ...shownOn(rich)]);
const groups = new Map<string, { raw: any; keys: Set<string> }>();
for (const h of list) {
  if (covered.has(h.key) || ['players', 'teams'].includes(h.key)) continue;
  search: for (const from of [rich, {}]) for (const s of list) {
    const opts = s.type === 'boolean' ? [true, false] : s.type === 'enum' ? s.values.map((x: any) => x.value) : s.type === 'set' ? [{ type: 'all' }] : s.type === 'number' ? [1, 3] : [];
    for (const v of opts) {
      const raw = { ...from, [s.key]: v };
      if (h.cond(makeSettings(raw))) {
        const id = `${from === rich ? 'all shuffles' : 'defaults'} + ${s.key}=${JSON.stringify(v)}`;
        (groups.get(id) ?? groups.set(id, { raw, keys: new Set() }).get(id)!).keys.add(h.key);
        break search;
      }
    }
  }
}
for (const [id, g] of groups) runs.push([id, g.raw, g.keys]);
/* Settings that need two others on, like shared souls: try with every on/off setting on. */
const allOn: any = { ...rich };
for (const s of list) if (s.type === 'boolean' && !['generateSpoilerLog'].includes(s.key)) allOn[s.key] = true;
const left = new Set(list.filter(h => !covered.has(h.key) && ![...groups.values()].some(g => g.keys.has(h.key)) && h.cond(makeSettings(allOn))).map(h => h.key));
if (left.size) runs.push(['every switch on', allOn, left]);
for (const [name, raw, only] of runs) {
const out: any[] = [];
const base = makeSettings(raw as any);
const defaults = await countOf(base);
for (const s of SETTINGS as readonly any[]) {
  if (s.cond && !s.cond(base)) continue;
  if (only && !only.has(s.key)) continue;
  const cur = (base as any)[s.key];
  let vals: { ui: any; v: any }[] = [];
  if (s.type === 'boolean') vals = [{ ui: 'click', v: !cur }];
  else if (s.type === 'enum') vals = s.values.filter((x: any) => (!x.cond || x.cond(base)) && x.value !== cur).map((x: any) => ({ ui: x.value, v: x.value }));
  else if (s.type === 'number') {
    const max = typeof s.max === 'function' ? s.max(base) : s.max, min = typeof s.min === 'function' ? s.min(base) : s.min ?? 0;
    const n = [max, min, cur + 1].find(x => typeof x === 'number' && x !== cur && x >= min && (max === undefined || x <= max));
    if (n !== undefined) vals = [{ ui: n, v: n }];
  } else if (s.type === 'set') {
    vals = [{ ui: 'all', v: { type: 'all' } }, { ui: 'none', v: { type: 'none' } }, { ui: ['specific', s.values[0].value], v: { type: 'specific', values: [s.values[0].value] } }]
      .filter(x => JSON.stringify(x.v) !== JSON.stringify(cur));
  }
  seen.add(s.key);
  for (const { ui, v } of vals) {
    const next = makeSettings({ ...base, [s.key]: v } as any);
    out.push({ key: s.key, type: s.type, ui, string: exportSettings(next), count: await countOf(next) });
  }
}
baselines.push({ name, count: defaults, string: exportSettings(base), cases: out });
console.log(name, 'cases', out.length, 'count', defaults);
}
const never = (SETTINGS as readonly any[]).filter(s => !seen.has(s.key)).map(s => s.key);
mkdirSync('.cache', { recursive: true });
writeFileSync('.cache/ui-toggles.json', JSON.stringify({ baselines, never }));
console.log('settings never shown on either baseline:', never.length, never.join(' '));
process.exit(0);
