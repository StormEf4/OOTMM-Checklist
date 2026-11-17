/* Live play: two people on the hosted page share one seed. Each seed's state is flattened to keys (one per ticked
   check, logged entrance, note and so on). Every key carries the time it last changed, and merging keeps the newer
   value of each key, so both players' changes survive even when they make them at the same moment. */

export type LiveState = { flat: Record<string, string>; clock: Record<string, number> };

type SeedLike = {
  name: string; settings: string; done: string[]; skipped: string[]; skippedRegions: string[];
  rolled: Record<string, string[]>; preCompleted?: string[]; entrances: Record<string, string>; notes: Record<string, string>;
  pad: string; doc?: string; found: Record<string, string>; have: Record<string, number>; hints: Record<string, unknown>;
};

const MAPS: [string, keyof SeedLike, boolean][] = [
  ['e', 'entrances', false], ['t', 'notes', false], ['f', 'found', false], ['v', 'have', true], ['i', 'hints', true], ['r', 'rolled', true],
];
const SETS: [string, keyof SeedLike][] = [['d', 'done'], ['k', 'skipped'], ['g', 'skippedRegions']];
const SCALARS: [string, keyof SeedLike, boolean][] = [['s', 'settings', false], ['n', 'name', false], ['w', 'doc', false], ['p', 'pad', false], ['q', 'preCompleted', true]];

/** A seed's shared state as one string per key. */
export function flatten(s: SeedLike): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [tag, field] of SETS) for (const id of (s[field] as string[]) ?? []) out[`${tag}:${id}`] = '1';
  for (const [tag, field, json] of MAPS) for (const [k, v] of Object.entries((s[field] as Record<string, unknown>) ?? {})) out[`${tag}:${k}`] = json ? JSON.stringify(v) : String(v);
  for (const [tag, field, json] of SCALARS) out[tag] = json ? JSON.stringify(s[field] ?? []) : String(s[field] ?? '');
  return out;
}

/** Writes flattened state back onto a seed. */
export function unflatten(flat: Record<string, string>, s: SeedLike) {
  const parse = (v: string) => { try { return JSON.parse(v); } catch { return undefined; } };
  for (const [, field] of SETS) (s as any)[field] = [];
  for (const [, field] of MAPS) (s as any)[field] = {};
  for (const [key, v] of Object.entries(flat)) {
    const at = key.indexOf(':');
    if (at < 0) continue;
    const tag = key.slice(0, at), id = key.slice(at + 1);
    const set = SETS.find(x => x[0] === tag);
    if (set) { ((s as any)[set[1]] as string[]).push(id); continue; }
    const map = MAPS.find(x => x[0] === tag);
    if (map) { const val = map[2] ? parse(v) : v; if (val !== undefined) (s as any)[map[1]][id] = val; }
  }
  for (const [tag, field, json] of SCALARS) if (tag in flat) (s as any)[field] = json ? parse(flat[tag]) ?? [] : flat[tag];
}

/** Marks every key that changed between two flattened states with the given time. */
export function stamp(before: Record<string, string>, after: Record<string, string>, clock: Record<string, number>, now: number) {
  let changed = false;
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[k] !== after[k]) { clock[k] = Math.max(now, (clock[k] ?? 0) + 1); changed = true; }
  }
  return changed;
}

/** The newer value of every key from two states. A removed key keeps its time so the removal wins too. */
export function merge(a: LiveState, b: LiveState): LiveState {
  const flat: Record<string, string> = {}, clock: Record<string, number> = {};
  const keys = new Set([...Object.keys(a.flat), ...Object.keys(a.clock), ...Object.keys(b.flat), ...Object.keys(b.clock)]);
  for (const k of keys) {
    const ta = a.clock[k] ?? 0, tb = b.clock[k] ?? 0;
    const pick = ta > tb ? a : tb > ta ? b : (a.flat[k] ?? '') >= (b.flat[k] ?? '') ? a : b;
    if (pick.flat[k] !== undefined) flat[k] = pick.flat[k];
    const t = Math.max(ta, tb);
    if (t) clock[k] = t;
  }
  return { flat, clock };
}

export function sameState(a: LiveState, b: LiveState) {
  const keys = (o: Record<string, unknown>) => Object.keys(o).sort();
  const ka = keys(a.flat), kb = keys(b.flat), ca = keys(a.clock), cb = keys(b.clock);
  return ka.length === kb.length && ca.length === cb.length && ka.every((k, i) => k === kb[i] && a.flat[k] === b.flat[k])
    && ca.every((k, i) => k === cb[i] && a.clock[k] === b.clock[k]);
}

/** Room codes as players type them: LIVE- plus letters and digits. */
export const liveCode = (room: string) => 'LIVE-' + room.toUpperCase();
export const roomFromCode = (code: string) => code.trim().replace(/^LIVE-?/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
