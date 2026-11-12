/**
 * Works out which checks the player can reach right now, with OoTMM's own logic
 * and pathfinder. Two things go in: the items the player says they have, and the
 * entrances the player has logged. A shuffled entrance the player hasn't logged
 * counts as closed. Nothing here runs a shuffle or guesses a seed's real
 * connections: every shuffled connection in the world comes from the player.
 */
import type { Settings } from '@ootmm/core';

import { Monitor, SETTINGS, options } from '@ootmm/core';
import { ENTRANCES, MACROS, WORLD } from '@ootmm/data';
import { ChecklistLogicPassSolver, ChecklistWorldShuffler, ItemGroups, ItemHelpers, Items, Pathfinder, cloneWorld, logicPassPrice, makePlayerItem, worldState } from '@ootmm/logic';
import { itemName } from '@ootmm/names';
import { engineSettings, withRealLogic } from './engine';
import { ROLLED_CHOICES } from './spoiler';

export type CatalogItem = { id: string; name: string; game: 'oot' | 'mm' | 'shared'; group: string; max: number; start: number };
export type LogicInput = {
  settings: Partial<Settings>;
  entrances: Record<string, string>;
  items: Record<string, number>;
  preCompleted?: string[];
  /** Also try each missing item on its own and report what it would open. Slower, so it's asked for separately. */
  next?: boolean;
};
/** An item the player doesn't have yet, and the checks it would put in logic on its own. */
export type NextItem = { id: string; opens: string[] };
export type LogicOutput = {
  reach: string[];
  stones: string[];
  catalog: CatalogItem[];
  shuffled: number;
  logged: number;
  spawnsOpen: boolean;
  pricesShuffled: boolean;
  /** OoT checks in logic for only one age. Checks both ages can get aren't listed. */
  ages: Record<string, 'child' | 'adult'>;
  /** Only when next was asked for. Best first. */
  next?: NextItem[];
  /** Rolled settings the player hasn't set, so logic only counts checks open on every outcome. */
  unsettled?: string[];
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

const familyOf = (id: string) => id.replace(/_\d+$/, '');
const consumableName = (id: string, name: string) => /_\d+$/.test(id) ? name.replace(/^\d+ /, '') : name;

type Base = {
  key: string;
  state: any;
  shuffler: any;
  poolSources: Set<string>;
  catalog: CatalogItem[];
  /** Catalog id for each item id, and for each ammo family (pack sizes share one entry). */
  catalogFamily: Map<string, string>;
  /** Areas each location sits in. */
  locAreas: Map<string, string[]>;
  pricesShuffled: boolean;
  pre?: { key: string; events: Record<string, any>; start: Map<any, number> };
};
let base: Base | null = null;

async function buildBase(input: Partial<Settings>): Promise<Base> {
  const settings = engineSettings(input);
  const key = JSON.stringify(settings);
  if (base?.key === key) return base;
  const opts = options({ seed: 'checklist', settings: settings as any });
  (globalThis as any).__checklistKeepPool = true;
  let state: any, other: any;
  try {
    state = await worldState(monitor, opts);
    /* A second roll of the same settings shows which parts of the item pool change from seed to seed. */
    other = await worldState(monitor, options({ seed: 'checklist-2', settings: settings as any }));
  } finally { (globalThis as any).__checklistKeepPool = false; }
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
  /*
   * Bottle contents, pond fish and the like are rolled per seed. Every item in a rolled
   * group can be logged, up to how many the group holds, since the player's seed may have any of them.
   */
  const countOf = (pool: Map<any, number>) => { const m = new Map<string, number>(); for (const [pi, n] of pool) m.set(pi.item.id, (m.get(pi.item.id) ?? 0) + n); return m; };
  const mine = countOf(allItems), theirs = countOf(other.allItems);
  const rolled = [...new Set([...mine.keys(), ...theirs.keys()])].filter(id => mine.get(id) !== theirs.get(id));
  if (rolled.length) {
    const groups = Object.values(ItemGroups as Record<string, unknown>).filter((g): g is Set<any> => g instanceof Set);
    for (const id of rolled) {
      const holding = groups.filter(g => [...g].some(i => i.id === id)).sort((a, b) => a.size - b.size)[0];
      if (!holding) continue;
      const total = [...holding].reduce((n, i) => n + (mine.get(i.id) ?? 0), 0);
      for (const item of holding) if (total && !consumable(item)) max.set(item.id, Math.max(max.get(item.id) ?? 0, total));
    }
  }
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
  const catalogFamily = new Map([...catalog.map(i => [i.id, i.id] as const), ...[...family].filter(([f]) => !max.has(f))]);
  const locAreas = new Map<string, string[]>();
  for (const [area, a] of Object.entries(shuffler.world.areas as Record<string, any>)) {
    for (const loc of Object.keys(a.locations)) (locAreas.get(loc) ?? locAreas.set(loc, []).get(loc)!).push(area);
  }
  base = { key, state, shuffler, poolSources, catalog, catalogFamily, locAreas, pricesShuffled };
  return base;
}

/**
 * What pre-completed dungeons change, worked out by OoTMM's own solver code: region
 * states that start cleared, and the boss souls, keys and silver rupees the player
 * starts with. Only the dungeons the player says were pre-completed are used.
 */
function preCompleteEffects(b: Base, dungeons: string[]) {
  const key = [...dungeons].sort().join(',');
  if (b.pre?.key === key) return b.pre;
  const { state } = b;
  const world = cloneWorld(b.shuffler.world);
  const known = new Set(Object.keys(world.dungeons));
  world.preCompleted = new Set(dungeons.filter(d => known.has(d)));
  const before = { ...world.areas['OOT SPAWN'].events };
  const solver = Object.create(ChecklistLogicPassSolver.prototype);
  Object.assign(solver, {
    input: { ...state, settings: { ...state.settings, preCompletedDungeons: true } },
    worlds: [world],
    state: { startingItems: new Map(), items: new Map(), pools: { required: new Map(state.allItems) } },
    selectPreCompletedDungeons: () => {},
    tryJunk: () => {},
  });
  if (world.preCompleted.size) solver.preCompleteDungeons();
  const events: Record<string, any> = {};
  for (const [k, v] of Object.entries(world.areas['OOT SPAWN'].events)) if (!(k in before)) events[k] = v;
  b.pre = { key, events, start: solver.state.startingItems };
  return b.pre;
}

/** Builds the world as far as the player knows it. */
function knownWorld(b: Base, logged: Record<string, string>, pre: { events: Record<string, any> }) {
  const { shuffler, poolSources } = b;
  const world = cloneWorld(shuffler.world);
  Object.assign(world.areas['OOT SPAWN'].events, pre.events);
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

let logicText = '';
/** Rolled choices the player hasn't set yet that OoTMM's logic files read, like starting age. */
function unsettledChoices(settings: any): string[] {
  const open = ROLLED_CHOICES.filter(k => settings[k] === 'random');
  if (!open.length) return [];
  logicText ||= JSON.stringify(WORLD) + JSON.stringify(MACROS);
  return open.filter(k => logicText.includes(`setting(${k}`));
}

/**
 * Logic for one seed. A setting the seed rolled, like starting age, can't be read by
 * OoTMM until it's known, so until the player sets it, only checks in logic for
 * every outcome count.
 */
export async function computeLogic(input: LogicInput): Promise<LogicOutput> {
  const open = unsettledChoices(input.settings);
  if (!open.length) return computeOne(input);
  let combos: Record<string, string>[] = [{}];
  for (const k of open) {
    const def = (SETTINGS as readonly any[]).find(s => s.key === k);
    const vals = def.values.map((v: any) => v.value).filter((v: string) => v !== 'random');
    combos = combos.flatMap(c => vals.map((v: string) => ({ ...c, [k]: v })));
  }
  const outs: LogicOutput[] = [];
  for (const c of combos) outs.push(await computeOne({ ...input, settings: { ...input.settings, ...c } }));
  const both = <T,>(lists: T[][]) => lists.slice(1).reduce((acc, l) => { const s = new Set(l); return acc.filter(x => s.has(x)); }, lists[0]);
  const reach = both(outs.map(o => o.reach));
  const keep = new Set(reach);
  const first = outs[0];
  return {
    ...first,
    reach,
    stones: both(outs.map(o => o.stones)),
    ages: Object.fromEntries(Object.entries(first.ages).filter(([k, v]) => keep.has(k) && outs.every(o => o.ages[k] === v))),
    next: first.next?.map(n => ({ id: n.id, opens: both(outs.map(o => [...new Set([...o.reach, ...(o.next?.find(x => x.id === n.id)?.opens ?? [])])])).filter(x => !keep.has(x)) })).filter(n => n.opens.length).sort((x, y) => y.opens.length - x.opens.length),
    unsettled: open,
    ms: outs.reduce((a, o) => a + o.ms, 0),
  };
}

async function computeOne(input: LogicInput): Promise<LogicOutput> {
  return withRealLogic(async () => {
    const t0 = performance.now();
    const b = await buildBase(input.settings);
    const pre = preCompleteEffects(b, input.preCompleted ?? []);
    const { world, logged } = knownWorld(b, input.entrances, pre);
    const starting = new Map<any, number>(b.state.startingItems);
    for (const [pi, n] of pre.start) starting.set(pi, (starting.get(pi) ?? 0) + n);
    const assumed = new Map<any, number>();
    for (const [id, n] of Object.entries(input.items)) {
      const item = (Items as any)[id];
      if (item && n > 0) assumed.set(makePlayerItem(item, 0), n);
    }
    const run = (items: Map<any, number>, gossips: boolean) => {
      const pf: any = new Pathfinder([world], b.state.settings, starting);
      return { pf, result: pf.run(null, { recursive: true, gossips, assumedItems: items as any }) };
    };
    const { pf, result } = run(assumed, true);
    const reach = [...result.locations].map(l => l.replace(/@\d+$/, ''));
    const ws = pf.state.ws[0];

    /* Which age can get each OoT check, asked of the same rules on the finished run. Tags only start once each age can get something. */
    const ages: Record<string, 'child' | 'adult'> = {};
    if (b.state.settings.games !== 'mm') {
      const byAge: [string, boolean[]][] = reach.filter(loc => loc.startsWith('OOT ')).map(loc => [loc, [0, 1].map(age => (b.locAreas.get(loc) ?? []).some(area =>
        ws.ages[age].areas.has(area) && pf.evalExpr(0, world.areas[area].locations[loc], age, area).result.result))]);
      if (byAge.some(([, ok]) => ok[0]) && byAge.some(([, ok]) => ok[1])) {
        for (const [loc, ok] of byAge) if (ok[0] !== ok[1]) ages[loc] = ok[0] ? 'child' : 'adult';
      }
    }

    /* Each item a locked rule looked at, tried on its own. */
    let next: NextItem[] | undefined;
    if (input.next) {
      const have = new Set(reach);
      const ids = new Set<string>();
      for (const age of ws.ages) for (const item of age.dependencies.items.keys()) {
        const id = b.catalogFamily.get(item.id) ?? b.catalogFamily.get(familyOf(item.id));
        if (id) ids.add(id);
      }
      next = [];
      for (const id of ids) {
        const entry = b.catalog.find(i => i.id === id)!;
        if (entry.start + (input.items[id] ?? 0) >= entry.max) continue;
        const pi = makePlayerItem((Items as any)[id], 0);
        const more = new Map(assumed);
        more.set(pi, (more.get(pi) ?? 0) + 1);
        const opens = [...run(more, false).result.locations].map((l: string) => l.replace(/@\d+$/, '')).filter(l => !have.has(l));
        if (opens.length) next.push({ id, opens });
      }
      next.sort((x, y) => y.opens.length - x.opens.length);
    }
    const spawns = [...b.poolSources].filter(s => /^spawn/.test((ENTRANCES as any)[s]?.type ?? ''));
    return {
      reach,
      stones: [...(result.gossips[0] ?? [])],
      catalog: pre.start.size ? b.catalog.map(i => {
        let n = 0;
        for (const [pi, k] of pre.start) if (pi.item.id === i.id) n += k;
        return n ? { ...i, start: Math.min(i.max, i.start + n) } : i;
      }) : b.catalog,
      shuffled: b.poolSources.size,
      logged,
      spawnsOpen: spawns.every(s => input.entrances[s]),
      pricesShuffled: b.pricesShuffled,
      ages,
      next,
      ms: Math.round(performance.now() - t0),
    };
  });
}
