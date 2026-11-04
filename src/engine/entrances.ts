/**
 * Works out which entrances the settings shuffle and where each one is allowed
 * to go. It runs OoTMM's own pool setup and stops just before anything is
 * randomized, so no seed's real connections are ever computed or stored here.
 */
import { ENTRANCES } from '@ootmm/data';
import { ChecklistWorldShuffler, DUNGEONS_REGIONS } from '@ootmm/logic';
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
};
export type EntranceDest = { id: string; game: 'oot' | 'mm'; title: string; sub: string; groupName: string };
export type EntranceData = {
  list: EntranceEntry[];
  dests: EntranceDest[];
  sets: number[][];
  rev: Record<string, string>;
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

function describeSource(e: any) {
  const from = clean(e.from), to = clean(e.to);
  switch (e.type) {
    case 'spawn-child': return { title: 'Child spawn', sub: 'Where child Link starts' };
    case 'spawn-adult': return { title: 'Adult spawn', sub: 'Where adult Link starts' };
    case 'wallmaster': return { title: from, sub: 'Where this Wallmaster drops you' };
    case 'one-way-song': return { title: `Warp song to ${to}`, sub: '' };
    case 'one-way-statue': return { title: `Soaring to ${to.replace(/^Owl /, '')}`, sub: '' };
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

  const regionOf = (area: string) => world.areas[area]?.region as string | undefined;
  const groupOf = (e: any) => {
    const near = e.type.endsWith('-exit') ? [regionOf(e.to), regionOf(e.from)] : [regionOf(e.from), regionOf(e.to)];
    return near.find(validRegion) ?? 'NONE';
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
        dests.push({ id: d, game: de.game, ...describeDest(de), groupName: groupLabel(groupOf(de)) });
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
      dungeon: DUNGEON_REGIONS.has(group), allowed: set, reusable: reusable.has(id),
    });
  }
  return { list, dests, sets, rev };
}
