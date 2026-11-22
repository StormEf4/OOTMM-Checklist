/* The heart container display: the player's hearts the way the game's life meter shows them. Link starts with 3
   hearts and tops out at 20. A Heart Container adds a whole heart, and every 4 Heart Pieces make one more. Pieces that
   don't yet make a heart sit as quarters on the first empty heart, so a container found while holding pieces adds a
   full heart and the quarters move along to the next empty one. */

export const START_HEARTS = 3;
export const MAX_HEARTS = 20;

/** How full each of the 20 hearts is, in quarters (0 to 4). */
export function heartQuarters(containers: number, pieces: number, start = START_HEARTS, max = MAX_HEARTS): number[] {
  const whole = Math.min(max, start + Math.max(0, containers) + Math.floor(Math.max(0, pieces) / 4));
  const extra = whole < max ? Math.max(0, pieces) % 4 : 0;
  return Array.from({ length: max }, (_, i) => i < whole ? 4 : i === whole ? extra : 0);
}

/** "7¾ hearts" style text for a set of quarters. */
export function heartsText(quarters: number[]) {
  const total = quarters.reduce((t, q) => t + q, 0);
  const whole = Math.floor(total / 4), part = ['', '¼', '½', '¾'][total % 4];
  return `${whole}${part} ${whole === 1 && !part ? 'heart' : 'hearts'}`;
}
