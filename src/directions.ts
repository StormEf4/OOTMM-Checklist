/*
 * Directions: the way from where the player is to a place they type, through the entrances they have logged.
 *
 * The map is OoTMM's normal one (Ways, from the engine): the areas, the walking between them that needs no loading
 * zone, and every entrance. An entrance the settings shuffle is only used once the player has logged where it leads,
 * and then it goes where they logged it. An entrance the settings leave alone goes where it always does (or where the
 * settings themselves send it: the link between the games, plando). Nothing here ever works out or uses a seed's real
 * connections, and the items and rules needed along the way aren't checked: it's a route, not logic.
 */
import type { Ways } from './engine/entrances';

export type Step =
  /** Go through an entrance. door is OoTMM's id for it; logged says the player logged where it leads. */
  | { kind: 'door'; door: string; from: string; to: string; logged: boolean }
  /** Play a warp song, or soar to an owl statue: works from anywhere. */
  | { kind: 'warp'; door: string; to: string; logged: boolean }
  /** Walk on to another place, with no loading zone in between. */
  | { kind: 'walk'; from: string; to: string };

export type RouteAsk = {
  /** Areas the player could be standing in (one when the game said, a whole place's when they picked it). */
  start: string[];
  /** The place to get to. */
  goal: string;
  /** The player's log: entrance id to the entrance it leads to (their own words, "text:...", lead nowhere known). */
  logged: Record<string, string>;
  /** Entrances these settings shuffle. Each stays closed until it's logged. */
  shuffled: Set<string>;
  /** Whether a warp song or soaring (by entrance id) can be used: the player has the song. */
  canWarp?: (door: string) => boolean;
  /** Entrances to leave out, to find another way. */
  ban?: Set<string>;
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

/**
 * The fewest entrances from the start to the goal, then the fewest warps. Walking within a place is free. Returns the
 * steps, [] when the player is already there, or null when there's no way yet.
 */
export function findRoute(ways: Ways, ask: RouteAsk): Step[] | null {
  if (ask.start.some(a => placeOf(ways, a) === ask.goal)) return [];
  type Edge = { to: string; door?: string; warp?: boolean; logged?: boolean };
  /* Each area's ways out, worked out once per route. */
  const outOf = new Map<string, Edge[]>();
  const warps: Edge[] = [];
  for (const [id, [from]] of Object.entries(ways.doors)) {
    if (ask.ban?.has(id)) continue;
    const t = leadsTo(ways, id, ask);
    if (!t) continue;
    if (from.startsWith('*')) { if (ask.canWarp?.(id)) warps.push({ to: t.area, door: id, warp: true, logged: t.logged }); continue; }
    (outOf.get(from) ?? outOf.set(from, []).get(from)!).push({ to: t.area, door: id, logged: t.logged });
  }
  for (const [a, list] of Object.entries(ways.walk)) {
    const edges = outOf.get(a) ?? outOf.set(a, []).get(a)!;
    for (const b of list) edges.push({ to: b });
  }
  /* Cost: an entrance 2, a warp 3 (a song is slower than a door, but beats a long way round), walking 0. Costs are
     small whole numbers, so a bucket queue does it. */
  const cost = new Map<string, number>();
  const prev = new Map<string, { from: string; edge: Edge }>();
  const buckets: string[][] = [[]];
  for (const a of ask.start) if (ways.areas[a]) { cost.set(a, 0); buckets[0].push(a); }
  let end = '';
  for (let c = 0; c < buckets.length && !end; c++) {
    const q = buckets[c];
    if (!q) continue;
    for (let i = 0; i < q.length; i++) {
      const a = q[i];
      if (cost.get(a) !== c) continue;
      if (placeOf(ways, a) === ask.goal) { end = a; break; }
      const relax = (e: Edge, w: number) => {
        const n = c + w;
        if (n >= (cost.get(e.to) ?? Infinity)) return;
        cost.set(e.to, n);
        prev.set(e.to, { from: a, edge: e });
        (buckets[n] ??= []).push(e.to);
      };
      for (const e of outOf.get(a) ?? []) relax(e, e.door ? 2 : 0);
      for (const e of warps) relax(e, 3);
    }
  }
  if (!end) return null;
  const path: { from: string; edge: Edge }[] = [];
  for (let a = end; prev.has(a); a = prev.get(a)!.from) path.unshift(prev.get(a)!);
  /* Only the entrances make steps. Between them, a walk into another place gets a step of its own. */
  const steps: Step[] = [];
  let at = placeOf(ways, path[0]?.from ?? ask.start[0]);
  for (const { from, edge } of path) {
    if (!edge.door) continue;
    const here = placeOf(ways, from);
    if (!edge.warp && here !== at) steps.push({ kind: 'walk', from: at, to: here });
    const to = placeOf(ways, edge.to);
    steps.push(edge.warp ? { kind: 'warp', door: edge.door, to, logged: !!edge.logged } : { kind: 'door', door: edge.door, from: here, to, logged: !!edge.logged });
    at = to;
  }
  if (at !== ask.goal) steps.push({ kind: 'walk', from: at, to: ask.goal });
  return steps;
}

const doorsOf = (steps: Step[]) => steps.flatMap(s => s.kind === 'walk' ? [] : [s.door]);
const length = (steps: Step[]) => doorsOf(steps).length * 2 + steps.filter(s => s.kind === 'warp').length;

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

/** Every area in a place, to start from when the player picked the place rather than the game saying. */
export function areasIn(ways: Ways, place: string): string[] {
  return Object.entries(ways.areas).filter(([, [p]]) => p === place).map(([a]) => a);
}
