/**
 * Draws the Map view's Hyrule and Termina maps from src/mapspots.ts. The art is plain SVG made here: smoothed area
 * shapes coloured by terrain, water, dashed paths and small hand-drawn peaks, trees and dunes. Colours mix with the
 * theme's background, so every theme (and the player's own colour edits) tints the map.
 */
import { MAP_H, MAP_W, WORLD, type MapArea } from './mapspots';

type Pt = [number, number];
const pairs = (a: number[]): Pt[] => { const o: Pt[] = []; for (let i = 0; i + 1 < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A smooth curve through the points (Catmull-Rom as cubic Béziers). */
export function smooth(a: number[], closed = true): string {
  const p = pairs(a);
  if (p.length < 3) return `M${p.map(q => q.join(' ')).join('L')}`;
  const at = (i: number) => closed ? p[(i + p.length) % p.length] : p[Math.max(0, Math.min(p.length - 1, i))];
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  const n = closed ? p.length : p.length - 1;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

const peak = ([x, y, s]: [number, number, number]) => s <= 0 ? '' :
  `<path class="mk-peak" d="M${x - s} ${y + s * .7}L${x - s * .15} ${y - s * .8}L${x + s * .25} ${y - s * .2}L${x + s * .45} ${y - s * .5}L${x + s} ${y + s * .7}Z"/>`
  + `<path class="mk-snow" d="M${r1(x - s * .42)} ${r1(y - s * .2)}L${r1(x - s * .15)} ${r1(y - s * .8)}L${r1(x + s * .12)} ${r1(y - s * .32)}L${r1(x - s * .1)} ${r1(y - s * .42)}Z"/>`;
const clump = ([x, y, s]: [number, number, number]) => s <= 0 ? '' :
  [[-.5, .2, .55], [.45, .25, .5], [0, -.25, .62]].map(([dx, dy, k]) => `<circle class="mk-tree" cx="${r1(x + dx * s)}" cy="${r1(y + dy * s)}" r="${r1(k * s)}"/>`).join('');
const dune = ([x, y]: [number, number]) => `<path class="mk-dune" d="M${x - 14} ${y}q14-9 28 0"/>`;

/** Little details inside an area so it reads as that kind of place. */
function detail(id: string, a: MapArea): string {
  if (!a.pts) return '';
  const p = pairs(a.pts);
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const spots = (n: number): Pt[] => Array.from({ length: n }, (_, i) => {
    const t = (i * 0.618034 + id.length * 0.13) % 1, u = (i * 0.414214 + 0.27) % 1;
    return [cx + (t - .5) * w * .62, cy + (u - .5) * h * .5 + h * .14];
  });
  switch (a.terrain) {
    case 'forest': case 'woods': return spots(5).map(([x, y]) => clump([x, y, a.terrain === 'woods' ? 9 : 8])).join('');
    case 'rock': case 'snow': return spots(3).map(([x, y]) => peak([x, y, 12])).join('');
    case 'volcano': return peak([cx, cy + h * .18, Math.min(w, h) * .32]) + `<circle class="mk-ember" cx="${r1(cx - Math.min(w, h) * .05)}" cy="${r1(cy - h * .12)}" r="4"/>`;
    case 'desert': case 'sand': return spots(4).map(([x, y]) => dune([x, y])).join('');
    case 'town': return spots(4).map(([x, y]) => `<rect class="mk-house" x="${r1(x - 4)}" y="${r1(y - 3)}" width="8" height="6"/>`).join('');
    case 'grave': return spots(4).map(([x, y]) => `<path class="mk-stone" d="M${r1(x - 3)} ${r1(y + 4)}v-5a3 3 0 0 1 6 0v5z"/>`).join('');
    case 'water': return spots(3).map(([x, y]) => `<path class="mk-wave" d="M${r1(x - 10)} ${r1(y)}q5-5 10 0t10 0"/>`).join('');
    case 'field': return spots(6).map(([x, y]) => `<path class="mk-tuft" d="M${r1(x - 4)} ${r1(y - 4)}l4 6 4-6"/>`).join('');
    case 'ranch': return `<ellipse class="mk-fence" cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(w * .36)}" ry="${r1(h * .34)}"/>`;
    case 'canyon': return spots(3).map(([x, y]) => `<path class="mk-crack" d="M${r1(x - 10)} ${r1(y)}l6-4 5 5 8-6"/>`).join('');
    case 'coast': return spots(5).map(([x, y]) => `<circle class="mk-pebble" cx="${r1(x)}" cy="${r1(y)}" r="1.6"/>`).join('');
    case 'moon': return `<circle class="mk-crater" cx="${r1(cx - 7)}" cy="${r1(cy - 6)}" r="5"/><circle class="mk-crater" cx="${r1(cx + 8)}" cy="${r1(cy + 5)}" r="7"/><circle class="mk-crater" cx="${r1(cx - 4)}" cy="${r1(cy + 12)}" r="3"/>`;
    case 'swamp': return spots(4).map(([x, y]) => `<path class="mk-reed" d="M${r1(x)} ${r1(y + 5)}v-10M${r1(x + 4)} ${r1(y + 5)}l2-8"/>`).join('');
    default: return '';
  }
}

export type AreaState = { cls: string; label: string };

/**
 * The SVG for one game's map. `state` gives each area's classes; areas it leaves out are drawn as plain land with no
 * name (they aren't in this seed's list). `moved` gives areas whose name the player put elsewhere, or took off the map.
 */
export function drawWorld(game: 'oot' | 'mm', state: (id: string) => AreaState | undefined, editAttr: (id: string) => string): string {
  const w = WORLD[game];
  const water = w.water.map(x => x.closed
    ? `<path class="wt-sea" d="${smooth(x.pts)}"/>`
    : `<path class="wt-river" stroke-width="${x.w ?? 5}" d="${smooth(x.pts, false)}"/>`).join('');
  const roads = w.roads.map(r => `<path class="rd" d="${smooth(r, false)}"/>`).join('');
  const areas = Object.entries(w.areas).filter(([, a]) => a.pts).map(([id, a]) => {
    const s = state(id);
    const d = a.sharp ? `M${pairs(a.pts!).map(q => q.join(' ')).join('L')}Z` : smooth(a.pts!);
    if (!s) return `<path class="rg-off t-${a.terrain}" d="${d}"/>`;
    return `<g class="rg ${s.cls}" data-region="${id}"${editAttr(id)}><path class="t-${a.terrain}" d="${d}"/>${detail(id, a)}</g>`;
  }).join('');
  return `<svg class="world-art" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <defs><pattern id="hatch-${game}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v8" class="hatch"/></pattern></defs>
    <rect class="land" x="0" y="0" width="${MAP_W}" height="${MAP_H}" rx="14"/>
    ${water}
    <g class="deco">${w.peaks.map(peak).join('')}${w.trees.map(clump).join('')}${w.dunes.map(dune).join('')}</g>
    ${roads}${areas}
    <g class="compass" transform="translate(${game === 'oot' ? 60 : 940} ${game === 'oot' ? 640 : 640})"><circle r="20"/><path d="M0-17L5 0 0 17-5 0Z"/><path class="n" d="M0-17L5 0H-5Z"/><path class="nl" d="M-4 -24v-9l8 9v-9"/></g>
    <rect class="frame" x="2" y="2" width="${MAP_W - 4}" height="${MAP_H - 4}" rx="13"/>
  </svg>`;
}
