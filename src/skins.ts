/* Every theme is a set of tokens, so a player's color edits work on any of them. */
const svg = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' ${s}</svg>`)}")`;

const CLIP = {
  rupee: 'polygon(50% 0, 88% 20%, 88% 80%, 50% 100%, 12% 80%, 12% 20%)',
  circle: 'circle(50% at 50% 50%)',
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  hexagon: 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)',
  drop: 'polygon(50% 0, 74% 30%, 90% 56%, 86% 80%, 68% 96%, 32% 96%, 14% 80%, 10% 56%, 26% 30%)',
};

export type Skin = {
  id: string;
  name: string;
  blurb: string;
  meter: 'hearts' | 'clock';
  dark: boolean;
  tokens: Record<string, string>;
};

const triangles = (c: string) => svg(`width='84' height='73' viewBox='0 0 84 73'><path fill='none' stroke='${c}' stroke-opacity='.075' d='M0 73 42 0l42 73zM21 36.500h42M21 36.500l21 36.500 21-36.500'/>`);
const stars = (c: string) => svg(`width='150' height='150' viewBox='0 0 150 150'><g fill='${c}' fill-opacity='.2'><circle cx='24' cy='32' r='1.200'/><circle cx='96' cy='18' r='.8'/><circle cx='130' cy='84' r='1.300'/><circle cx='62' cy='112' r='.9'/><circle cx='14' cy='128' r='.7'/></g>`);
const waves = (c: string) => svg(`width='120' height='42' viewBox='0 0 120 42'><path fill='none' stroke='${c}' stroke-opacity='.085' stroke-width='1.500' d='M0 12c20 0 20 12 40 12s20-12 40-12 20 12 40 12M0 33c20 0 20 9 40 9s20-9 40-9 20 9 40 9'/>`);
const cracks = (c: string) => svg(`width='180' height='180' viewBox='0 0 180 180'><path fill='none' stroke='${c}' stroke-opacity='.11' d='M0 40l34 14 22-20 40 26 30-12 54 22M60 180l10-46 42-18 12-56M0 142l38-10 32 2M124 116l56 20'/>`);
const eyes = (c: string) => svg(`width='96' height='96' viewBox='0 0 96 96'><g fill='none' stroke='${c}' stroke-opacity='.07'><path d='M16 48c10-14 22-20 32-20s22 6 32 20c-10 14-22 20-32 20S26 62 16 48z'/><circle cx='48' cy='48' r='9'/></g>`);

export const SKINS: Skin[] = [
  {
    id: 'hero', name: 'Hero of Time', blurb: 'Kokiri green, royal gold and heart containers', meter: 'hearts', dark: true,
    tokens: { bg: '#0d211a', panel: '#123026', raised: '#1a4133', ink: '#f6eed3', muted: '#a8bba3', faint: '#2a5442', gold: '#f0c63f', 'gold-ink': '#211703', oot: '#5ee08a', mm: '#c394ef', warn: '#ffa487', 'warn-bg': '#3b2a1b', moon: '#0f2b21', heart: '#ea3f3f', rim: '#a9852a', display: "'Cinzel Decorative', 'Almendra', Georgia, serif", pattern: triangles('#f0c63f'), clip: CLIP.rupee },
  },
  {
    id: 'termina', name: 'Termina Night', blurb: 'Moonlit violet and the three-day clock', meter: 'clock', dark: true,
    tokens: { bg: '#1b1533', panel: '#251d45', raised: '#2f2656', ink: '#efe9da', muted: '#aba3c4', faint: '#3f3569', gold: '#e8bd57', 'gold-ink': '#2a1c05', oot: '#62d39a', mm: '#cf8bec', warn: '#f4b183', 'warn-bg': '#43283a', moon: '#3a2f63', heart: '#cf8bec', rim: '#6b5aa8', display: "'Almendra', Georgia, serif", pattern: stars('#efe9da'), clip: CLIP.circle },
  },
  {
    id: 'zora', name: "Zora's Domain", blurb: 'Deep water, sapphire and pale aqua', meter: 'hearts', dark: true,
    tokens: { bg: '#071f30', panel: '#0c2e45', raised: '#123d5a', ink: '#e7f7f8', muted: '#94bbc9', faint: '#1d5170', gold: '#6be3da', 'gold-ink': '#03232a', oot: '#62e3a8', mm: '#b9a6ff', warn: '#ffc29a', 'warn-bg': '#16384a', moon: '#0a2a40', heart: '#52b6ff', rim: '#2f7f9a', display: "'Marcellus', Georgia, serif", pattern: waves('#6be3da'), clip: CLIP.drop },
  },
  {
    id: 'mountain', name: 'Death Mountain', blurb: 'Obsidian, embers and Goron fire', meter: 'hearts', dark: true,
    tokens: { bg: '#1c0e0a', panel: '#2a1510', raised: '#3b1d14', ink: '#fae9d3', muted: '#c6a48c', faint: '#5a2b1b', gold: '#ffa232', 'gold-ink': '#2a1002', oot: '#ffd25e', mm: '#ff7d66', warn: '#ffb98a', 'warn-bg': '#452014', moon: '#2c130d', heart: '#ff4f2e', rim: '#a24a1c', display: "'Metamorphous', Georgia, serif", pattern: cracks('#ffa232'), clip: CLIP.diamond },
  },
  {
    id: 'shadow', name: 'Shadow Temple', blurb: 'Ash, bone and the eye that sees truth', meter: 'clock', dark: true,
    tokens: { bg: '#131116', panel: '#1c1921', raised: '#27232e', ink: '#ebe6ef', muted: '#a59eb0', faint: '#3b3546', gold: '#e0536a', 'gold-ink': '#1a060b', oot: '#92d6c3', mm: '#b892e2', warn: '#f2a3a3', 'warn-bg': '#34202a', moon: '#201c27', heart: '#d8344f', rim: '#5e5270', display: "'Pirata One', 'Almendra', Georgia, serif", pattern: eyes('#ebe6ef'), clip: CLIP.hexagon },
  },
  {
    id: 'day', name: 'Hyrule Day', blurb: 'The one light theme, for bright rooms', meter: 'hearts', dark: false,
    tokens: { bg: '#dce6d4', panel: '#eaf0e2', raised: '#f5f8ef', ink: '#1c2a23', muted: '#55665c', faint: '#c3d0bc', gold: '#8f6410', 'gold-ink': '#fff7df', oot: '#1c7a4c', mm: '#7c3aa8', warn: '#9a3412', 'warn-bg': '#f7e6d4', moon: '#c9d6c0', heart: '#c42e2e', rim: '#a8924f', display: "'Almendra', Georgia, serif", pattern: triangles('#1c2a23'), clip: CLIP.rupee },
  },
];

export const COLOR_TOKENS: [string, string][] = [
  ['bg', 'Background'], ['panel', 'Side panel and boxes'], ['raised', 'Raised parts and fields'], ['ink', 'Main text'], ['muted', 'Quiet text'],
  ['faint', 'Lines and borders'], ['gold', 'Accent'], ['gold-ink', 'Text on accent'], ['oot', 'Ocarina of Time color'], ['mm', "Majora's Mask color"],
  ['heart', 'Hearts'], ['rim', 'Frame trim'], ['moon', 'Clock face'], ['warn', 'Warnings'], ['warn-bg', 'Warning background'],
];

export const FONT_CHOICES: [string, string][] = [
  ['', 'Use the theme font'], ["'Cinzel Decorative', Georgia, serif", 'Cinzel Decorative'], ["'Almendra', Georgia, serif", 'Almendra'],
  ["'Marcellus', Georgia, serif", 'Marcellus'], ["'Metamorphous', Georgia, serif", 'Metamorphous'], ["'Pirata One', Georgia, serif", 'Pirata One'],
  ["'Alegreya Sans', system-ui, sans-serif", 'Alegreya Sans'],
];

export const SEALS: [string, string][] = [
  ['', 'Use the theme shape'], [CLIP.rupee, 'Rupee'], [CLIP.circle, 'Circle'], [CLIP.diamond, 'Diamond'], [CLIP.hexagon, 'Hexagon'], [CLIP.drop, 'Water drop'],
];

export const skinById = (id?: string) => SKINS.find(s => s.id === id) ?? SKINS[0];
