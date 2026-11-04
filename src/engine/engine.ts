/**
 * The checklist engine. It runs OoTMM's own world pipeline with the same steps
 * its location list uses (world locations minus fixed vanilla locations), so
 * the checklist follows the generator instead of a hand-kept copy of its rules.
 */
import type { Settings } from '@ootmm/core';

import { DEFAULT_SETTINGS, Monitor, SETTINGS, exportSettings, importSettings, makeSettings, options } from '@ootmm/core';
import { CHECKS_BY_LOCATION, type CheckData } from '@ootmm/data';
import { ExprParser, exprTrue, makeLocation, worldState } from '@ootmm/logic';
import { regionName } from '@ootmm/regions';
import { normalRegions, shuffledEntrances, type EntranceData } from './entrances';

/*
 * Access rules decide when a check is reachable, never whether it exists, so
 * the checklist can skip parsing them. That takes a settings change from about
 * 3 seconds to about 0.2. tools/verify.mjs proves the results stay identical.
 */
let fast = false;
export function enableFastMode() {
  fast = true;
  if ((ExprParser.prototype.parse as any).__checklist) return;
  const real = ExprParser.prototype.parse;
  const parse = function (this: ExprParser, ...args: unknown[]) { return fast ? exprTrue() : (real as any).apply(this, args); };
  (parse as any).__checklist = true;
  ExprParser.prototype.parse = parse as typeof ExprParser.prototype.parse;
}

/*
 * The reachable-checks view needs the real access rules. Jobs run one at a time,
 * so a fast checklist run and a logic run never share the parser at once.
 */
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}
export async function withRealLogic<T>(fn: () => Promise<T>): Promise<T> {
  const was = fast;
  fast = false;
  try { return await fn(); } finally { fast = was; }
}

export type CheckEntry = {
  id: string;
  name: string;
  game: 'oot' | 'mm';
  type: string;
  region: string;
  regionName: string;
  dungeon: boolean;
  dungeonKey?: string;
  fixed: boolean;
  junk: boolean;
};

export type GossipEntry = { id: string; name: string; game: 'oot' | 'mm'; region: string; regionName: string; dungeon: boolean };

export type ComputeResult = {
  checks: CheckEntry[];
  gossips: GossipEntry[];
  mq: string[];
  entrances: EntranceData;
  ms: number;
};

const monitor = new Monitor({ onLog: () => {}, onWarn: () => {}, onProgress: () => {} });

const norm = (w: string) => w.toLowerCase().replace(/['’]s?$/g, '').replace(/s$/, '');

/** Drops words the check name shares with its area heading. */
const prettify = (id: string, region: string) => {
  const words = id.replace(/^(OOT|MM) /, '').split(' ');
  const base = regionName(region).split(' ').filter(w => !/^(the|of|to)$/i.test(w));
  let n = 0;
  while (n < base.length && n < words.length - 1 && norm(words[n]) === norm(base[n])) ++n;
  return words.slice(n).join(' ');
};

/** One-player settings for the engine: multiworld only changes who owns items. */
export function engineSettings(settings: Partial<Settings>): Settings {
  return makeSettings({ ...settings, mode: 'single', players: 1, teams: 1 } as Partial<Settings> as any);
}

export async function compute(input: Partial<Settings>, seed = 'checklist'): Promise<ComputeResult> {
  const t0 = performance.now();
  const opts = options({ seed, settings: engineSettings(input) as any });
  const state = await worldState(monitor, opts);
  const { worlds, fixedLocations } = state;
  const world = worlds[0];
  const junk = new Set(opts.settings.junkLocations);
  const checks: CheckEntry[] = [];
  let regions: Record<string, string> = world.regions;
  let areaRegions: Record<string, { region: string }> = world.areas;
  try { ({ regions, areas: areaRegions } = normalRegions(state)); } catch { /* keeps OoTMM's unplaced names */ }
  for (const id of world.locations) {
    const data = CHECKS_BY_LOCATION[id] as CheckData;
    const region = regions[id] ?? world.regions[id] ?? 'NONE';
    const dungeonKey = Object.entries(world.dungeons).find(([, d]) => d.has(id))?.[0];
    checks.push({
      id,
      name: prettify(id, region),
      game: data.game,
      type: data.type,
      region,
      regionName: regionName(region),
      dungeon: !!dungeonKey,
      dungeonKey,
      fixed: fixedLocations.has(makeLocation(id, 0)),
      junk: junk.has(id),
    });
  }
  /* Gossip stones, for the Hints tab. The player types in what each one says. */
  const gossips: GossipEntry[] = [];
  const dungeonRegions = new Set(checks.filter(c => c.dungeon).map(c => c.region));
  for (const [name, area] of Object.entries(world.areas) as [string, any][]) {
    for (const id of Object.keys(area.gossip ?? {})) {
      if (gossips.some(g => g.id === id)) continue;
      const r = areaRegions[name]?.region ?? area.region ?? 'NONE';
      gossips.push({ id, name: prettify(id, r), game: world.gossip[id]?.game ?? area.game, region: r, regionName: regionName(r), dungeon: dungeonRegions.has(r) });
    }
  }
  const mqSetting = (SETTINGS as readonly any[]).find(s => s.key === 'mqDungeons');
  const mq = mqSetting.values.map((v: any) => v.value).filter((v: string) => world.resolvedFlags.mqDungeons.has(v));
  /* A problem with entrance settings should never take the check list down with it. */
  let entrances: EntranceData;
  try {
    entrances = shuffledEntrances(state);
  } catch (e) {
    entrances = { list: [], dests: [], sets: [], rev: {}, error: String((e as Error)?.message ?? e) };
  }
  return { checks, gossips, mq, entrances, ms: Math.round(performance.now() - t0) };
}

export { DEFAULT_SETTINGS, SETTINGS, exportSettings, importSettings, makeSettings };
