import { SETTINGS } from '@ootmm/core';
import { WORLD_FLAGS } from '@ootmm/logic';

/** Settings OoTMM can roll at random per seed. MQ and JP layouts change the list; the rest change logic. */
export const ROLLABLE: string[] = [...WORLD_FLAGS];
/** Until the player says what rolled, these count as fully on, so logic never promises too much. */
export const UNKNOWN_MEANS_ALL = new Set(['ganonTrials']);

export type SpoilerHeader = { settings?: string; rolled: Record<string, string[]>; preCompleted: string[] };

/**
 * Reads only the sections above the first spoiler section. The hints, playthrough
 * and item list further down are never looked at or stored.
 */
export function parseSpoilerHeader(text: string): SpoilerHeader {
  const all = text.split(/\r?\n/);
  const stop = all.findIndex(l => /^\s*(Entrances|Song Events|Hints|Paths|Spheres|Location List)\b/.test(l));
  const lines = stop >= 0 ? all.slice(0, stop) : all.slice(0, 2000);
  const str = lines.find(l => l.startsWith('SettingsString:'))?.split(':').slice(1).join(':').trim();

  const rolled: Record<string, string[]> = {};
  const flags = lines.findIndex(l => /^\s*World Flags\b/.test(l));
  if (flags >= 0) {
    for (const key of ROLLABLE) {
      const def = (SETTINGS as readonly any[]).find(s => s.key === key);
      for (let i = flags + 1; i < lines.length; ++i) {
        const t = lines[i].trim();
        if (t === `${def.name}: all`) { rolled[key] = def.values.map((v: any) => v.value); break; }
        if (t === `${def.name}: none`) { rolled[key] = []; break; }
        if (t === `${def.name}:`) {
          const names: string[] = [];
          for (let j = i + 1; j < lines.length; ++j) {
            const m = lines[j].match(/^\s*- (.+)$/);
            if (!m) break;
            names.push(m[1].trim());
          }
          rolled[key] = def.values.filter((v: any) => names.includes(v.name)).map((v: any) => v.value);
          break;
        }
      }
    }
  }

  const preCompleted: string[] = [];
  const pre = lines.findIndex(l => /^\s*Pre-Completed Dungeons\b/.test(l));
  if (pre >= 0) {
    const indent = lines[pre].match(/^\s*/)![0].length;
    for (let i = pre + 1; i < lines.length; ++i) {
      if (!lines[i].trim() || lines[i].match(/^\s*/)![0].length <= indent) break;
      preCompleted.push(lines[i].trim());
    }
  }
  return { settings: str, rolled, preCompleted };
}
