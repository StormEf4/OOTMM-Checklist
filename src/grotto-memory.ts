/*
 * Game tracking's memory reader, on the app's side: tells which plain grotto hole the player just dropped into.
 *
 * The game reports every plain grotto by the same name (OOT_GROTTO_TYPE_GENERIC, MM_GROTTO_TYPE_GENERIC). The Windows
 * app's memory reader (desktop/memreader.js) watches the one byte OoTMM itself uses to tell them apart (gGrottoData):
 * - the hole sets it as Link drops in;
 * - when the hole leads into a plain grotto, OoTMM then sets it to that grotto's number on the way in
 *   (Play_ApplyCustomEntrance), so the hole's number is the one just before.
 * Which number is which hole comes from OoTMM's Play_EntranceForOverride, through tools/ram-layout.mjs.
 *
 * The answer is only ever one of the doors the app would have asked about, and only when exactly one fits; anything
 * else goes back to asking the player.
 */
import layout from './generated/ram-layout.json';

export type GrottoSeen = { v: number; t: number };
type Game = 'oot' | 'mm';

/** How long before the game reports arriving the hole's number can have been set (falling in plus the fade). */
const RECENT_MS = 8000;

const codes = layout.grottoCodes as Record<Game, Record<string, string>>;
const codeOf = (g: Game, id: string) => {
  for (const [n, e] of Object.entries(codes[g])) if (e === id) return Number(n);
  return null;
};

/** The plain grotto game the report is about, or null when it isn't one. */
export function grottoGame(original: string): Game | null {
  return original === 'OOT_GROTTO_TYPE_GENERIC' ? 'oot' : original === 'MM_GROTTO_TYPE_GENERIC' ? 'mm' : null;
}

/**
 * The grotto hole the player dropped into, from the numbers the reader saw (oldest first) and when, or null when it
 * can't be told for sure. dest is where the game says they arrived; choices are the doors the app would ask about.
 * since is when the reader started watching this game without a break: a number it found already there, or saw too
 * soon after starting, may be from partway through the drop, so it isn't trusted.
 */
export function grottoFromMemory(original: string, dest: string, seen: GrottoSeen[], now: number, since: number, choices: string[]): string | null {
  const g = grottoGame(original);
  if (!g || !seen.length || !since || now - since < RECENT_MS) return null;
  const mask = layout.grottoMask;
  const hole = (v: number) => codes[g][String(v & mask)] ?? null;
  const last = seen[seen.length - 1];
  const before = seen.length > 1 ? seen[seen.length - 2] : null;
  const destCode = codeOf(g, dest);
  const recent = (s: GrottoSeen | null) => !!s && now - s.t <= RECENT_MS;
  let maybe: (string | null)[];
  if (destCode === null) {
    /* The hole led somewhere other than a plain grotto, so nothing changed the number after the hole set it. */
    maybe = [hole(last.v)];
  } else if ((last.v & mask) !== destCode) {
    /* Arriving in a plain grotto always leaves its number last. If it doesn't, something else is going on. */
    return null;
  } else if (recent(last) && before && recent(before)) {
    /* The hole's number, then the grotto's. */
    maybe = [hole(before.v)];
  } else if (recent(last)) {
    /* One change: either the hole has the grotto's own number, or the hole's number was already there from before. */
    maybe = [hole(last.v), before ? hole(before.v) : null];
  } else {
    /* No change: the hole's number was already the grotto's. */
    maybe = [hole(last.v)];
  }
  const fit = [...new Set(maybe.filter((id): id is string => !!id && choices.includes(id)))];
  return fit.length === 1 ? fit[0] : null;
}
