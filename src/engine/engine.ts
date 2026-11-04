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
import { shuffledEntrances, type EntranceData } from './entrances';

/*
 * Access rules decide when a check is reachable, never whether it exists, so
 * the checklist can skip parsing them. That takes a settings change from about
 * 3 seconds to about 0.2. tools/verify.mjs proves the results stay identical.
 */
export function enableFastMode() {
  ExprParser.prototype.parse = function fastParse() { return exprTrue(); } as typeof ExprParser.prototype.parse;
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

export type ComputeResult = {
  checks: CheckEntry[];
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
  for (const id of world.locations) {
    const data = CHECKS_BY_LOCATION[id] as CheckData;
    const region = world.regions[id] ?? 'NONE';
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
  const mqSetting = (SETTINGS as readonly any[]).find(s => s.key === 'mqDungeons');
  const mq = mqSetting.values.map((v: any) => v.value).filter((v: string) => world.resolvedFlags.mqDungeons.has(v));
  /* A problem with entrance settings should never take the check list down with it. */
  let entrances: EntranceData;
  try {
    entrances = shuffledEntrances(state);
  } catch (e) {
    entrances = { list: [], dests: [], sets: [], rev: {}, error: String((e as Error)?.message ?? e) };
  }
  return { checks, mq, entrances, ms: Math.round(performance.now() - t0) };
}

export { DEFAULT_SETTINGS, SETTINGS, exportSettings, importSettings, makeSettings };
