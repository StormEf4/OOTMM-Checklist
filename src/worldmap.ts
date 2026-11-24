/**
 * Paints the Map view's Hyrule and Termina maps from src/mapspots.ts as SVG: shaded terrain with painted edges and a
 * paper grain, shaded mountain ranges, packed treetops, water with shorelines, dirt paths and drawn landmarks. All of it
 * is original art made here, in the spirit of a pause-screen map rather than a copy of one.
 */
import { MAP_H, MAP_W, WORLD, type Landmark, type MapArea, type Terrain } from './mapspots';

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
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}
const shapeOf = (a: MapArea) => a.sharp ? `M${pairs(a.pts!).map(q => q.join(' ')).join('L')}Z` : smooth(a.pts!);

/** Seeded random numbers, so the map looks the same every time. */
function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function inside(p: Pt[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}
const bounds = (p: Pt[]) => { const xs = p.map(q => q[0]), ys = p.map(q => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
/** Points scattered inside a shape, kept a little apart. */
function scatter(pts: number[], every: number, seed: number, margin = 0): Pt[] {
  const p = pairs(pts), b = bounds(p), r = rng(seed), out: Pt[] = [];
  const n = Math.round((b.x1 - b.x0) * (b.y1 - b.y0) / every);
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const x = b.x0 + r() * (b.x1 - b.x0), y = b.y0 + r() * (b.y1 - b.y0);
    if (!inside(p, x, y)) continue;
    if (margin && (!inside(p, x - margin, y) || !inside(p, x + margin, y) || !inside(p, x, y - margin) || !inside(p, x, y + margin))) continue;
    out.push([x, y]);
  }
  return out.sort((a, b2) => a[1] - b2[1]);
}

/* ---------- Terrain colours: [light middle, dark edge] ---------- */
const PAINT: Record<Terrain, [string, string]> = {
  field: ['#a7c662', '#6d8f35'], meadow: ['#9dcf6a', '#5f9640'], ranch: ['#c7cc72', '#93a048'], forest: ['#4f9644', '#28592a'],
  woods: ['#3f7d44', '#1c4427'], desert: ['#f0d18d', '#c79a55'], sand: ['#e8c07e', '#b98a4d'], canyon: ['#d39a62', '#8f5a35'],
  rock: ['#b39678', '#6c5442'], volcano: ['#c4603e', '#6e2a1b'], water: ['#7fd0ee', '#2e7fb5'], coast: ['#f0e0ae', '#c8ad73'],
  town: ['#e2cfa2', '#a88e64'], castle: ['#c8ccd6', '#80869a'], temple: ['#f0ead2', '#b8ae8e'], snow: ['#ffffff', '#b2c6d8'],
  swamp: ['#8a9c55', '#4b5f2e'], grave: ['#9a8cae', '#51475f'], moon: ['#ffd98a', '#c08b38'], dark: ['#8a5a6e', '#3e2533'],
};
const grad = (g: string, t: Terrain) => `<radialGradient id="p-${t}-${g}" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="${PAINT[t][0]}"/><stop offset="1" stop-color="${PAINT[t][1]}"/></radialGradient>`;

/* ---------- Small painted pieces ---------- */
function peak(x: number, y: number, s: number, snow: boolean, r: () => number) {
  const w = s * (.85 + r() * .4), h = s * (1 + r() * .35), lean = (r() - .5) * s * .25;
  const tx = x + lean, ty = y - h;
  let o = `<path class="pk-l" d="M${r1(x - w)} ${r1(y)}L${r1(tx)} ${r1(ty)}L${r1(tx + w * .08)} ${r1(y)}Z"/>`
    + `<path class="pk-r" d="M${r1(tx)} ${r1(ty)}L${r1(x + w)} ${r1(y)}L${r1(tx + w * .08)} ${r1(y)}Z"/>`
    + `<path class="pk-ridge" d="M${r1(tx)} ${r1(ty)}l${r1(w * .1)} ${r1(h * .35)} ${r1(-w * .05)} ${r1(h * .3)} ${r1(w * .1)} ${r1(h * .35)}"/>`;
  if (snow) o += `<path class="pk-snow" d="M${r1(tx)} ${r1(ty)}L${r1(tx + w * .34)} ${r1(ty + h * .34)}l${r1(-w * .12)} ${r1(-h * .06)} ${r1(-w * .1)} ${r1(h * .08)} ${r1(-w * .12)} ${r1(-h * .1)} ${r1(-w * .14)} ${r1(h * .08)}L${r1(tx - w * .36)} ${r1(ty + h * .34)}Z"/>`;
  return o;
}
function range(pts: number[], s: number, snow: boolean, seed: number) {
  const r = rng(seed), p = pairs(pts), out: Pt[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const [a, b] = [p[i], p[i + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / (s * .9)));
    for (let k = 0; k < n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t + (r() - .5) * s * .5, a[1] + (b[1] - a[1]) * t + (r() - .5) * s * .4]); }
  }
  out.push(p[p.length - 1]);
  return out.sort((a, b) => a[1] - b[1]).map(([x, y]) => peak(x, y, s * (.7 + r() * .5), snow, r)).join('');
}
const tree = (x: number, y: number, s: number) =>
  `<ellipse class="tr-sh" cx="${r1(x + s * .2)}" cy="${r1(y + s * .55)}" rx="${r1(s * .95)}" ry="${r1(s * .4)}"/><circle class="tr" cx="${r1(x)}" cy="${r1(y)}" r="${r1(s)}"/><circle class="tr-hi" cx="${r1(x - s * .3)}" cy="${r1(y - s * .35)}" r="${r1(s * .5)}"/>`;
function forest(pts: number[], seed: number, size = 8, every = 70) {
  const r = rng(seed);
  return scatter(pts, every, seed, size * .6).map(([x, y]) => tree(x, y, size * (.75 + r() * .5))).join('');
}
const pine = (x: number, y: number, s: number) => `<path class="pine" d="M${r1(x)} ${r1(y - s * 1.6)}L${r1(x + s * .7)} ${r1(y)}H${r1(x - s * .7)}Z"/>`;

/* ---------- Landmarks, drawn around (0, 0) ---------- */
const MARKS: Record<Landmark, string> = {
  castle: `<path class="lm-wall" d="M-24 14V-6h48v20z"/><path class="lm-wall2" d="M-14-6v-12h28v12z"/><path class="lm-wall" d="M-30 14V-14h10v28zM20 14V-14h10v28zM-5-18v-14h10v14z"/>
    <path class="lm-roof" d="M-31-14l6-12 6 12zM19-14l6-12 6 12zM-6-32l6-14 6 14z"/><path class="lm-flag" d="M0-46v-8l8 3-8 3"/><path class="lm-door" d="M-5 14v-9a5 5 0 0 1 10 0v9z"/>
    <path class="lm-win" d="M-26-6h2v4h-2zM24-6h2v4h-2zM-1-26h2v4h-2z"/>`,
  darkcastle: `<path class="lm-dark" d="M-22 14V-4h44v18zM-28 14V-16h9v30zM19 14V-16h9v30zM-6-4v-26h12v26z"/><path class="lm-darkroof" d="M-29-16l5-14 5 14zM18-16l5-14 5 14zM-7-30l7-18 7 18z"/>
    <path class="lm-glow" d="M-2-22h4v5h-4zM-25-8h2v4h-2zM23-8h2v4h-2z"/>`,
  tower: `<ellipse class="lm-shadow" cx="4" cy="12" rx="22" ry="6"/><path class="lm-wall" d="M-11 12V-40h22v52z"/><path class="lm-wall2" d="M-11-40h22v8h-22z"/><circle class="lm-clock" cy="-22" r="8"/><path class="lm-hand" d="M0-22v-6M0-22l4 2"/>
    <path class="lm-roof" d="M-15-40L0-64l15 24z"/><path class="lm-door" d="M-5 12V2a5 5 0 0 1 10 0v10z"/>`,
  volcano: `<path class="lm-smoke" d="M-4-34c-8-6-2-16 6-14 2-10 16-8 16 2 8 0 10 10 2 14"/><path class="lm-vol" d="M-46 22L-10-24h20l36 46z"/><path class="lm-vol2" d="M4-24h6l36 46H18z"/>
    <path class="lm-lava" d="M-10-24h20l-4 6h-12z"/><path class="lm-lava" d="M-2-18l-6 16 4 6-6 14" fill="none"/>`,
  windmill: `<path class="lm-wall" d="M-8 14l3-30h10l3 30z"/><path class="lm-roof" d="M-7-16L0-24l7 8z"/><g class="lm-blade"><path d="M0-18L-4-42h8z"/><path d="M0-18l24-4v8z"/><path d="M0-18l4 24h-8z"/><path d="M0-18l-24 4v-8z"/></g><circle class="lm-hub" cy="-18" r="3"/>`,
  greattree: `<ellipse class="lm-shadow" cx="6" cy="16" rx="30" ry="8"/><path class="lm-trunk" d="M-8 16c4-10 4-24 2-36h12c-2 12-2 26 2 36z"/><circle class="lm-canopy" cx="-20" cy="-18" r="15"/><circle class="lm-canopy" cx="20" cy="-18" r="15"/><circle class="lm-canopy" cx="0" cy="-30" r="26"/>
    <circle class="tr-hi" cx="-8" cy="-40" r="12"/><path class="lm-face" d="M-5-2h3v4h-3zM3-2h3v4h-3zM-3 6h6v5h-6z"/>`,
  barn: `<ellipse class="lm-shadow" cx="4" cy="12" rx="24" ry="6"/><path class="lm-red" d="M-18 12V-4l9-10 9 10v16z"/><path class="lm-redroof" d="M-21-3l12-14 12 14"/><path class="lm-silo" d="M6 12V-14a6 6 0 0 1 12 0v26z"/><path class="lm-door" d="M-13 12V2h8v10z"/>
    <path class="lm-fence" d="M-30 18h60M-30 14h60M-26 12v8M-12 12v8M2 12v8M16 12v8M28 12v8"/>`,
  temple: `<ellipse class="lm-shadow" cx="4" cy="12" rx="24" ry="6"/><path class="lm-stone" d="M-20 12V-6h40v18z"/><path class="lm-roof2" d="M-24-6L0-22l24 16z"/><path class="lm-stone" d="M-4-22v-14h8v14z"/><path class="lm-roof2" d="M-6-36L0-48l6 12z"/>
    <path class="lm-door" d="M-5 12V0a5 5 0 0 1 10 0v12z"/><path class="lm-col" d="M-15-4v14M15-4v14M-9-4v14M9-4v14"/>`,
  waterfall: `<path class="lm-cliff" d="M-22 14L-18-26h36L22 14z"/><path class="lm-fall" d="M-7-26h14l2 40h-18z"/><path class="lm-foam" d="M-14 14c4-6 8-6 14-2 6-4 10-4 14 2"/><path class="lm-fallhi" d="M-2-24v34M3-24v30"/>`,
  island: `<ellipse class="lm-sand" cx="0" cy="6" rx="22" ry="9"/><path class="lm-trunk" d="M2 4c0-8 2-14 6-18h3c-4 6-5 12-5 18z"/><circle class="tr" cx="10" cy="-16" r="9"/><path class="lm-bridge" d="M-22 6h-40" stroke-dasharray="3 3"/>
    <path class="lm-stone" d="M-14 6v-14h8v14z"/>`,
  fortress: `<ellipse class="lm-shadow" cx="4" cy="14" rx="28" ry="6"/><path class="lm-sandst" d="M-26 14V-4h20v-12h16v12h16v18z"/><path class="lm-sandst2" d="M-6-16h16v-10H-6z"/><path class="lm-win" d="M-20 0h4v5h-4zM14 0h4v5h-4zM0-12h4v6h-4zM-4 4h6v10h-6z"/>
    <path class="lm-flag" d="M2-26v-10l8 3-8 3"/>`,
  pillar: `<ellipse class="lm-shadow" cx="4" cy="16" rx="24" ry="6"/><path class="lm-sandst" d="M-16 16l2-38h8l2 38zM6 16l2-38h8l2 38z"/><path class="lm-sandst2" d="M-18-22h36v-8h-36z"/><circle class="lm-sandst" cx="0" cy="-36" r="8"/>`,
  hut: `<ellipse class="lm-shadow" cx="3" cy="10" rx="18" ry="5"/><path class="lm-hut" d="M-16 10c0-14 6-22 16-22s16 8 16 22z"/><path class="lm-door" d="M-5 10V2a5 5 0 0 1 10 0v8z"/><path class="lm-hutline" d="M-12 0h24M-8-8h16"/>`,
  ruin: `<path class="lm-ruin" d="M-28 14V-10l6-4v28zM-18 14V-4h8v-8h6v26zM4 14V-18l8-4 2 6v30zM18 14V-6l10 2v18z"/><path class="lm-win" d="M7-6h3v6h-3z"/><path class="lm-ruinline" d="M-28 14h56"/>`,
  stonetower: `<ellipse class="lm-shadow" cx="4" cy="14" rx="22" ry="6"/><path class="lm-stone" d="M-16 14V2h32v12zM-12 2V-12h24V2zM-14-12v-12h26v12zM-9-24v-14h18v14zM-11-38v-10h20v10zM-5-48v-12h10v12z"/>
    <path class="lm-col" d="M-16 2h32M-12-12h24M-14-24h26M-9-38h18M-11-48h20"/>`,
  palace: `<ellipse class="lm-shadow" cx="4" cy="12" rx="26" ry="6"/><path class="lm-palace" d="M-24 12c0-18 10-26 24-26s24 8 24 26z"/><path class="lm-palace2" d="M-10-14c0-8 4-14 10-14s10 6 10 14z"/><path class="lm-door" d="M-5 12V2a5 5 0 0 1 10 0v10z"/>
    <path class="lm-leaf" d="M0-28c-4-6-10-6-12-4 4 2 8 4 12 4zM0-28c4-6 10-6 12-4-4 2-8 4-12 4z"/>`,
  dome: `<ellipse class="lm-shadow" cx="4" cy="10" rx="24" ry="6"/><path class="lm-dome" d="M-22 10c0-16 10-24 22-24s22 8 22 24z"/><path class="lm-domeline" d="M-14-4c8-6 20-6 28 0M-20 4c12-6 28-6 40 0"/>`,
  spire: `<path class="lm-snowpk" d="M-34 18L-6-40h12l34 58z"/><path class="lm-snowpk2" d="M2-40h4l34 58H14z"/><path class="lm-stone" d="M-6-40v-14h12v14z"/><path class="lm-roof2" d="M-8-54L0-66l8 12z"/>`,
  bridge: `<path class="lm-bridgeb" d="M-26 0q26-14 52 0"/><path class="lm-bridge" d="M-26 0q26-14 52 0M-20-4v6M-10-7v6M0-8v6M10-7v6M20-4v6"/>`,
  stump: `<path class="lm-trunk" d="M-8 8V-6h16V8z"/><ellipse class="lm-sand" cx="0" cy="-6" rx="8" ry="3"/>`,
  houses: `<path class="lm-wall" d="M-20 8V-4h12V8zM-4 8V-8h12V8zM12 8V-2h10V8z"/><path class="lm-redroof2" d="M-22-4l8-8 8 8zM-6-8l8-9 8 9zM10-2l7-7 7 7z"/><path class="lm-win" d="M-16 0h3v3h-3zM0-3h3v3h-3zM16 2h3v3h-3z"/>`,
  pinnacle: `<path class="lm-rock" d="M-14 10l4-22 6-6 6 8 4-6 8 26z"/><path class="lm-foam" d="M-20 10c6-4 12-4 18 0 6-4 12-4 18 0"/>`,
  shrine: `<path class="lm-stone" d="M-14 10V-4h28v14z"/><path class="lm-roof2" d="M-17-4L0-14l17 10z"/><path class="lm-door" d="M-4 10V2h8v8z"/>`,
};
const mark = ([k, x, y, s]: [Landmark, number, number, number]) => `<g class="lm" transform="translate(${x} ${y}) scale(${s})">${MARKS[k]}</g>`;

/** Painted details inside an area, by terrain. */
function detail(id: string, a: MapArea): string {
  if (!a.pts) return '';
  const seed = [...id].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7);
  const r = rng(seed);
  switch (a.terrain) {
    case 'forest': return forest(a.pts, seed, 8, 95);
    case 'woods': return forest(a.pts, seed, 9, 70);
    case 'rock': return scatter(a.pts, 1500, seed, 8).map(([x, y]) => peak(x, y + 10, 13, false, r)).join('');
    case 'snow': return scatter(a.pts, 1700, seed, 10).map(([x, y]) => peak(x, y + 10, 14, true, r)).join('') + scatter(a.pts, 900, seed + 1, 6).map(([x, y]) => pine(x, y, 5)).join('');
    case 'field': case 'meadow': return scatter(a.pts, 900, seed, 4).map(([x, y]) => r() < .3 ? tree(x, y, 4.5) : `<path class="tuft" d="M${r1(x - 4)} ${r1(y)}l2-5 2 5 2-6 2 6"/>`).join('');
    case 'desert': case 'sand': return scatter(a.pts, 900, seed, 6).map(([x, y]) => `<path class="dune" d="M${r1(x - 14)} ${r1(y)}q14-9 28 0"/>`).join('');
    case 'canyon': return scatter(a.pts, 1100, seed, 6).map(([x, y]) => `<path class="crack" d="M${r1(x - 12)} ${r1(y)}l6-4 5 5 8-6 5 3"/>`).join('');
    case 'water': return scatter(a.pts, 700, seed, 8).map(([x, y]) => `<path class="ripple" d="M${r1(x - 9)} ${r1(y)}q4.5-4 9 0t9 0"/>`).join('');
    case 'coast': return scatter(a.pts, 450, seed, 4).map(([x, y]) => `<circle class="pebble" cx="${r1(x)}" cy="${r1(y)}" r="${r1(1 + r())}"/>`).join('');
    case 'swamp': return scatter(a.pts, 500, seed, 5).map(([x, y]) => r() < .45 ? `<ellipse class="bog" cx="${r1(x)}" cy="${r1(y)}" rx="7" ry="3"/>` : `<path class="reed" d="M${r1(x)} ${r1(y + 5)}v-10M${r1(x + 3)} ${r1(y + 5)}l3-8M${r1(x - 3)} ${r1(y + 5)}l-2-7"/>`).join('');
    case 'grave': return scatter(a.pts, 500, seed, 6).map(([x, y]) => `<path class="stone" d="M${r1(x - 3.5)} ${r1(y + 4)}v-6a3.5 3.5 0 0 1 7 0v6z"/>`).join('');
    case 'town': return a.sharp ? '' : scatter(a.pts, 600, seed, 6).map(([x, y]) => `<path class="roof" d="M${r1(x - 5)} ${r1(y + 3)}v-4l5-4 5 4v4z"/>`).join('');
    case 'ranch': { const p = pairs(a.pts), b = bounds(p); return `<ellipse class="fence" cx="${r1((b.x0 + b.x1) / 2)}" cy="${r1((b.y0 + b.y1) / 2 + 4)}" rx="${r1((b.x1 - b.x0) * .36)}" ry="${r1((b.y1 - b.y0) * .3)}"/>`; }
    case 'moon': return `<circle class="crater" cx="682" cy="188" r="6"/><circle class="crater" cx="700" cy="204" r="8"/><circle class="crater" cx="684" cy="210" r="3.5"/>`;
    default: return '';
  }
}

export type AreaState = { cls: string; label: string };

/**
 * The SVG for one game's map. `state` gives each area's classes; areas it leaves out are painted as plain land with
 * no name (this seed doesn't list them).
 */
export function drawWorld(game: 'oot' | 'mm', state: (id: string) => AreaState | undefined, editAttr: (id: string) => string): string {
  const w = WORLD[game], g = game;
  const used = new Set<Terrain>([...Object.values(w.areas).map(a => a.terrain).filter((t): t is Terrain => !!t), ...w.ground.map(x => x.terrain)]);
  const defs = `<defs>
    <radialGradient id="land-${g}" cx="50%" cy="48%" r="68%"><stop offset="0" stop-color="${w.land[0]}"/><stop offset="1" stop-color="${w.land[1]}"/></radialGradient>
    <radialGradient id="vig-${g}" cx="50%" cy="50%" r="72%"><stop offset=".62" stop-color="#2a1806" stop-opacity="0"/><stop offset="1" stop-color="#2a1806" stop-opacity=".62"/></radialGradient>
    <linearGradient id="sea-${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#16456e"/><stop offset=".8" stop-color="#2d7cae"/><stop offset="1" stop-color="#5fb4d8"/></linearGradient>
    ${[...used].map(t => grad(g, t)).join('')}
    <filter id="paint-${g}" x="-3%" y="-3%" width="106%" height="106%">
      <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="${g === 'oot' ? 3 : 8}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="5" result="b"/>
      <feComposite in="d" in2="b" operator="arithmetic" k2="1" k3="-1" result="rimA"/>
      <feColorMatrix in="rimA" type="matrix" values="0 0 0 0 .16  0 0 0 0 .09  0 0 0 0 .03  0 0 0 2.2 0" result="rim"/>
      <feComposite in="rim" in2="d" operator="in" result="rimIn"/>
      <feMerge><feMergeNode in="d"/><feMergeNode in="rimIn"/></feMerge>
    </filter>
    <filter id="grain-${g}" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .08  0 0 0 -1.4 1.1"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="blot-${g}" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .22  0 0 0 0 .14  0 0 0 0 .04  0 0 0 1.6 -.55"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="glow-${g}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <pattern id="wave-${g}" width="44" height="22" patternUnits="userSpaceOnUse"><path d="M2 8q5-5 10 0t10 0M24 18q5-5 10 0t10 0" class="wave"/></pattern>
    <clipPath id="clip-${g}"><rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" rx="16"/></clipPath>
  </defs>`;
  const water = w.water.map(x => x.closed
    ? `<path fill="url(#sea-${g})" d="${smooth(x.pts)}"/><path class="shore" d="${smooth(x.pts)}"/><path fill="url(#wave-${g})" opacity=".55" d="${smooth(x.pts)}"/>`
    : `<path class="river-bank" stroke-width="${(x.w ?? 5) + 5}" d="${smooth(x.pts, false)}"/><path class="river" stroke-width="${x.w ?? 5}" d="${smooth(x.pts, false)}"/><path class="river-hi" stroke-width="${Math.max(1, (x.w ?? 5) / 3)}" d="${smooth(x.pts, false)}"/>`).join('');
  const ground = w.ground.map(x => `<path fill="url(#p-${x.terrain}-${g})" opacity=".8" d="${smooth(x.pts)}"/>`).join('');
  const roads = w.roads.map(r => `<path class="rd-under" d="${smooth(r, false)}"/><path class="rd" d="${smooth(r, false)}"/>`).join('');
  const entries = Object.entries(w.areas).filter(([, a]) => a.pts);
  const fills = entries.map(([id, a]) => {
    const s = state(id);
    const fill = `fill="url(#p-${a.terrain}-${g})"`;
    if (!s) return `<path class="rg-off" ${fill} d="${shapeOf(a)}"/>`;
    return `<g class="rg ${s.cls}" data-region="${id}"${editAttr(id)}><path class="rg-fill" ${fill} d="${shapeOf(a)}"/>${detail(id, a)}</g>`;
  }).join('');
  /* Outlines sit above every area and its details, so a hovered or finished area's edge always shows. */
  const edges = entries.map(([id, a]) => {
    const s = state(id);
    return s ? `<path class="rg-edge ${s.cls}" data-edge="${id}" d="${shapeOf(a)}"/>` : '';
  }).join('');
  const ranges = w.ranges.filter(x => x.s > 0).map((x, i) => range(x.pts, x.s, !!x.snow, i * 97 + (g === 'oot' ? 1 : 5))).join('');
  const woods = w.forests.map((f, i) => forest(f, i * 131 + 17, 9, 80)).join('');
  const townWall = g === 'mm' ? `<circle class="town-wall" cx="500" cy="352" r="134"/><circle class="town-wall-in" cx="500" cy="352" r="129"/>` : '';
  return `<svg class="world-art" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    ${defs}
    <g clip-path="url(#clip-${g})">
      <rect fill="url(#land-${g})" x="0" y="0" width="${MAP_W}" height="${MAP_H}"/>
      ${ground}${water}
      <g class="paint" filter="url(#paint-${g})">${fills}</g>
      ${townWall}${roads}
      <g class="deco">${ranges}${woods}${w.marks.map(mark).join('')}</g>
      ${edges}
      <rect filter="url(#blot-${g})" x="0" y="0" width="${MAP_W}" height="${MAP_H}" opacity=".5" pointer-events="none"/>
      <rect filter="url(#grain-${g})" x="0" y="0" width="${MAP_W}" height="${MAP_H}" opacity=".35" pointer-events="none"/>
      <rect fill="url(#vig-${g})" x="0" y="0" width="${MAP_W}" height="${MAP_H}" pointer-events="none"/>
    </g>
    <g class="compass" transform="translate(${g === 'oot' ? 52 : 948} 640)"><circle r="24" class="c-ring"/><circle r="19" class="c-in"/>
      <path class="c-s" d="M0-30L6 0 0 30-6 0Z"/><path class="c-s" d="M-30 0L0-6 30 0 0 6Z" opacity=".6"/><path class="c-n" d="M0-30L6 0H-6Z"/><path class="c-nl" d="M-4-36v-9l8 9v-9"/></g>
    <rect class="frame-out" x="1.5" y="1.5" width="${MAP_W - 3}" height="${MAP_H - 3}" rx="16"/><rect class="frame-in" x="7" y="7" width="${MAP_W - 14}" height="${MAP_H - 14}" rx="12"/>
  </svg>`;
}
