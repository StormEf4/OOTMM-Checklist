/**
 * Works out which checks the player can reach right now, with OoTMM's own logic
 * and pathfinder. Two things go in: the items the player says they have, and the
 * entrances the player has logged. A shuffled entrance the player hasn't logged
 * counts as closed. Nothing here runs a shuffle or guesses a seed's real
 * connections: every shuffled connection in the world comes from the player.
 */
import type { Settings } from '@ootmm/core';

import { Monitor, options } from '@ootmm/core';
import { ENTRANCES } from '@ootmm/data';
import { ChecklistWorldShuffler, ItemGroups, ItemHelpers, Items, Pathfinder, cloneWorld, logicPassPrice, makePlayerItem, worldState } from '@ootmm/logic';
import { itemName } from '@ootmm/names';
import { engineSettings, withRealLogic } from './engine';

export type CatalogItem = { id: string; name: string; game: 'oot' | 'mm' | 'shared'; group: string; max: number; start: number };
export type LogicInput = { settings: Partial<Settings>; entrances: Record<string, string>; items: Record<string, number> };
export type LogicOutput = {
  reach: string[];
  stones: string[];
  catalog: CatalogItem[];
  shuffled: number;
  logged: number;
  spawnsOpen: boolean;
  pricesShuffled: boolean;
  ms: number;
};

const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });

function itemGroup(id: string, item: any): string {
  if (ItemHelpers.isSong(item) || /_SONG_/.test(id)) return 'Songs';
  if (/_MASK_/.test(id)) return 'Masks';
  if (/MEDALLION|_STONE_(EMERALD|RUBY|SAPPHIRE)|_REMAINS_|TRIFORCE/.test(id)) return 'Medallions, stones and remains';
  if (ItemHelpers.isDungeonItem(item) || /_KEY_|KEY_RING|STRAY_FAIRY|RUPEE_SILVER/.test(id)) return 'Keys and dungeon items';
  if (/_OWL_|WORLD_MAP/.test(id)) return 'Owls and maps';
  if (/GS_TOKEN/.test(id)) return 'Skulltula tokens';
  if (/BOTTLE|POTION|MILK|FAIRY$|_POE$|BLUE_FIRE|_FISH|_BUGS|CHATEAU|GOLD_DUST/.test(id)) return 'Bottles and their contents';
  if (/_SHIELD_(DEKU|HYLIAN|HERO)|_STICK$|_NUTS_|_BOMBS_|_ARROWS_|_SEEDS_|BOMBCHU/.test(id) && !/BAG|UPGRADE/.test(id)) return 'Ammo and shields';
  if (/LETTER|DEED|CLAIM|PRESCRIPTION|EYE_DROPS|EYEBALL|POACHER|COJIRO|ODD_|CHICKEN|CUCCO|PENDANT|ROOM_KEY|MOON_TEAR|BROKEN_GORON|MAGIC_BEAN/.test(id)) return 'Trade and quest items';
  return 'Equipment';
}

const consumableName = (id: string, name: string) => /_\d+$/.test(id) ? name.replace(/^\d+ /, '') : name;

type Base = {
  key: string;
  state: any;
  shuffler: any;
  poolSources: Set<string>;
  catalog: CatalogItem[];
  pricesShuffled: boolean;
};
let base: Base | null = null;

async function buildBase(input: Partial<Settings>): Promise<Base> {
  const settings = engineSettings(input);
  const key = JSON.stringify(settings);
  if (base?.key === key) return base;
  const opts = options({ seed: 'checklist', settings: settings as any });
  const state: any = await worldState(monitor, opts);
  /* Fixed prices (vanilla or affordable) are applied. Random prices can't be known, so those stay at the normal price. */
  const PRICE_KEYS = ['priceOotShops', 'priceOotScrubs', 'priceOotMerchants', 'priceMmShops', 'priceMmTingle'];
  const known: any = { ...state.settings };
  let pricesShuffled = false;
  for (const k of PRICE_KEYS) if (known[k] === 'random' || known[k] === 'weighted') { known[k] = 'vanilla'; pricesShuffled = true; }
  logicPassPrice({ ...state, settings: known });
  const { random, worlds, startingItems, allItems, itemProperties } = state;
  const shuffler: any = new ChecklistWorldShuffler(random, 0, worlds, state.settings, startingItems, allItems);

  /* Let OoTMM link the games and apply plando, then stop before it places anything. */
  const stop = {};
  let descrs: Record<string, { src: string[]; dst: string[]; opts: { alias?: boolean } }> = {};
  shuffler.placePools = (d: typeof descrs) => { descrs = d; throw stop; };
  try { shuffler.run(); } catch (e) { if (e !== stop) throw e; }
  const poolSources = new Set<string>();
  for (const d of Object.values(descrs)) {
    const { src } = shuffler.poolEntrancesForTypes(d.src, d.dst, !!d.opts.alias);
    for (const s of src as Set<string>) poolSources.add(s);
  }

  /* Every item that can matter to logic on these settings, with how many exist. */
  const max = new Map<string, number>();
  const start = new Map<string, number>();
  /*
   * Refills, ammo, shields and bottle contents can matter to logic too (a Deku Shield
   * opens the Deku Tree boss). Each kind gets one entry, meaning "I have some".
   * Pack sizes share an entry, and rupees and recovery hearts are left out.
   */
  const consumable = (item: any) => ItemGroups.CONSUMABLES.has(item) && !itemProperties.license.has(item);
  const family = new Map<string, string>();
  const familyOf = (id: string) => id.replace(/_\d+$/, '');
  const add = (item: any, n: number) => {
    let id: string = item.id;
    if (consumable(item)) {
      if (/RUPEE|RECOVERY_HEART|_TRAP/.test(id)) return;
      id = family.get(familyOf(id)) ?? (family.set(familyOf(id), id), id);
      max.set(id, 1);
      return;
    }
    if (itemProperties.important.has(item)) max.set(id, (max.get(id) ?? 0) + n);
  };
  for (const [pi, n] of allItems as Map<any, number>) add(pi.item, n);
  for (const [pi, n] of startingItems as Map<any, number>) {
    const id = consumable(pi.item) ? family.get(familyOf(pi.item.id)) ?? pi.item.id : pi.item.id;
    start.set(id, (start.get(id) ?? 0) + n);
    if (!max.has(id) && itemProperties.important.has(pi.item)) max.set(id, n);
    if (max.has(id)) start.set(id, Math.min(start.get(id)!, max.get(id)!));
  }
  const catalog: CatalogItem[] = [...max].map(([id, n]) => ({
    id,
    name: consumableName(id, itemName(id).replace(/ \((OoT|MM)\)$/i, '')),
    game: id.startsWith('OOT_') ? 'oot' : id.startsWith('MM_') ? 'mm' : 'shared',
    group: itemGroup(id, (Items as any)[id]),
    max: n,
    start: start.get(id) ?? 0,
  }));
  base = { key, state, shuffler, poolSources, catalog, pricesShuffled };
  return base;
}

/** Builds the world as far as the player knows it. */
function knownWorld(b: Base, logged: Record<string, string>) {
  const { shuffler, poolSources } = b;
  const world = cloneWorld(shuffler.world);
  const overrides: Record<string, string> = { ...shuffler.overrides };
  for (const src of poolSources) {
    const dst = logged[src];
    if (dst && !dst.startsWith('text:') && (ENTRANCES as any)[dst]) overrides[src] = dst;
  }
  /* A shuffled entrance only leads where the player logged it. Unlogged ones stay closed. */
  for (const id of new Set([...poolSources, ...Object.keys(overrides)])) {
    const e = (ENTRANCES as any)[id];
    if (e && world.areas[e.from]) delete world.areas[e.from].exits[e.to];
  }
  for (const [src, dst] of Object.entries(overrides)) shuffler.placeSingle(world, src, dst);
  return { world, logged: Object.keys(overrides).filter(k => poolSources.has(k)).length };
}

export async function computeLogic(input: LogicInput): Promise<LogicOutput> {
  return withRealLogic(async () => {
    const t0 = performance.now();
    const b = await buildBase(input.settings);
    const { world, logged } = knownWorld(b, input.entrances);
    const assumed = new Map<any, number>();
    for (const [id, n] of Object.entries(input.items)) {
      const item = (Items as any)[id];
      if (item && n > 0) assumed.set(makePlayerItem(item, 0), n);
    }
    const pf = new Pathfinder([world], b.state.settings, b.state.startingItems);
    const result = pf.run(null, { recursive: true, gossips: true, assumedItems: assumed as any });
    const reach = [...result.locations].map(l => l.replace(/@\d+$/, ''));
    const spawns = [...b.poolSources].filter(s => /^spawn/.test((ENTRANCES as any)[s]?.type ?? ''));
    return {
      reach,
      stones: [...(result.gossips[0] ?? [])],
      catalog: b.catalog,
      shuffled: b.poolSources.size,
      logged,
      spawnsOpen: spawns.every(s => input.entrances[s]),
      pricesShuffled: b.pricesShuffled,
      ms: Math.round(performance.now() - t0),
    };
  });
}
