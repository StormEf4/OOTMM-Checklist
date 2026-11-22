/**
 * Works out which entrances the settings shuffle and where each one is allowed
 * to go. It runs OoTMM's own pool setup and stops just before anything is
 * randomized, so no seed's real connections are ever computed or stored here.
 */
import { ENTRANCES } from '@ootmm/data';
import { ChecklistLogicPassEntrances, ChecklistWorldShuffler, DUNGEONS_REGIONS, ItemGroups, checklistDungeonItems } from '@ootmm/logic';
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
     path: a road to another area (shown as enter and exit rows under its two areas). other: spawns, songs, bosses and the rest. */
  dir?: 'in' | 'out' | 'path' | 'other' | 'enter' | 'exit';
  /* OoTMM's code for the dungeon a dungeon entrance, exit or boss door belongs to. */
  dungeonOf?: string;
  /* A road between two areas (dir 'path'): toGroup is the area it normally arrives in. from and into name the spots
     it starts from and arrives at. */
  toGroup?: string;
  toGroupName?: string;
  from?: string;
  into?: string;
  /* The one area a road lists under: the place it leads into or out of (group or toGroup). */
  home?: string;
  homeName?: string;
  homeDungeon?: boolean;
  /* A road these settings don't shuffle. It shows so every area has its ways in and out, but there's nothing to log. */
  fixed?: boolean;
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
  /* Each dungeon map and compass, with the dungeons it covers. A compass asks for the boss and a map for the way in,
     and the player fills both in. */
  dungeonItems?: Record<string, { kind: 'map' | 'compass'; dungeons: string[] }>;
  /* For game tracking: every entrance's two sides, as [area it leaves, area it reaches, region it leaves, region it
     reaches]. Only OoTMM's normal layout, never a seed's connections. It tells which door the player just used when the
     game only says what kind of door it was (a grotto, say), from the place the player was in. */
  sides?: Record<string, [string, string, string, string]>;
  /* For directions: OoTMM's normal map of the world. See Ways. */
  ways?: Ways;
  error?: string;
};

/**
 * OoTMM's normal map, for directions. Only the layout every seed starts from and what the settings themselves fix (the
 * link between the games, plando), never a seed's shuffled connections: the app routes through a shuffled entrance only
 * once the player has logged where it leads (see directions.ts).
 */
export type Ways = {
  /** Each area: [the place it belongs to, the region it lists under]. A place is a region's id, or 'a:' and the area for
      a room of its own (a house, a grotto). */
  areas: Record<string, [string, string]>;
  /** Each place: [name, the region it's in for a room ('' for a region), game]. */
  places: Record<string, [string, string, 'oot' | 'mm']>;
  /** Walking from area to area without a loading zone: OoTMM's area exits that aren't entrances, rules left out. */
  walk: Record<string, string[]>;
  /** Every entrance the directions can use: [area it leaves, area it normally reaches, OoTMM's entrance type, name]. A
      warp song or soaring is played from anywhere: its area is '*' and OoTMM's area for the song ('*OOT SONG_TP_FOREST'). */
  doors: Record<string, [string, string, string, string]>;
  /** Entrances the settings send elsewhere without shuffling them (the link between the games, plando). */
  set: Record<string, string>;
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

/* Roads between areas: OoTMM's region and overworld entrances, both ways (a region's way back is a region-exit). */
const isRoad = (type: string) => /^(region|overworld)/.test(type);

function entranceDir(type: string): EntranceEntry['dir'] {
  if (isRoad(type)) return 'path';
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
  if (isRoad(e.type)) return { title: `Way to ${to}`, sub: `from ${from}` };
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
    /* A road lists under the area it leaves, the way back from a region included. */
    if (isRoad(e.type)) return [ownRegion(e.from), regionOf(e.from)].find(validRegion) ?? 'NONE';
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
        dests.push({ id: d, game: de.game, ...describeDest(de), groupName: groupLabel(groupOf(de)), dungeonOf: de.type.startsWith('dungeon') && de.type !== 'dungeon-exit' ? dungeonOf(de) : undefined });
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
  /* Every road gets its arriving area. Roads these settings leave alone are added as fixed rows, so each area shows
     all its ways in and out. Only OoTMM's normal layout is read for them, and a road plando or the link between the
     games changed is left out. */
  const roadEnd = (e: any) => [ownRegion(e.to), regionOf(e.to)].find(validRegion) ?? 'NONE';
  const inPools = new Set([...allowedBySource.keys(), ...destIndex.keys()]);
  for (const x of list) {
    const e = (ENTRANCES as any)[x.id];
    if (!isRoad(e.type)) continue;
    const to = roadEnd(e);
    Object.assign(x, { toGroup: to, toGroupName: groupLabel(to), from: clean(e.from), into: clean(e.to) });
  }
  let empty = sets.findIndex(s => !s.length);
  for (const [id, e] of Object.entries(ENTRANCES as Record<string, any>)) {
    if (!isRoad(e.type) || inPools.has(id) || (e.reverse && allowedBySource.has(e.reverse))) continue;
    if (shuffler.overrides?.[id] || !world.areas[e.from]?.exits?.[e.to]) continue;
    const group = groupOf(e), to = roadEnd(e);
    if (group === to || group === 'NONE' || to === 'NONE') continue;
    if (empty < 0) { empty = sets.length; sets.push([]); }
    list.push({
      id, game: e.game, kind: entranceKind(e.type), ...describeSource(e), group, groupName: groupLabel(group),
      dungeon: DUNGEON_REGIONS.has(group), allowed: empty, reusable: false, dir: 'path',
      toGroup: to, toGroupName: groupLabel(to), from: clean(e.from), into: clean(e.to), fixed: true,
    });
  }
  /* The child and adult spawns always show under "Where you start". When the settings don't shuffle them, they're
     fixed rows naming where they always lead. */
  for (const id of ['OOT_SPAWN_CHILD', 'OOT_SPAWN_ADULT']) {
    const e = (ENTRANCES as any)[id];
    if (!e || allowedBySource.has(id) || !world.areas[e.to]) continue;
    if (empty < 0) { empty = sets.length; sets.push([]); }
    const d = describeSource(e), group = groupOf(e);
    list.push({
      id, game: e.game, kind: entranceKind(e.type), title: d.title, sub: `${d.sub}: always ${clean(e.to)}`, group, groupName: groupLabel(group),
      dungeon: false, allowed: empty, reusable: false, dir: 'other', fixed: true,
    });
  }
  /* Each road and its way back list under one area only: the place they lead into and out of, like Lon Lon Ranch for
     the ranch's gate, never the hub they join (owner's choice, Nov 20 2026). OoTMM marks the hub side of region roads
     (a region-exit leaves the place, a region road enters it). For other roads the place is the side OoTMM names the
     road after, else the side with fewer roads, so a hub like Hyrule Field or Termina Field doesn't take them. */
  const roads = list.filter(x => x.toGroup);
  const near = new Map<string, Set<string>>();
  for (const x of roads) for (const [a, b] of [[x.group, x.toGroup!], [x.toGroup!, x.group]]) (near.get(a) ?? near.set(a, new Set()).get(a)!).add(b);
  const ends = (id: string) => { const e = (ENTRANCES as any)[id]; return [groupOf(e), roadEnd(e)] as const; };
  const homeOf = (id: string): string => {
    const e = (ENTRANCES as any)[id];
    const [from, to] = ends(id);
    const back = e.reverse && (ENTRANCES as any)[e.reverse];
    if (e.type.startsWith('region')) return e.type === 'region-exit' ? from : to;
    if (back?.type.startsWith('region')) return back.type === 'region-exit' ? to : from;
    if (!back) return to;
    const named = [id, e.reverse].filter(x => !x.includes('_FROM_'));
    if (named.length === 1) return named[0] === id ? to : from;
    const size = (g: string) => near.get(g)?.size ?? 0;
    if (size(from) !== size(to)) return size(to) < size(from) ? to : from;
    return id < e.reverse ? to : from;
  };
  for (const x of roads) { const home = homeOf(x.id); Object.assign(x, { home, homeName: groupLabel(home), homeDungeon: DUNGEON_REGIONS.has(home) }); }
  const bosses: Record<string, { door: string; name: string }> = {};
  for (const [id, e] of Object.entries(ENTRANCES as Record<string, any>)) {
    if (e.type !== 'boss') continue;
    const d = dungeonOf(e);
    if (d && !bosses[d]) bosses[d] = { door: id, name: String(e.debug?.[1] ?? clean(e.to)) };
  }
  const sides: Record<string, [string, string, string, string]> = {};
  for (const [id, e] of Object.entries(ENTRANCES as Record<string, any>)) {
    if (!e.from || e.from === 'NONE') continue;
    const reg = (a: string) => [ownRegion(a), regionOf(a)].find(validRegion) ?? 'NONE';
    sides[id] = [e.from, e.to, reg(e.from), reg(e.to)];
  }
  return { list, dests, sets, rev, bosses, dungeonItems: dungeonItems(), sides, ways: worldWays(world, shuffler.overrides ?? {}, ownRegion, regionOf, groupLabel) };
}

/* The pieces of OoTMM's normal map that directions need (see Ways). */
function worldWays(world: any, overrides: Record<string, string>, ownRegion: (a: string) => string | undefined, regionOf: (a: string) => string | undefined, groupLabel: (g: string) => string): Ways {
  const system = (a: string) => isSystemName(clean(a));
  const doorAt = new Set<string>();
  const doors: Ways['doors'] = {};
  const SKIP = /^(wallmaster|one-way-water-void)/;
  for (const [id, e] of Object.entries(ENTRANCES as Record<string, any>)) {
    if (!e.from || !e.to || e.from === 'NONE') continue;
    doorAt.add(e.from + '\n' + e.to);
    if (SKIP.test(e.type) || system(e.to) || !world.areas[e.to]) continue;
    const anywhere = system(e.from);
    if (!anywhere && !world.areas[e.from]?.exits?.[e.to]) continue;
    const d = describeSource(e);
    doors[id] = [anywhere ? '*' + e.from : e.from, e.to, e.type, d.title];
  }
  const walk: Ways['walk'] = {};
  for (const [a, area] of Object.entries(world.areas as Record<string, any>)) {
    if (system(a)) continue;
    const out = Object.keys(area.exits ?? {}).filter(b => !system(b) && world.areas[b] && !doorAt.has(a + '\n' + b));
    if (out.length) walk[a] = out;
  }
  /* A place is a region, or a room of its own: an area with no region that an entrance leads into (a house, a grotto),
     with the region-less areas it walks on to (the rest of the house). Any other area without a region belongs to the
     nearest region. */
  const room = new Map<string, string>();
  const ring = [...new Set(Object.values(doors).map(d => d[1]))].filter(a => !validRegion(ownRegion(a)));
  for (const a of ring) room.set(a, 'a:' + a);
  for (let i = 0; i < ring.length; i++) for (const b of walk[ring[i]] ?? []) {
    if (room.has(b) || validRegion(ownRegion(b))) continue;
    room.set(b, room.get(ring[i])!);
    ring.push(b);
  }
  const areas: Ways['areas'] = {};
  const places: Ways['places'] = {};
  for (const [a, area] of Object.entries(world.areas as Record<string, any>)) {
    if (system(a)) continue;
    const own = ownRegion(a), near = validRegion(own) ? own! : regionOf(a) ?? 'NONE';
    const key = room.get(a) ?? (near === 'NONE' ? 'a:' + a : near);
    areas[a] = [key, near];
    if (!places[key]) places[key] = key.startsWith('a:') ? [clean(key.slice(2)), near === 'NONE' ? '' : groupLabel(near), area.game] : [groupLabel(key), '', area.game];
  }
  const set: Ways['set'] = {};
  for (const [src, dst] of Object.entries(overrides)) if (doors[src] && (ENTRANCES as any)[dst]) set[src] = dst;
  return { areas, places, walk, doors, set };
}

/* OoTMM keeps one map and compass for a dungeon whose halves are separate dungeons in its world, such as Stone Tower
   Temple and its inverted side. Those halves take the items of the dungeon whose region name theirs extends. */
function dungeonItems() {
  const out: Record<string, { kind: 'map' | 'compass'; dungeons: string[] }> = {};
  const owners = checklistDungeonItems as Record<string, { id: string }[]>;
  const regions = DUNGEONS_REGIONS as Record<string, string>;
  for (const [d, items] of Object.entries(owners)) {
    const halves = Object.keys(regions).filter(o => !owners[o] && regions[d] && regions[o]?.startsWith(regions[d] + '_'));
    for (const item of items) {
      const kind = ItemGroups.MAPS.has(item as any) ? 'map' : ItemGroups.COMPASSES.has(item as any) ? 'compass' : null;
      if (kind) out[item.id] = { kind, dungeons: [d, ...halves] };
    }
  }
  return out;
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
