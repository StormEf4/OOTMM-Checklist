/* Original icons for the item menu. Each is a small hand-drawn glyph in a 24×24 box, drawn for this app in the spirit
   of an adventure game's inventory, not taken from any game. A slot picks its glyph and tint from the item id. */

const P = (d: string) => `<path d="${d}"/>`;
const C = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

/* Each glyph is filled with currentColor; a lighter accent layer uses the class "hi". */
const GLYPH: Record<string, string> = {
  sword: P('M17.5 2.5 21.5 2.5 21.5 6.5 10.5 17.5 6.5 13.5Z') + P('M4 12.5l7.5 7.5-1.6 1.6-2.4-2.4-3 3-1.6-1.6 3-3-2.4-2.4Z'),
  bigsword: P('M15 1.5 22.5 1.5 22.5 9 11 20.5 3.5 13Z') + P('M2 12l10 10-1.5 1.5-3-3L4 24 0 20l3.5-3.5-3-3Z'),
  shield: P('M12 2 20.5 5v6.2c0 5.4-3.7 9.2-8.5 10.8C7.2 20.4 3.5 16.6 3.5 11.2V5Z') + `<path class="hi" d="M12 5.2 17.6 7.2v4c0 3.6-2.3 6.3-5.6 7.6Z"/>`,
  bow: P('M6 2.5c8 2 12.5 7.5 15 15.5l-2 .6C16.8 11.6 12.9 6.8 5.5 4.6Z') + P('M5.6 3.6 19.6 18.4l-.9.8L4.8 4.4Z'),
  arrow: P('M5.2 17.4 15.4 7.2l1.6 1.6L6.8 19Z') + P('M21.5 2.5l-1.6 8.4-2.6-2.6-1.6-1.6-2.6-2.6Z') + P('M2.5 21.5l.6-6.2 2.6 2.6 1 1 2.6 2.6Z'),
  bomb: C(11, 14, 7.5) + P('M15.5 6.5l2-2 2 2-2 2Z') + `<path class="hi" d="M17.6 4.4c1-1.6 2.6-2 4-1.2l-.7 1c-.9-.4-1.8-.2-2.4.8Z"/>` + `<circle class="hi" cx="8.2" cy="11.2" r="1.8"/>`,
  stick: P('M4.2 19 16.8 4.2l2.6 2.2L6.8 21.2Z') + `<path class="hi" d="M15.6 5.6l2.6 2.2-.8.9-2.6-2.2Z"/>` + P('M17.2 3.2l3.6-.8-.8 3.6Z'),
  nut: P('M12 3c4.5 0 7.5 4 7.5 9s-3.4 9-7.5 9-7.5-4-7.5-9 3-9 7.5-9Z') + `<path class="hi" d="M9 7c1-1.3 2-1.8 3-1.8v3c-1 0-2 .6-2.6 1.6Z"/>`,
  sling: P('M11 13h2v9h-2Z') + P('M5 3h2.2c0 5 2 8.4 4.8 10 2.8-1.6 4.8-5 4.8-10H19c0 6.2-3 10.8-7 12.4C8 13.8 5 9.2 5 3Z'),
  ocarina: P('M3 12.5C3 8.4 7.5 6 13 6c4.6 0 8 2.4 8 5.8 0 3.8-3.6 6.2-8.6 6.2C7 18 3 16 3 12.5Z') + `<g class="hi">${C(9, 11, 1.1)}${C(12.5, 10, 1.1)}${C(16, 11, 1.1)}${C(11, 14, 1)}</g>`,
  hook: P('M3 21l9.5-9.5 1.4 1.4L4.4 22.4Z') + P('M13 5h6v6h-2V8.4l-4.6 4.6-1.4-1.4L15.6 7H13Z') + P('M17 9.5c3 0 4.5 2 4.5 4.3 0 2.6-2 4.2-4.3 4.2v-2c1.3 0 2.3-.8 2.3-2.2 0-1.2-.9-2.3-2.5-2.3Z'),
  rang: P('M4 6c4-3.5 11-3 15 1.5l-1.7 1.6C14.4 5.8 9.6 5.3 6.5 7.6 9.5 9 11.6 12 12 15.8l-2.4.4C9 12 6.6 9.3 3 8.4Z'),
  lens: C(10, 10, 7) + `<circle class="hi" cx="10" cy="10" r="4.6"/>` + P('M14.8 16.2l1.4-1.4 6 6-1.4 1.4Z'),
  bean: P('M7 5c3.5-2 9-.6 11 3.6 2.3 4.6.3 10.4-4.8 11.2-4 .6-7-2.7-7.6-6.2-.3-2.2 1.6-3 1.4-5.2C6.8 7 6 6 7 5Z') + `<path class="hi" d="M13 7.5c2 .4 3.5 2.2 3.5 4.2h-1.4c0-1.4-1-2.6-2.4-2.9Z"/>`,
  hammer: P('M3 9.5 9.5 3l5 5L8 14.5Z') + P('M11.2 12.2l1.4-1.4 9.4 9.4-1.4 1.4Z'),
  flame: P('M12 2c1.5 3.8 6.5 6 6.5 11.2A6.5 6.5 0 0 1 12 20a6.5 6.5 0 0 1-6.5-6.8c0-3 1.8-4.6 3-6.4.3 2 1 3 2 3.6C10 8 10.8 5 12 2Z') + `<path class="hi" d="M12 11c1.4 1.6 3 2.6 3 4.6a3 3 0 0 1-6 0c0-1.6 1.5-2.4 3-4.6Z"/>`,
  wind: P('M3 8h11a3 3 0 1 0-3-3h2a1 1 0 1 1 1 1H3Z') + P('M3 12h15a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H3Z') + P('M3 16h7v2H3Z'),
  crystal: P('M12 2 18.5 9 12 22 5.5 9Z') + `<path class="hi" d="M12 4.6 15.4 9H12Z"/>`,
  bottle: P('M9.5 2h5v2h-1v3.2c2.8 1 4.5 3.4 4.5 6.3V20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6.5c0-2.9 1.7-5.3 4.5-6.3V4h-1Z') + `<path class="hi" d="M8 14h8v5.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5Z"/>`,
  egg: P('M12 2.5c3.8 0 7 5.5 7 10.4A7 7 0 0 1 12 20a7 7 0 0 1-7-7.1C5 8 8.2 2.5 12 2.5Z') + `<g class="hi">${C(9.5, 10, 1.2)}${C(14, 13, 1)}</g>`,
  letter: P('M3 6h18v12H3Z') + `<path class="hi" d="M3.8 6.8 12 12.6l8.2-5.8v1.8L12 14.4 3.8 8.6Z"/>`,
  scroll: P('M6 3h12a2 2 0 0 1 0 4h-1v12a2 2 0 0 1-2 2H5a2 2 0 0 1 0-4h1Z') + `<path class="hi" d="M8.5 9h6v1.4h-6Zm0 3h6v1.4h-6Z"/>`,
  mask: P('M12 3c5 0 8.5 2.4 8.5 7.6 0 5.8-4 10.4-8.5 10.4S3.5 16.4 3.5 10.6C3.5 5.4 7 3 12 3Z') + `<g class="hi">${P('M6.5 9.5c1.2-1.2 3-1.2 4.2 0-.6 1.6-3.6 1.6-4.2 0Z')}${P('M13.3 9.5c1.2-1.2 3-1.2 4.2 0-.6 1.6-3.6 1.6-4.2 0Z')}${P('M9.5 15.5h5c-.6 1.2-1.4 1.8-2.5 1.8s-1.9-.6-2.5-1.8Z')}</g>`,
  ears: P('M6 2c2 0 3 3 3.4 6.2.9-.2 1.7-.2 2.6-.2s1.7 0 2.6.2C15 5 16 2 18 2s1.8 4 1 7.4c1 1.3 1.5 2.9 1.5 4.6 0 4.4-3.8 8-8.5 8s-8.5-3.6-8.5-8c0-1.7.5-3.3 1.5-4.6C4.2 6 4 2 6 2Z') + `<g class="hi">${P('M7.5 13c1-1 2.6-1 3.6 0-.6 1.3-3 1.3-3.6 0Z')}${P('M12.9 13c1-1 2.6-1 3.6 0-.6 1.3-3 1.3-3.6 0Z')}</g>`,
  leafmask: P('M12 1.5c2.6 1.6 3.6 3.6 3.4 6 3 .6 5.1 3.2 5.1 6.8 0 4.6-3.8 7.7-8.5 7.7s-8.5-3.1-8.5-7.7c0-3.6 2.1-6.2 5.1-6.8-.2-2.4.8-4.4 3.4-6Z') + `<g class="hi">${C(8.8, 13.5, 1.6)}${C(15.2, 13.5, 1.6)}${P('M10 18h4v1.6h-4Z')}</g>`,
  finmask: P('M12 2.5c2 2 6 2.4 8.5 1.5-.4 2.6-1.4 4.4-2.6 5.4.6 1.2 1 2.6 1 4.1 0 4.6-3 8-6.9 8s-6.9-3.4-6.9-8c0-1.5.4-2.9 1-4.1C4.9 8.4 3.9 6.6 3.5 4c2.5.9 6.5.5 8.5-1.5Z') + `<g class="hi">${P('M7.6 12.6c1.1-1 2.7-1 3.6.2-.8 1.2-2.9 1.2-3.6-.2Z')}${P('M12.8 12.8c.9-1.2 2.5-1.2 3.6-.2-.7 1.4-2.8 1.4-3.6.2Z')}</g>`,
  hat: P('M5 13c0-5 3-9 7-9s7 4 7 9Z') + P('M2 13.5h20v3H2Z') + `<path class="hi" d="M5.4 11h13.2v1.6H5.4Z"/>`,
  tunic: P('M8 3h8l5 3.5-2.4 4-1.6-1V21H7V9.5l-1.6 1L3 6.5Z') + `<path class="hi" d="M7 13h10v1.6H7Z"/>`,
  boots: P('M7 2h6v11.5l6.5 3.2c1 .5 1.5 1.3 1.5 2.3V21H4v-4.2c1-.8 2-1.6 3-3.3Z') + `<path class="hi" d="M7 6h6v1.4H7Z"/>`,
  gauntlet: P('M6 9.5V5.5a1.5 1.5 0 0 1 3 0V9V4a1.5 1.5 0 0 1 3 0v5V4.6a1.5 1.5 0 0 1 3 0V10V7a1.5 1.5 0 0 1 3 0v6.5c0 4-2.6 6.5-6.5 6.5H11c-3 0-5-2.3-5-5Z') + `<path class="hi" d="M6 17.5h12V22H6Z"/>`,
  scale: P('M12 2.5c4.5 4.6 7 8.6 7 12A7 7 0 0 1 5 14.5C5 11 7.5 7 12 2.5Z') + `<path class="hi" d="M9 13.5c0-2 1-3.8 3-6 0 2.8-1 4.6-1.4 6.2Z"/>`,
  wallet: P('M7 5c1.2-2 8.8-2 10 0l-1.5 2h-7Z') + P('M4 10c0-2 2-3 4-3h8c2 0 4 1 4 3v8c0 2-2 3-4 3H8c-2 0-4-1-4-3Z') + `<path class="hi" d="M10 12h4v4h-4Z"/>`,
  bag: P('M9 3h6l-1.4 3.2c3.6 1 6.4 4.4 6.4 8.4 0 4.2-3.6 6.4-8 6.4s-8-2.2-8-6.4c0-4 2.8-7.4 6.4-8.4Z') + `<path class="hi" d="M8.5 7.2h7v1.4h-7Z"/>`,
  magic: P('M9 2h6v3l-1 1v1.2c3.5 1 6 4.2 6 7.8 0 4.4-3.6 7-8 7s-8-2.6-8-7c0-3.6 2.5-6.8 6-7.8V6L9 5Z') + `<path class="hi" d="M5.5 15h13c0 3.2-2.8 5.2-6.5 5.2S5.5 18.2 5.5 15Z"/>`,
  medal: C(12, 12, 9) + `<circle class="hi" cx="12" cy="12" r="5.5"/>` + C(12, 12, 3),
  gem: P('M7 3h10l5 6.5L12 22 2 9.5Z') + `<path class="hi" d="M7.8 4.4h3.4L9.4 9H4.6Zm5 0h3.4l3.2 4.6h-4.8Z"/>`,
  rock: P('M5 8l4-4.5 7 .5 4 5-1.5 8-6.5 4.5L5 18 3 12Z') + `<path class="hi" d="M8 9l3-2 4 1-1 3-4 1Z"/>`,
  card: P('M3 5h18v14H3Z') + `<path class="hi" d="M12 7.5 15.5 13h-7Z M6 15h12v1.5H6Z"/>`,
  skull: P('M12 2.5c5 0 8.5 3.4 8.5 8 0 3-1.6 5-3.5 6V20a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20v-3.5c-1.9-1-3.5-3-3.5-6 0-4.6 3.5-8 8.5-8Z') + `<g class="hi">${C(8.6, 11, 2.1)}${C(15.4, 11, 2.1)}</g>`,
  note: P('M9 4.5 20 2v12.8a3.2 2.6 0 1 1-2-2.4V6.5l-7 1.6v9.2a3.2 2.6 0 1 1-2-2.4Z'),
  remains: P('M12 2 21 7v7c0 4-4 7-9 8-5-1-9-4-9-8V7Z') + `<g class="hi">${P('M7 10.5c1.4-1 3-1 4 .3-1 1.4-3 1.4-4-.3Z')}${P('M13 10.8c1-1.3 2.6-1.3 4-.3-1 1.7-3 1.7-4 .3Z')}${P('M12 14l1.6 3h-3.2Z')}</g>`,
  key: C(7.5, 8.5, 5) + P('M10.5 11.5 21 22l-1.6 1.4-1.6-1.6-1.8 1.8-1.4-1.4 1.8-1.8-1.4-1.4-1.8 1.8-1.4-1.4 1.8-1.8-3.6-3.6Z') + `<circle class="hi" cx="7.5" cy="8.5" r="2"/>`,
  keg: P('M6 3h12c1.4 3 2 6 2 9s-.6 6-2 9H6c-1.4-3-2-6-2-9s.6-6 2-9Z') + `<path class="hi" d="M4.6 7.5h14.8v1.6H4.6Zm0 7.4h14.8v1.6H4.6Z"/>`,
  picto: P('M3 7h4l2-3h6l2 3h4v13H3Z') + `<circle class="hi" cx="12" cy="13" r="4"/>`,
  fairy: C(12, 12, 3) + `<path class="hi" d="M12 9C9 3 3 4 4 8.5c.6 2.6 4.4 3.5 8 3.5Zm0 0c3-6 9-5 8-.5-.6 2.6-4.4 3.5-8 3.5Zm0 3c-3 5-7.6 4.6-7.6 1.6 0-2 3.6-2.6 7.6-1.6Zm0 0c3 5 7.6 4.6 7.6 1.6 0-2-3.6-2.6-7.6-1.6Z"/>`,
  spin: P('M12 3a9 9 0 1 1-8.5 6l2 .6A7 7 0 1 0 12 5c-1.4 0-2.7.4-3.8 1.1L10 8H4V2l2.6 2.6A9 9 0 0 1 12 3Z'),
  tear: P('M12 2c4 5.2 6.5 9.2 6.5 12.6a6.5 6.5 0 0 1-13 0C5.5 11.2 8 7.2 12 2Z') + `<path class="hi" d="M9.4 14.6c0-1.8.8-3.6 2.4-5.6-.2 2.4-.8 4.2-1.2 5.6Z"/>`,
  heart: P('M12 21C5 16 2.5 12.2 2.5 8.6 2.5 5.6 4.8 3.5 7.5 3.5c2 0 3.5 1 4.5 2.6 1-1.6 2.5-2.6 4.5-2.6 2.7 0 5 2.1 5 5.1 0 3.6-2.5 7.4-9.5 12.4Z'),
  pendant: P('M7 2h10l-5 9Z') + C(12, 15.5, 5.5) + `<circle class="hi" cx="12" cy="15.5" r="2.6"/>`,
};

/* Song notes take the color of their song, like the colored notes of a music staff. */
const SONG_TINT: Record<string, string> = {
  TP_FOREST: '#5fd16a', TP_FIRE: '#ff6a3d', TP_WATER: '#4fa8ff', TP_SPIRIT: '#ffa04a', TP_SHADOW: '#b07cff', TP_LIGHT: '#ffe066',
  ZELDA: '#c99bff', EPONA: '#ffb36b', SARIA: '#7be37f', SUN: '#ffd34d', TIME: '#7fc8ff', STORMS: '#9fb4c8', HEALING: '#ff8fc1',
  SOARING: '#ffffff', AWAKENING: '#7be37f', GORON: '#ff9a52', GORON_HALF: '#ff9a52', ZORA: '#5ab0ff', EMPTINESS: '#c8a26a', ORDER: '#e6e6e6',
};
const TINTS: [RegExp, string][] = [
  [/FIRE|DIN|RUBY|ODOLWA/, '#ff6a3d'], [/ICE|WATER|SAPPHIRE|ZORA|GYORG|FAROR|WIND/, '#4fb0ff'], [/LIGHT|TWINMOLD/, '#ffe066'],
  [/FOREST|EMERALD|SARIA|DEKU|BEAN/, '#5fd16a'], [/SPIRIT|GOHT|GORON/, '#ffa04a'], [/SHADOW|NAYRU|LOVE/, '#b07cff'],
  [/MIRROR|SILVER|HOOKSHOT|IRON|LENS/, '#cfd8e3'], [/GOLD|GILDED|GIANT|BIGGORON|TOKEN|GS_/, '#ffd34d'],
  [/FIERCE|GARO|GIBDO|STONE_OF_AGONY|CAPTAIN/, '#b9a7c9'], [/FAIRY|POTION|HEAL/, '#ff8fc1'],
];

/** The glyph for an item, from its id. */
function kindOf(id: string): string {
  const x = id.replace(/^(OOT|MM|SHARED)_/, '');
  if (/^SONG_/.test(x)) return 'note';
  if (/^REMAINS_/.test(x)) return 'remains';
  if (/^MEDALLION_/.test(x)) return 'medal';
  if (/^STONE_OF_AGONY/.test(x)) return 'rock';
  if (/^STONE_/.test(x)) return 'gem';
  if (/^MASK_(BUNNY|KEATON|BREMEN|GIBDO)/.test(x)) return 'ears';
  if (/^MASK_(DEKU|SCENTS|GREAT_FAIRY|DON_GERO)/.test(x)) return 'leafmask';
  if (/^MASK_(ZORA|FIERCE|GIANT|GARO|KAMARO)/.test(x)) return 'finmask';
  if (/^MASK_(POSTMAN|CAPTAIN|TROUPE)/.test(x)) return 'hat';
  if (/^MASK_/.test(x)) return 'mask';
  if (/GREAT_FAIRY_SWORD|SWORD_GORON|BIGGORON/.test(x)) return 'bigsword';
  if (/SWORD/.test(x)) return 'sword';
  if (/^SHIELD/.test(x)) return 'shield';
  if (/^ARROW_/.test(x)) return 'arrow';
  if (/^BOW/.test(x)) return 'bow';
  if (/BOMBCHU|^BOMBS|^BOMB_?\d/.test(x)) return 'bomb';
  if (/BOMB_BAG/.test(x)) return 'bag';
  if (/STICK/.test(x)) return 'stick';
  if (/NUT/.test(x)) return 'nut';
  if (/SLINGSHOT/.test(x)) return 'sling';
  if (/OCARINA/.test(x)) return 'ocarina';
  if (/HOOKSHOT/.test(x)) return 'hook';
  if (/BOOMERANG/.test(x)) return 'rang';
  if (/LENS/.test(x)) return 'lens';
  if (/BEAN/.test(x)) return 'bean';
  if (/HAMMER/.test(x)) return 'hammer';
  if (/SPELL_FIRE/.test(x)) return 'flame';
  if (/SPELL_WIND/.test(x)) return 'wind';
  if (/SPELL_LOVE/.test(x)) return 'crystal';
  if (/BOTTLE/.test(x)) return 'bottle';
  if (/EGG|CUCCO|CHICKEN|COJIRO/.test(x)) return 'egg';
  if (/LETTER|PRESCRIPTION|CLAIM/.test(x)) return 'letter';
  if (/DEED/.test(x)) return 'scroll';
  if (/TUNIC/.test(x)) return 'tunic';
  if (/BOOTS/.test(x)) return 'boots';
  if (/STRENGTH|GAUNTLET/.test(x)) return 'gauntlet';
  if (/SCALE/.test(x)) return 'scale';
  if (/WALLET/.test(x)) return 'wallet';
  if (/MAGIC/.test(x)) return 'magic';
  if (/GERUDO_CARD/.test(x)) return 'card';
  if (/GS_TOKEN|SKULL/.test(x)) return 'skull';
  if (/ROOM_KEY|KEY/.test(x)) return 'key';
  if (/POWDER_KEG/.test(x)) return 'keg';
  if (/PICTOGRAPH/.test(x)) return 'picto';
  if (/STRAY_FAIRY/.test(x)) return 'fairy';
  if (/SPIN/.test(x)) return 'spin';
  if (/MOON_TEAR/.test(x)) return 'tear';
  if (/PENDANT/.test(x)) return 'pendant';
  if (/HEART|DEFENSE/.test(x)) return 'heart';
  if (/MUSHROOM|POTION|EYE_DROPS/.test(x)) return 'bottle';
  if (/SAW|BROKEN|FROG|EYEBALL/.test(x)) return 'scroll';
  return 'crystal';
}
/* Each mask gets its own color, so a page of masks reads at a glance. */
const MASK_TINT: Record<string, string> = {
  POSTMAN: '#e05b4b', ALL_NIGHT: '#7b8cff', BLAST: '#cf5a3a', STONE: '#9aa3ad', GREAT_FAIRY: '#ff8fc1', DEKU: '#7cc66a', KEATON: '#f2b24c',
  BREMEN: '#e0c060', BUNNY: '#f4e6d0', DON_GERO: '#7fae5c', SCENTS: '#c9a35a', GORON: '#d98a4e', ROMANI: '#f0d8b4', TROUPE_LEADER: '#c06ad8',
  KAFEI: '#9b7bdc', COUPLE: '#ffd34d', TRUTH: '#b0b8e8', ZORA: '#5aa8ff', KAMARO: '#4fc0a0', GIBDO: '#c8b89a', GARO: '#6e6e86',
  CAPTAIN: '#a89070', GIANT: '#d6a46a', FIERCE_DEITY: '#e8eef6', SKULL: '#e8e0cc', SPOOKY: '#c09060', GERUDO: '#d9a05a',
};
function tintOf(id: string, kind: string): string {
  const x = id.replace(/^(OOT|MM|SHARED)_/, '');
  if (/^MASK_/.test(x)) return MASK_TINT[x.replace(/^MASK_/, '')] ?? '';
  if (kind === 'note') return SONG_TINT[x.replace(/^SONG_/, '')] ?? '#ffe066';
  if (kind === 'skull' || kind === 'gem' && /EMERALD/.test(x)) return TINTS.find(([re]) => re.test(x))?.[1] ?? '#ffd34d';
  return TINTS.find(([re]) => re.test(x))?.[1] ?? '';
}

/** The inline SVG icon for an item id, with its tint as a CSS variable. */
export function menuIcon(id: string): string {
  const kind = kindOf(id);
  const tint = tintOf(id, kind);
  return `<svg class="mi mi-${kind}" viewBox="0 0 24 24" aria-hidden="true"${tint ? ` style="--tint:${tint}"` : ''}>${GLYPH[kind]}</svg>`;
}
