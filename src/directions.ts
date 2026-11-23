/*
 * Directions: the way from where the player is to a place they type, through the entrances they have logged.
 *
 * The map is OoTMM's normal one (Ways, from the engine): the areas, the walking between them that needs no loading
 * zone, and every entrance. An entrance the settings shuffle is only used once the player has logged where it leads,
 * and then it goes where they logged it. An entrance the settings leave alone goes where it always does (or where the
 * settings themselves send it: the link between the games, plando). Nothing here ever works out or uses a seed's real
 * connections. With the logic worker's rules (Travel), each way is only taken by an age OoTMM's own rules let through
 * with the items the player logged, and age changes go through the Temple of Time or the Song of Time.
 */
import type { Ways } from './engine/entrances';

export type Age = 'child' | 'adult';

/** A trick, glitch or setting like Hookshot Anywhere a step leans on (any one of them when "any"), and the items it uses. */
export type Aid = { use: string[]; items: string[]; any?: boolean };

export type Step = (
  /** Go through an entrance. door is OoTMM's id for it; logged says the player logged where it leads. */
  | { kind: 'door'; door: string; from: string; to: string; logged: boolean }
  /** Play a warp song, or soar to an owl statue: works from anywhere. */
  | { kind: 'warp'; door: string; to: string; logged: boolean }
  /** Walk on to another place, with no loading zone in between. */
  | { kind: 'walk'; from: string; to: string }
  /** Become the other age: at the Temple of Time (the Master Sword), or anywhere with the Song of Time. */
  | { kind: 'age'; to: Age; how: 'sword' | 'song'; at: string }
) & {
  /** Tricks, glitches or "logical" settings this step (or the walk just before it) needs, only ever ones the seed turns
      on, with the player's items. */
  uses?: Aid[];
};

/** OoTMM's rules for the ways between areas, asked with the player's items (from the logic worker; see logic.ts). */
export type Travel = {
  pass: Record<string, number>; timeTravel: string[]; atWill: boolean; fixedAge: string[];
  aids?: Record<string, [Aid | null, Aid | null]>;
};

export type RouteAsk = {
  /** Areas the player could be standing in (one when the game said, a whole place's when they picked it). */
  start: string[];
  /** The age the player is now, when known. Unknown starts as either. */
  age?: Age | null;
  /** The place to get to. */
  goal: string;
  /** The player's log: entrance id to the entrance it leads to (their own words, "text:...", lead nowhere known). */
  logged: Record<string, string>;
  /** Entrances these settings shuffle. Each stays closed until it's logged. */
  shuffled: Set<string>;
  /** OoTMM's rules with the player's items. Without them every way is open and age doesn't matter. */
  rules?: Travel | null;
  /** Without rules: whether a warp song or soaring (by entrance id) can be used. */
  canWarp?: (door: string) => boolean;
  /** Entrances to leave out, to find another way. */
  ban?: Set<string>;
  /** Places the player has been to (they checked something there): any way into one, or around in it, is open,
      whatever it needs. */
  been?: Set<string>;
};

/** Where an entrance takes the player on this seed, as far as the player's log and the settings say, or null. */
export function leadsTo(ways: Ways, id: string, ask: Pick<RouteAsk, 'logged' | 'shuffled'>): { area: string; logged: boolean } | null {
  let dest: string | undefined;
  let logged = false;
  if (ask.shuffled.has(id)) {
    dest = ask.logged[id];
    if (!dest || dest.startsWith('text:')) return null;
    logged = true;
  } else dest = ways.set[id] ?? id;
  const area = ways.doors[dest]?.[1];
  return area && ways.areas[area] ? { area, logged } : null;
}

const placeOf = (ways: Ways, area: string) => ways.areas[area]?.[0] ?? '';
const AGES: Age[] = ['child', 'adult'];

/**
 * The fewest entrances from the start to the goal, then the fewest warps and age changes. Walking within a place is
 * free. With rules, each way is only taken by an age OoTMM's logic lets through with the player's items. Returns the
 * steps, [] when the player is already there, or null when there's no way yet.
 */
export function findRoute(ways: Ways, ask: RouteAsk): Step[] | null {
  if (ask.start.some(a => placeOf(ways, a) === ask.goal)) return [];
  if (!ask.rules || ask.age) return searchRoute(ways, ask);
  /* Age unknown: the way for each age. Only when one age has no way, or a longer one, does the age need saying. */
  const [child, adult] = AGES.map(age => searchRoute(ways, { ...ask, age }));
  if (!child || !adult) {
    const one = child ?? adult;
    if (one) (one as Step[] & { startAge?: Age }).startAge = child ? 'child' : 'adult';
    return one;
  }
  const better = length(adult) < length(child) ? adult : child;
  if (length(adult) !== length(child)) (better as Step[] & { startAge?: Age }).startAge = better === adult ? 'adult' : 'child';
  return better;
}

function searchRoute(ways: Ways, ask: RouteAsk): Step[] | null {
  const rules = ask.rules ?? null;
  /* Bit 1 child, 2 adult. A way not listed is open to both. */
  const been = (to: string) => !!ask.been?.has(placeOf(ways, to));
  const open = (from: string, to: string) => !rules || been(to) ? 3 : rules.pass[from + '\n' + to] ?? 3;
  const aidOf = (from: string, to: string) => been(to) ? undefined : rules?.aids?.[from + '\n' + to];
  type Edge = { to: string; mask: number; door?: string; warp?: boolean; logged?: boolean; age?: 'sword' | 'song'; aid?: [Aid | null, Aid | null] };
  const outOf = new Map<string, Edge[]>();
  const add = (a: string, e: Edge) => { if (e.mask) (outOf.get(a) ?? outOf.set(a, []).get(a)!).push(e); };
  const warps: Edge[] = [];
  for (const [id, [from]] of Object.entries(ways.doors)) {
    if (ask.ban?.has(id)) continue;
    const t = leadsTo(ways, id, ask);
    if (!t) continue;
    /* Saving and resetting (or a Game Over) puts Link back at the spawn for his age, from anywhere, any time. */
    const spawn = ways.doors[id][2] === 'spawn-child' ? 1 : ways.doors[id][2] === 'spawn-adult' ? 2 : 0;
    if (spawn) {
      const mask = rules || !ask.age ? spawn : ask.age === AGES[spawn - 1] ? 3 : 0;
      if (mask) warps.push({ to: t.area, mask, door: id, warp: true, logged: t.logged });
      continue;
    }
    if (from.startsWith('*')) {
      const mask = rules ? rules.pass[from.slice(1) + '\n' + t.area] ?? 3 : ask.canWarp?.(id) ? 3 : 0;
      if (mask) warps.push({ to: t.area, mask, door: id, warp: true, logged: t.logged, aid: rules?.aids?.[from.slice(1) + '\n' + t.area] });
      continue;
    }
    add(from, { to: t.area, mask: open(from, t.area), door: id, logged: t.logged, aid: aidOf(from, t.area) });
  }
  for (const [a, list] of Object.entries(ways.walk)) for (const b of list) add(a, { to: b, mask: open(a, b), aid: aidOf(a, b) });
  const fixed = new Set(rules?.fixedAge ?? []);
  const sword = new Set(rules?.timeTravel ?? []);
  /* Cost: an entrance 2, a warp 3 (a song is slower than a door, but beats a long way round), changing age 3 with the
     sword, 4 with the song, walking 0, and 1 more for a way that needs a trick or glitch, so a plain way wins a tie. Costs are small whole numbers, so a bucket queue does it. A node is an area and
     an age (only one age without rules). */
  const node = (a: string, age: number) => a + '|' + age;
  const cost = new Map<string, number>();
  const prev = new Map<string, { from: string; edge: Edge; age: number }>();
  const buckets: string[][] = [[]];
  const ages = !rules ? [0] : ask.age ? [AGES.indexOf(ask.age)] : [0, 1];
  for (const a of ask.start) if (ways.areas[a]) for (const g of ages) { cost.set(node(a, g), 0); buckets[0].push(node(a, g)); }
  let end = '';
  for (let c = 0; c < buckets.length && !end; c++) {
    const q = buckets[c];
    if (!q) continue;
    for (let i = 0; i < q.length; i++) {
      const n = q[i];
      if (cost.get(n) !== c) continue;
      const bar = n.lastIndexOf('|'), a = n.slice(0, bar), g = Number(n.slice(bar + 1));
      if (placeOf(ways, a) === ask.goal) { end = n; break; }
      const relax = (e: Edge, w: number, to = g) => {
        if (rules && !(e.mask & (1 << g))) return;
        const m = node(e.to, to), k = c + w + (e.aid?.[g] ? 1 : 0);
        if (k >= (cost.get(m) ?? Infinity)) return;
        cost.set(m, k);
        prev.set(m, { from: n, edge: e, age: g });
        (buckets[k] ??= []).push(m);
      };
      for (const e of outOf.get(a) ?? []) relax(e, e.door ? 2 : 0);
      for (const e of warps) relax(e, 3);
      if (rules && sword.has(a)) relax({ to: a, mask: 3, age: 'sword' }, 3, 1 - g);
      else if (rules?.atWill && ways.areas[a] && !fixed.has(a) && a.startsWith('OOT ')) relax({ to: a, mask: 3, age: 'song' }, 4, 1 - g);
    }
  }
  if (!end) return null;
  const path: { from: string; edge: Edge; age: number }[] = [];
  for (let n = end; prev.has(n); n = prev.get(n)!.from) path.unshift(prev.get(n)!);
  const areaOf = (n: string) => n.slice(0, n.lastIndexOf('|'));
  /* Only entrances and age changes make steps. Between them, a walk into another place gets a step of its own. */
  const steps: Step[] = [];
  /* A trick on a walk within a place has no step of its own, so it goes on the next step. */
  let uses: Aid[] = [];
  const push = (s: Step) => { if (uses.length) s.uses = uses; uses = []; steps.push(s); };
  let at = placeOf(ways, areaOf(path[0]?.from ?? node(ask.start[0], 0)));
  const note = (aid: Aid | null | undefined) => { if (aid && !uses.some(u => u.use.join() === aid.use.join())) uses.push(aid); };
  for (const { from, edge, age } of path) {
    const aid = edge.aid?.[age];
    if (!edge.door && !edge.age) { note(aid); continue; }
    const here = placeOf(ways, areaOf(from));
    if (!edge.warp && here !== at) push({ kind: 'walk', from: at, to: here });
    note(aid);
    if (edge.age) { push({ kind: 'age', to: AGES[1 - age], how: edge.age, at: here }); at = here; continue; }
    const to = placeOf(ways, edge.to);
    push(edge.warp ? { kind: 'warp', door: edge.door!, to, logged: !!edge.logged } : { kind: 'door', door: edge.door!, from: here, to, logged: !!edge.logged });
    at = to;
  }
  if (at !== ask.goal) push({ kind: 'walk', from: at, to: ask.goal });
  else if (uses.length && steps.length) steps[steps.length - 1].uses = [...(steps[steps.length - 1].uses ?? []), ...uses];
  return steps;
}

/** The age a way starts as, when the player's age wasn't known and it matters. */
export const startAge = (steps: Step[]): Age | undefined => (steps as Step[] & { startAge?: Age }).startAge;

function doorsOf(steps: Step[]) { return steps.flatMap(s => s.kind === 'door' || s.kind === 'warp' ? [s.door] : []); }
function length(steps: Step[]) { return doorsOf(steps).length * 2 + steps.filter(s => s.kind === 'warp' || s.kind === 'age').length; }

/**
 * The best way, then up to max - 1 other ways, each leaving out one entrance of the best way (and of the ways found
 * after it), shortest first. [] when already there, null when there's no way yet.
 */
export function findRoutes(ways: Ways, ask: RouteAsk, max = 4): Step[][] | null {
  const best = findRoute(ways, ask);
  if (!best || !best.length) return best ? [best] : null;
  const seen = new Set([doorsOf(best).join('|')]);
  const found: Step[][] = [];
  const queue = [best];
  for (let i = 0; i < queue.length && i < 3; i++) {
    for (const door of doorsOf(queue[i])) {
      const other = findRoute(ways, { ...ask, ban: new Set([...(ask.ban ?? []), door]) });
      if (!other?.length) continue;
      const key = doorsOf(other).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(other);
      queue.push(other);
    }
  }
  found.sort((a, b) => length(a) - length(b));
  return [best, ...found.slice(0, max - 1)];
}

/** Of these ways, the one sharing the most entrances with the way the player picked (via), else the first. */
export function pickRoute(routes: Step[][], via: string[] = []): number {
  if (!via.length) return 0;
  let at = 0, most = -1;
  routes.forEach((r, i) => { const n = doorsOf(r).filter(d => via.includes(d)).length; if (n > most) { most = n; at = i; } });
  return at;
}

/** Places the player can type, best matches first: regions before rooms, whole words before parts of words. */
export function searchPlaces(ways: Ways, text: string, limit = 40): string[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: [string, number][] = [];
  for (const [key, [name, region]] of Object.entries(ways.places)) {
    const n = name.toLowerCase(), hay = `${n} ${region.toLowerCase()}`;
    if (!words.every(w => hay.includes(w))) continue;
    let score = key.startsWith('a:') ? 10 : 0;
    if (!words.every(w => n.includes(w))) score += 5;
    if (!n.startsWith(words[0])) score += 2;
    out.push([key, score + n.length / 100]);
  }
  return out.sort((a, b) => a[1] - b[1]).slice(0, limit).map(([k]) => k);
}

/** The song a warp needs, by OoTMM's item name without its game ('SONG_TP_FOREST', 'SONG_SOARING'), or null. */
export function warpSong(ways: Ways, door: string): string | null {
  const from = ways.doors[door]?.[0] ?? '';
  if (!from.startsWith('*')) return null;
  const m = from.match(/SONG_TP_[A-Z]+|SOARING/);
  return m ? (m[0] === 'SOARING' ? 'SONG_SOARING' : m[0]) : null;
}

/**
 * Where to start in a place the player picked (the game didn't say the exact spot): its main area, the one named like
 * the place ("OOT Lake Hylia" for Lake Hylia), so the rules inside the place still count. Else the spots entrances
 * arrive at, else anywhere in it.
 */
export function startAreas(ways: Ways, place: string): string[] {
  const all = areasIn(ways, place);
  const name = ways.places[place]?.[0]?.toLowerCase();
  const main = all.filter(a => a.replace(/^(OOT|MM) /, '').toLowerCase() === name);
  if (main.length) return main;
  const arrive = new Set(Object.values(ways.doors).map(d => d[1]));
  const door = all.filter(a => arrive.has(a));
  return door.length ? door : all;
}

/** Every area in a place, to start from when the player picked the place rather than the game saying. */
export function areasIn(ways: Ways, place: string): string[] {
  return Object.entries(ways.areas).filter(([, [p]]) => p === place).map(([a]) => a);
}
