/**
 * Works out which checks the player can reach right now, with OoTMM's own logic
 * and pathfinder. Two things go in: the items the player says they have, and the
 * entrances the player has logged. A shuffled entrance the player hasn't logged
 * counts as closed. Nothing here runs a shuffle or guesses a seed's real
 * connections: every shuffled connection in the world comes from the player.
 */
import type { Settings } from '@ootmm/core';

import { Monitor, SETTINGS, TRICKS, options } from '@ootmm/core';
import { ENTRANCES, MACROS, RAW_GI, WORLD } from '@ootmm/data';
import { gi } from '@ootmm/gi';
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
  /** Catalog id for each item name the game reports, for game tracking. */
  giItems: Record<string, string>;
  /** OoT checks in logic for only one age. Checks both ages can get aren't listed. */
  ages: Record<string, 'child' | 'adult'>;
  /** For directions: which ways the player's items and age allow (see Travel). */
  travel?: Travel;
  /** Only when next was asked for. Best first. */
  next?: NextItem[];
  /** Rolled settings the player hasn't set, so logic only counts checks open on every outcome. */
  unsettled?: string[];
  ms: number;
};

/**
 * For directions: OoTMM's own rule for every way out of every area, asked with the items the player logged, as an age
 * mask (1 child, 2 adult). Only ways that aren't open to both ages are listed. Rules that need something the player
 * hasn't reached in logic yet (an event, a time of day) count as closed. A warp song or soaring needs its system area
 * reached, so it's listed under that area ('OOT SONG_TP_FOREST'). Age changes: at the Temple of Time once OoTMM's
 * TIME_TRAVEL event is reached, or anywhere with the Song of Time when TIME_TRAVEL_AT_WILL is (and the area allows it).
 */
export type Travel = {
  pass: Record<string, number>; timeTravel: string[]; atWill: boolean; fixedAge: string[];
  /** Ways that only open thanks to a trick, a glitch or a "logical" setting like Hookshot Anywhere, by age (child, adult). */
  aids?: Record<string, [Aid | null, Aid | null]>;
};
/** What a way leans on: the tricks or settings (any one of them when "any"), and the items the rule asks for with them. */
export type Aid = { use: string[]; items: string[]; any?: boolean };

/** A trick's or setting's name, as OoTMM's settings show it. */
function aidName(aid: string): string {
  const [kind, key] = aid.split(':');
  const plain = (n: string) => n.replace(/ \((OoT|MM)\)/i, '');
  if (kind === 'trick') { const t = (TRICKS as any)[key]; return t ? plain(t.name) + (t.glitch ? ' (glitch)' : ' (trick)') : key; }
  return plain((SETTINGS as readonly any[]).find(s => s.key === key)?.name ?? key);
}

/* The marked "true"s a rule holds (see the expr builder patch in tools/paths.mjs). */
const aidsMemo = new Map<number, string[]>();
function aidsIn(e: any): string[] {
  if (e.checklistAid) return [e.checklistAid];
  if (!e.exprs) return [];
  let r = aidsMemo.get(e.id);
  if (!r) aidsMemo.set(e.id, r = [...new Set<string>(e.exprs.flatMap(aidsIn))]);
  return r;
}

/** Which tricks or settings a way that passes needs, and the items its rule uses with them. */
function aidOf(pf: any, expr: any, age: number, from: string): Aid | null {
  const list = aidsIn(expr);
  if (!list.length) return null;
  const g = globalThis as any;
  const passes = (e: any) => { try { return !!pf.evalExpr(0, e, age, from).result.result; } catch { return false; } };
  let use: string[], any = false;
  try {
    use = list.filter(a => { g.__checklistAidsOff = new Set([a]); return !passes(expr); });
    if (!use.length) {
      g.__checklistAidsOff = new Set(list);
      if (passes(expr)) return null;
      /* Any one of several does: the ones that work on their own. */
      use = list.filter(a => { g.__checklistAidsOff = new Set(list.filter(x => x !== a)); return passes(expr); });
      if (!use.length) use = list;
      any = use.length > 1;
    }
  } finally { g.__checklistAidsOff = undefined; }
  /* The items on the branch of the rule that passes with the (first) trick, and no other. */
  const items = new Set<string>();
  g.__checklistAidsOff = new Set(list.filter(a => any ? a !== use[0] : !use.includes(a)));
  const pick = (e: any) => {
    if (e.item && (e.type === 'item' || e.type === 'renewable' || e.type === 'license')) { items.add(e.item.id); return; }
    if (e.type === 'and') { for (const x of e.exprs) pick(x); return; }
    if (e.type === 'or') {
      const ok = e.exprs.filter(passes);
      const pref = ok.find((x: any) => aidsIn(x).some(a => use.includes(a))) ?? ok[0];
      if (pref) pick(pref);
    }
  };
  /* With any of several, the items depend on which one the player does, so none are listed. */
  if (!any) try { pick(expr); } finally { g.__checklistAidsOff = undefined; }
  g.__checklistAidsOff = undefined;
  return { use: use.map(aidName), items: [...items].map(id => itemName(id).replace(/ \((OoT|MM)\)$/i, '')).slice(0, 4), ...(any ? { any } : {}) };
}

function travelRules(pf: any, ws: any, world: any): Travel {
  const pass: Record<string, number> = {};
  const aids: Record<string, [Aid | null, Aid | null]> = {};
  const system = (a: string) => /^[A-Z_ ]+$/.test(a.replace(/^(OOT|MM) /, ''));
  /* An area logic hasn't reached still has its rules asked, with another area's time of day. */
  const stand = [0, 1].map(age => ws.ages[age].areas.values().next().value);
  for (const [from, area] of Object.entries(world.areas as Record<string, any>)) {
    for (const [to, expr] of Object.entries(area.exits ?? {})) {
      let mask = 0;
      const aid: [Aid | null, Aid | null] = [null, null];
      for (const age of [0, 1]) {
        const as = ws.ages[age];
        const reached = as.areas.has(from);
        if (!reached && (system(from) || !stand[age])) continue;
        if (!reached) as.areas.set(from, stand[age]);
        try {
          if (pf.evalExpr(0, expr, age, from).result.result) { mask |= 1 << age; aid[age] = aidOf(pf, expr, age, from); }
        } catch { /* closed */ }
        finally { if (!reached) as.areas.delete(from); }
      }
      if (mask !== 3) pass[from + '\n' + to] = mask;
      if (aid[0] || aid[1]) aids[from + '\n' + to] = aid;
    }
  }
  const has = (e: string) => [...ws.events].some((x: string) => x === e || x.endsWith('_' + e));
  const timeTravel = has('TIME_TRAVEL') ? Object.entries(world.areas as Record<string, any>).filter(([, a]) => Object.keys(a.events ?? {}).some(k => /(^|_)TIME_TRAVEL$/.test(k))).map(([n]) => n) : [];
  const fixedAge = Object.entries(world.areas as Record<string, any>).filter(([, a]) => a.game === 'oot' && !a.ageChange).map(([n]) => n);
  return { pass, timeTravel, atWill: has('TIME_TRAVEL_AT_WILL'), fixedAge, aids };
}

const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });

function itemGroup(id: string, item: any): string {
  const soul = /_SOUL_(BOSS|ENEMY|NPC|ANIMAL|MISC)_/.exec(id)?.[1];
  if (soul) return SOUL_GROUPS[soul];
  if (/_HEART_(CONTAINER|PIECE)$|_DEFENSE_UPGRADE$/.test(id)) return 'Hearts';
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

/* Souls, by OoTMM's own kinds. Each kind shows only when the seed's settings put its souls in the item pool. */
export const SOUL_GROUPS: Record<string, string> = { BOSS: 'Boss souls', ENEMY: 'Enemy souls', NPC: 'NPC souls', ANIMAL: 'Animal souls', MISC: 'Other souls' };

const familyOf = (id: string) => id.replace(/_\d+$/, '');
const consumableName = (id: string, name: string) => /_\d+$/.test(id) ? name.replace(/^\d+ /, '') : name;

/*
 * The game reports items by OoTMM's "GI" names, which are the names its own gi() turns each item into when it writes the
 * seed: shared items become each game's own copy, dungeon keys can become one plain key, and so on. Run every item
 * through that same code, so a reported name leads back to the item on the checklist. A name two items share (a plain
 * small key with keys in their own dungeon) can't say which one it was, so it's left out.
 */
function giItemMap(settings: any, catalogFamily: Map<string, string>): Record<string, string> {
  const targets = new Map<string, Set<string>>();
  for (const [id, item] of Object.entries(Items as Record<string, any>)) {
    const target = catalogFamily.get(id) ?? catalogFamily.get(familyOf(id));
    if (!target) continue;
    for (const game of ['oot', 'mm'] as const) {
      let sym: string | undefined;
      try { sym = (RAW_GI as any[])[gi(settings, game, item, true) - 1]?.id; } catch { continue; }
      if (sym) (targets.get(sym) ?? targets.set(sym, new Set()).get(sym)!).add(target);
    }
  }
  const out: Record<string, string> = {};
  for (const [sym, t] of targets) {
    const own = catalogFamily.get(sym);
    if (own && t.has(own)) out[sym] = own;
    else if (t.size === 1) out[sym] = [...t][0];
  }
  return out;
}

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
  /** Catalog id for each item name the game reports (OoTMM's "GI" names), for game tracking. */
  giItems: Record<string, string>;
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
  /* Heart Containers, Heart Pieces and Double Defense don't open checks, but the hearts display shows them, so they can
     be logged too. Dungeon maps and
     compasses don't open checks either, but finding one asks the player about that dungeon's way in or boss. Every soul
     in the pool is listed, even ones logic doesn't need, so the Souls sections are complete. */
  const tracked = (item: any) => itemProperties.important.has(item) || /_SOUL_/.test(item.id) || /_HEART_(CONTAINER|PIECE)$|_DEFENSE_UPGRADE$/.test(item.id) || ItemGroups.MAPS.has(item) || ItemGroups.COMPASSES.has(item);
  const add = (item: any, n: number) => {
    let id: string = item.id;
    if (consumable(item)) {
      if (/RUPEE|RECOVERY_HEART|_TRAP/.test(id)) return;
      id = family.get(familyOf(id)) ?? (family.set(familyOf(id), id), id);
      max.set(id, 1);
      return;
    }
    if (tracked(item)) max.set(id, (max.get(id) ?? 0) + n);
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
    if (!max.has(id) && tracked(pi.item)) max.set(id, n);
    if (max.has(id)) start.set(id, Math.min(start.get(id)!, max.get(id)!));
  }
  /*
   * Owl statues and tunics are one thing each, even when the pool holds a spare copy, so they don't count up to 2.
   * Pre-activated owls (when owls aren't shuffled) are already on at the start. OoTMM gives them through their
   * statues' locations rather than the starting items, so they're added here.
   */
  for (const id of max.keys()) if (/^MM_OWL_|_TUNIC_/.test(id)) max.set(id, 1);
  const owlPre = state.settings.mmPreActivatedOwls?.type;
  if (owlPre && owlPre !== 'none' && owlPre !== 'random' && state.settings.owlShuffle !== 'anywhere') {
    const OWLS: Record<string, string> = { clocktown: 'CLOCK_TOWN', milkroad: 'MILK_ROAD', swamp: 'SOUTHERN_SWAMP', woodfall: 'WOODFALL', mountain: 'MOUNTAIN_VILLAGE', snowhead: 'SNOWHEAD', greatbay: 'GREAT_BAY', zoracape: 'ZORA_CAPE', canyon: 'IKANA_CANYON', tower: 'STONE_TOWER' };
    const flag = worlds[0]?.resolvedFlags?.mmPreActivatedOwls;
    for (const [f, owl] of Object.entries(OWLS)) if (flag?.has(f) && max.has('MM_OWL_' + owl)) start.set('MM_OWL_' + owl, 1);
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
  base = { key, state, shuffler, poolSources, catalog, catalogFamily, locAreas, pricesShuffled, giItems: giItemMap(state.settings, catalogFamily) };
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
    const travel = travelRules(pf, ws, world);

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
      giItems: b.giItems,
      ages,
      travel,
      next,
      ms: Math.round(performance.now() - t0),
    };
  });
}
