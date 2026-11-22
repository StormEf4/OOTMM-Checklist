/*
 * Game tracking for entrances: works out which door on the Entrances tab the player just walked through, from what the
 * game reported (see gamefeed.ts).
 *
 * The game names the door by OoTMM's name for its normal destination. Most of the time that is exactly a row on the
 * Entrances tab. A few doors are reported by a shared name instead, so this module picks the one in the place the
 * player was standing:
 * - grottos are reported by their kind (OOT_GROTTO_TYPE_GENERIC...), not by which hole it was;
 * - Zora River's water way in and out, the Lost Woods door in Kokiri Forest and the Great Fairy fountain exits by the
 *   castle use a second name for the same door;
 * - MM's spring versions of the swamp, Mountain Village, Goron Village and Twin Islands have no name the OoTMM Client
 *   knows, so they come in as UNKNOWN.
 * When more than one door still fits (Hyrule Field has three plain grottos), the app asks the player which it was,
 * once they've left (walking back out of a grotto often answers it first).
 * - Warp songs, soaring and being thrown out of a place don't name a door at all. Being thrown out is told by the place
 *   the player was in; a warp is asked about straight away, among the warps that could land there.
 *
 * Only the door just used and where it led are ever logged. Nothing here reads or works out any other connection.
 */

export type FeedEntranceList = {
  /** Rows the player can log (not fixed), with the destinations each allows. */
  rows: { id: string; allowed: Set<string> }[];
  /** OoTMM's normal layout: [area left, area reached, region left, region reached]. */
  sides: Record<string, [string, string, string, string]>;
};

/** Where the player is: the area and region of the last place the game said they arrived. */
export type Here = { area: string; region: string } | null;

const SHARED: [RegExp, (id: string) => boolean][] = [
  [/^OOT_GROTTO_TYPE_GENERIC$/, id => id.startsWith('OOT_GROTTO_GENERIC_')],
  [/^OOT_GROTTO_TYPE_FAIRY$/, id => id.startsWith('OOT_GROTTO_FAIRY_')],
  [/^OOT_GROTTO_TYPE_SCRUB2$/, id => id.startsWith('OOT_GROTTO_SCRUBS2_')],
  [/^OOT_GROTTO_TYPE_SCRUB3$/, id => id.startsWith('OOT_GROTTO_SCRUBS3_')],
  [/^MM_GROTTO_TYPE_GENERIC$/, id => id.startsWith('MM_GROTTO_GENERIC_')],
  [/^MM_GROTTO_TYPE_COW$/, id => id.startsWith('MM_GROTTO_COW_')],
  [/^OOT_ZORA_RIVER_FROM_FIELD_WATER$/, id => id === 'OOT_ZORA_RIVER_FROM_FIELD'],
  [/^OOT_FIELD_FROM_ZORA_RIVER_WATER$/, id => id === 'OOT_FIELD_FROM_ZORA_RIVER'],
  [/^OOT_HYRULE_CASTLE_FROM_FAIRY$/, id => id === 'OOT_HYRULE_CASTLE_FROM_FAIRY' || id === 'OOT_OUTSIDE_GANON_FROM_FAIRY'],
  [/^OOT_LOST_WOODS_FROM_KOKIRI_FOREST$/, id => id === 'OOT_LOST_WOODS_FROM_KOKIRI_FOREST' || id === 'OOT_LOST_WOODS_FROM_LOST_WOODS_NORTH'],
];

/** Where the player stands after arriving through this entrance, or null when OoTMM's data doesn't say. */
export function arrivedAt(entrance: string, data: FeedEntranceList): Here {
  const s = data.sides[entrance];
  return s ? { area: s[1], region: s[3] } : null;
}

/* Doors that send the player somewhere without the game naming the door: being thrown out by pirates, Gerudo guards,
   the Deku Palace guards or Gorman's track at night. Each one goes where its normal door does, so the place the player
   was in says which it was. */
const THROWN_OUT = new Set(['MM_PIRATE_FORTRESS_EXTERIOR_FROM_INTERIOR', 'MM_GREAT_BAY_FROM_PIRATE_FORTRESS', 'MM_DEKU_PALACE_EXTERIOR_FROM_THRONE',
  'MM_DEKU_PALACE_EXTERIOR_FROM_THRONE_CAGE', 'MM_MILK_ROAD_FROM_GORMAN_TRACK', 'MM_MILK_ROAD_FROM_GORMAN_BACK']);
/* Warp songs and soaring don't name the song or the owl, only where the player landed. */
const WARPS = /_WARP_SONG_|_WARP_OWL_/;

export type DoorAnswer =
  /** The door, for sure. */
  | { door: string }
  /** One of these doors, and the game can't say which. now: ask straight away (a warp, where nothing later tells);
      otherwise wait until the player leaves, since walking back out often tells (see the app's way-out logging). */
  | { choices: string[]; now: boolean }
  | null;

/**
 * The Entrances tab row the player just went through. dest is where the game says they arrived. lastArrival is the
 * place they arrived at before this, so a respawn (which sends them back there) isn't taken for a warp. logged says
 * whether a row is already filled in: a warp is only asked about on rows still empty.
 */
export function whichDoor(original: string, dest: string, here: Here, lastArrival: string, data: FeedEntranceList, logged: (id: string) => boolean): DoorAnswer {
  if (!dest || dest === 'UNKNOWN') return null;
  const fits = (r: { allowed: Set<string> }) => r.allowed.has(dest);
  if (!original) {
    if (dest === lastArrival) return null;
    const thrown = here ? data.rows.filter(r => THROWN_OUT.has(r.id) && data.sides[r.id]?.[0] === here.area && fits(r)) : [];
    if (thrown.length === 1 && !logged(thrown[0].id)) return { door: thrown[0].id };
    const warps = data.rows.filter(r => WARPS.test(r.id) && fits(r) && !logged(r.id));
    const all = [...thrown.filter(r => !logged(r.id)), ...warps].map(r => r.id);
    return all.length ? { choices: all, now: true } : null;
  }
  const direct = data.rows.find(r => r.id === original);
  /* The exact door, unless it's one of the doors that share a name. */
  const shared = SHARED.find(([re]) => re.test(original));
  if (direct && !shared) return fits(direct) ? { door: direct.id } : null;
  let pool = shared ? data.rows.filter(r => shared[1](r.id)) : original === 'UNKNOWN' ? data.rows : [];
  pool = pool.filter(fits);
  if (!pool.length) return null;
  if (pool.length === 1 && shared) return { door: pool[0].id };
  const ask = (rows: typeof pool) => rows.length === 1 ? { door: rows[0].id } : { choices: rows.map(r => r.id), now: false };
  if (!here) return shared ? ask(pool) : null;
  /* The doors leaving the exact spot the player was in, else the doors leaving that region. */
  const at = (k: 0 | 2, v: string) => pool.filter(r => data.sides[r.id]?.[k] === v);
  const inArea = at(0, here.area);
  if (inArea.length) return ask(inArea);
  if (original === 'UNKNOWN') return null;
  const inRegion = here.region !== 'NONE' ? at(2, here.region) : [];
  return inRegion.length ? ask(inRegion) : null;
}
