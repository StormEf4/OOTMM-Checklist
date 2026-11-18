/**
 * Works out which entrances the settings shuffle and where each one is allowed
 * to go. It runs OoTMM's own pool setup and stops just before anything is
 * randomized, so no seed's real connections are ever computed or stored here.
 */
import { ENTRANCES } from '@ootmm/data';
import { ChecklistLogicPassEntrances, ChecklistWorldShuffler, DUNGEONS_REGIONS } from '@ootmm/logic';
import { regionName } from '@ootmm/regions';

export type EntranceEntry = {
  id: string;
  game: 'oot' | 'mm';
  kind: string;
  title: string;
  sub: string;
  group: string;
  groupName: string;
  dungeon: boolean;
  allowed: number;
  reusable: boolean;
  /* in: a door from this area into a house, grotto or dungeon. out: leaving one of those, back to this area.
     path: a road to another area. other: spawns, songs, bosses and the rest. */
  dir?: 'in' | 'out' | 'path' | 'other';
  /* OoTMM's code for the dungeon a dungeon entrance, exit or boss door belongs to. */
  dungeonOf?: string;
};
export type EntranceDest = { id: string; game: 'oot' | 'mm'; title: string; sub: string; groupName: string; dungeonOf?: string };
export type EntranceData = {
  list: EntranceEntry[];
  dests: EntranceDest[];
  sets: number[][];
  rev: Record<string, string>;
  /* Each dungeon's boss door and the boss normally behind it, from OoTMM's entrance data. A dungeon not listed has
     no boss. */
  bosses?: Record<string, { door: string; name: string }>;
  error?: string;
};

const EMPTY: EntranceData = { list: [], dests: [], sets: [], rev: {} };
const clean = (a: string) => a.replace(/^(OOT|MM) /, '');
const isSystemName = (a: string) => /^[A-Z_ ]+$/.test(a);
const validRegion = (r?: string) => !!r && !['NONE', 'ENTRANCE', 'BUFFER', 'BUFFER_DELAYED'].includes(r);
const DUNGEON_REGIONS = new Set(Object.values(DUNGEONS_REGIONS) as string[]);

export function entranceKind(type: string) {
  if (type === 'boss') return 'Bosses';
  if (type.startsWith('dungeon')) return 'Dungeons';
  if (type.startsWith('grotto') || type.startsWith('grave')) return 'Grottos and graves';
  if (type.startsWith('indoors')) return 'Interiors';
  if (type.startsWith('region')) return 'Regions';
  if (type.startsWith('overworld')) return 'Overworld';
  if (type === 'one-way-song') return 'Warp songs';
  if (type === 'one-way-statue') return 'Soaring';
  if (type.startsWith('one-way')) return 'One-ways';
  if (type === 'wallmaster') return 'Wallmasters';
  if (type.startsWith('spawn')) return 'Spawns';
  return type.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}

function entranceDir(type: string): EntranceEntry['dir'] {
  if (type.endsWith('-exit')) return 'out';
  if (/^(dungeon|indoors|grotto|grave)/.test(type)) return 'in';
  if (/^(region|overworld)/.test(type)) return 'path';
  return 'other';
}

/* OoTMM names each warp song entrance by the song's first word. */
const WARP_SONGS: Record<string, string> = {
  Minuet: 'Minuet of Forest', Bolero: 'Bolero of Fire', Serenade: 'Serenade of Water',
  Requiem: 'Requiem of Spirit', Nocturne: 'Nocturne of Shadow', Prelude: 'Prelude of Light',
};

function describeSource(e: any) {
  const from = clean(e.from), to = clean(e.to);
  switch (e.type) {
    case 'spawn-child': return { title: 'Child spawn', sub: 'Where child Link starts' };
    case 'spawn-adult': return { title: 'Adult spawn', sub: 'Where adult Link starts' };
    case 'wallmaster': return { title: from, sub: 'Where this Wallmaster drops you' };
    case 'one-way-song': { const song = WARP_SONGS[e.debug?.[1]]; return { title: song ?? `Warp song to ${to}`, sub: song ? `normally warps to ${to}` : '' }; }
    case 'one-way-statue': return { title: `SOS (${to.replace(/^Owl /, '')})`, sub: '' };
    case 'one-way-water-void': return { title: from, sub: 'Falling in the water' };
    case 'boss': return { title: `Boss door: ${e.debug?.[1] ?? to}`, sub: `in ${from}` };
  }
  if (e.type.endsWith('-exit')) return { title: `Exit of ${from}`, sub: `normally leads to ${to}` };
  const door = /^(dungeon|indoors|grotto|grave)/.test(e.type);
  return { title: `${door ? 'Entrance to' : 'Way to'} ${to}`, sub: `from ${from}` };
}

function describeDest(e: any) {
  const from = clean(e.from), to = clean(e.to);
  if (to === 'VOID') return { title: `Respawn point of ${from}`, sub: '' };
  if (e.type === 'boss') return { title: `Boss room: ${e.debug?.[1] ?? to}`, sub: '' };
  return { title: to, sub: isSystemName(from) ? '' : `arriving from ${from}` };
}

export function shuffledEntrances(state: any): EntranceData {
  const { random, worlds, settings, startingItems, allItems } = state;
  const world = worlds[0];
  const shuffler: any = new ChecklistWorldShuffler(random, 0, worlds, settings, startingItems, allItems);

  /* Let OoTMM connect the games and apply plando, then stop before it places anything. */
  const stop = {};
  let descrs: Record<string, { src: string[]; dst: string[]; opts: { alias?: boolean; ownGame?: boolean } }> = {};
  shuffler.placePools = (d: typeof descrs) => { descrs = d; throw stop; };
  try {
    shuffler.run();
  } catch (e) {
    if (e !== stop) return { ...EMPTY, error: String((e as Error)?.message ?? e) };
  }

  const allowedBySource = new Map<string, Set<string>>();
  const reusable = new Set<string>();
  for (const descr of Object.values(descrs)) {
    const { src, dst } = shuffler.poolEntrancesForTypes(descr.src, descr.dst, !!descr.opts.alias);
    for (const s of src as Set<string>) {
      const allowed = allowedBySource.get(s) ?? new Set<string>();
      for (const d of dst as Set<string>) if (shuffler.isAssignableConstraints(s, d, !!descr.opts.ownGame)) allowed.add(d);
      allowedBySource.set(s, allowed);
      if (descr.opts.alias) reusable.add(s);
    }
  }

  /* Some rooms, like the Goron Shop or the Astral Observatory passage, sit in areas that OoTMM gives no region.
     Those take the region of the nearest area they lead to, so they list under the place the player walks in from. */
  const ownRegion = (area: string) => world.areas[area]?.region as string | undefined;
  const regionOf = (area: string) => {
    if (validRegion(ownRegion(area))) return ownRegion(area);
    const seen = new Set([area]);
    let ring = [area];
    for (let step = 0; step < 3 && ring.length; step++) {
      const next: string[] = [];
      for (const a of ring) for (const b of Object.keys(world.areas[a]?.exits ?? {})) {
        if (seen.has(b) || /GLOBAL/.test(b)) continue;
        seen.add(b);
        if (validRegion(ownRegion(b))) return ownRegion(b);
        next.push(b);
      }
      ring = next;
    }
    return undefined;
  };
  const groupOf = (e: any) => {
    const near = e.type.endsWith('-exit') ? [ownRegion(e.to), ownRegion(e.from), regionOf(e.to), regionOf(e.from)] : [ownRegion(e.from), ownRegion(e.to), regionOf(e.from), regionOf(e.to)];
    return near.find(validRegion) ?? 'NONE';
  };

  /* Dungeon doors and boss doors know their dungeon through the area on the dungeon side. */
  const dungeonOf = (e: any): string | undefined => {
    const inside = e.type === 'dungeon-exit' || e.type === 'boss' ? e.from : e.type.startsWith('dungeon') ? e.to : null;
    return (inside && world.areas[inside]?.dungeon) || undefined;
  };
  const groupLabel = (g: string) => g === 'NONE' ? 'Elsewhere' : regionName(g);

  const destIndex = new Map<string, number>();
  const dests: EntranceDest[] = [];
  const setIndex = new Map<string, number>();
  const sets: number[][] = [];
  const list: EntranceEntry[] = [];
  const rev: Record<string, string> = {};

  for (const [id, allowed] of allowedBySource) {
    const e = (ENTRANCES as any)[id];
    const indices = [...allowed].map(d => {
      let i = destIndex.get(d);
      if (i === undefined) {
        i = dests.length;
        destIndex.set(d, i);
        const de = (ENTRANCES as any)[d];
        dests.push({ id: d, game: de.game, ...describeDest(de), groupName: groupLabel(groupOf(de)), dungeonOf: dungeonOf(de) });
        const back = shuffler.reverseEntrance(d);
        if (back) rev[d] = back;
      }
      return i;
    }).sort((a, b) => a - b);
    const key = indices.join(',');
    let set = setIndex.get(key);
    if (set === undefined) { set = sets.length; setIndex.set(key, set); sets.push(indices); }
    const group = groupOf(e);
    const back = shuffler.reverseEntrance(id);
    if (back) rev[id] = back;
    list.push({
      id, game: e.game, kind: entranceKind(e.type), ...describeSource(e), group, groupName: groupLabel(group),
      dungeon: DUNGEON_REGIONS.has(group), allowed: set, reusable: reusable.has(id), dir: entranceDir(e.type),
      dungeonOf: dungeonOf(e),
    });
  }
  const bosses: Record<string, { door: string; name: string }> = {};
  for (const [id, e] of Object.entries(ENTRANCES as Record<string, any>)) {
    if (e.type !== 'boss') continue;
    const d = dungeonOf(e);
    if (d && !bosses[d]) bosses[d] = { door: id, name: String(e.debug?.[1] ?? clean(e.to)) };
  }
  return { list, dests, sets, rev, bosses };
}

/**
 * Grottos, fairy fountains and shops have no area of their own in OoTMM's data. OoTMM
 * names them after the area their door is in, once entrances are placed. This runs
 * that same step on the normal layout, so they're listed where they usually are.
 * It never looks at a shuffled layout.
 */
export function normalRegions(state: any): { regions: Record<string, string>; areas: Record<string, { region: string }> } {
  const { random, worlds, settings, startingItems, allItems } = state;
  const shuffler: any = new ChecklistWorldShuffler(random, 0, worlds, settings, startingItems, allItems);
  const stop = {};
  shuffler.placePools = () => { throw stop; };
  try { shuffler.run(); } catch (e) { if (e !== stop) throw e; }
  /* Only the links between the two games and plando are applied: nothing is shuffled. */
  const world = shuffler.changedWorld(shuffler.overrides);
  const pass: any = new ChecklistLogicPassEntrances(state);
  pass.worlds = [world];
  pass.processRegions();
  return { regions: world.regions, areas: world.areas };
}
