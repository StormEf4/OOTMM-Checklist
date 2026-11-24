/**
 * The Map view's two painted maps, Hyrule and Termina. Both are original drawings: each overworld area is a shape
 * placed where it sits in its game, with terrain, mountains, forests and landmarks drawn in src/worldmap.ts, so the
 * layout is recognisable without copying either game's map art.
 *
 * Coordinates are on a 1000 x 700 board. An area with `pts` is drawn as a shape through those points; an area without
 * is a small place (a building, a room) shown as a marker. `at` is where its name sits. Players can move any name in
 * Edit mode or take it off the map, and areas a fork adds show up under "Not on the map" until they place them.
 */
export type Terrain = 'field' | 'forest' | 'woods' | 'desert' | 'sand' | 'rock' | 'volcano' | 'water' | 'town' | 'castle'
  | 'snow' | 'swamp' | 'canyon' | 'grave' | 'ranch' | 'temple' | 'coast' | 'moon' | 'dark' | 'meadow';
export type Landmark = 'castle' | 'darkcastle' | 'tower' | 'volcano' | 'windmill' | 'greattree' | 'barn' | 'temple' | 'waterfall'
  | 'island' | 'fortress' | 'pillar' | 'hut' | 'ruin' | 'stonetower' | 'palace' | 'dome' | 'spire' | 'bridge' | 'stump' | 'houses'
  | 'pinnacle' | 'shrine';
export type MapArea = { at: [number, number]; pts?: number[]; terrain?: Terrain; sharp?: boolean };
export type WorldMap = {
  /** The land everything sits on: its colours, from the middle out. */
  land: [string, string];
  /** Areas by OoTMM region id. */
  areas: Record<string, MapArea>;
  /** Unclickable ground drawn under the areas, so the land between places has terrain too. */
  ground: { pts: number[]; terrain: Terrain }[];
  /** Sea, lakes and rivers: closed shapes and open lines (width). */
  water: { pts: number[]; closed?: boolean; w?: number }[];
  /** Dirt paths between places. */
  roads: number[][];
  /** Mountain ranges: peaks drawn along each line, `s` their size, `snow` for white tops. */
  ranges: { pts: number[]; s: number; snow?: boolean }[];
  /** Woods drawn as packed treetops inside each shape. */
  forests: number[][];
  /** Buildings and landmarks: kind, x, y, size. */
  marks: [Landmark, number, number, number][];
};

export const MAP_W = 1000;
export const MAP_H = 700;

/* Clock Town is drawn as a round walled town split into four districts. */
const town = (cx: number, cy: number, r: number, from: number, to: number) => {
  const pts: number[] = [cx, cy];
  for (let a = from; a <= to + 0.01; a += (to - from) / 8) pts.push(Math.round(cx + Math.cos(a * Math.PI / 180) * r), Math.round(cy + Math.sin(a * Math.PI / 180) * r));
  return pts;
};
const TX = 500, TY = 352, TR = 134;

export const WORLD: Record<'oot' | 'mm', WorldMap> = {
  oot: {
    land: ['#8a9a55', '#4f5a2e'],
    areas: {
      OOT_HYRULE_FIELD: { at: [452, 262], terrain: 'field', pts: [395, 205, 500, 178, 625, 182, 722, 214, 752, 292, 742, 388, 700, 470, 612, 528, 500, 540, 420, 500, 382, 420, 372, 302] },
      OOT_LON_LON_RANCH: { at: [570, 388], terrain: 'ranch', pts: [515, 322, 568, 300, 622, 318, 636, 372, 602, 414, 545, 416, 508, 380] },
      OOT_SACRED_REALM: { at: [372, 192] },
      OOT_TEMPLE_OF_TIME: { at: [418, 146], terrain: 'temple', pts: [380, 102, 448, 90, 458, 148, 392, 160] },
      OOT_MARKET: { at: [528, 146], terrain: 'town', pts: [472, 98, 550, 86, 588, 112, 576, 160, 498, 168, 466, 136] },
      OOT_HYRULE_CASTLE: { at: [512, 66], terrain: 'castle', pts: [470, 14, 558, 6, 576, 72, 484, 80] },
      OOT_GANON_CASTLE_EXTERIOR: { at: [640, 66], terrain: 'dark', pts: [592, 12, 668, 18, 672, 76, 598, 80] },
      OOT_GORON_CITY: { at: [708, 120], terrain: 'rock', pts: [668, 64, 742, 56, 758, 128, 690, 142, 660, 106] },
      OOT_DEATH_MOUNTAIN_CRATER: { at: [834, 68], terrain: 'volcano', pts: [772, 8, 878, 10, 892, 68, 790, 78] },
      OOT_DEATH_MOUNTAIN_TRAIL: { at: [832, 160], terrain: 'rock', pts: [772, 96, 880, 86, 896, 190, 802, 198, 766, 150] },
      OOT_ZORA_FOUNTAIN: { at: [950, 80], terrain: 'water', pts: [908, 18, 990, 24, 994, 118, 914, 124] },
      OOT_ZORA_DOMAIN: { at: [948, 204], terrain: 'water', pts: [910, 140, 992, 136, 995, 226, 918, 230] },
      OOT_KAKARIKO: { at: [812, 280], terrain: 'town', pts: [766, 212, 846, 206, 862, 256, 846, 304, 786, 312, 758, 262] },
      OOT_GRAVEYARD: { at: [910, 280], terrain: 'grave', pts: [872, 242, 936, 240, 946, 302, 882, 310] },
      OOT_ZORA_RIVER: { at: [862, 360], terrain: 'meadow', pts: [762, 326, 852, 320, 932, 298, 954, 244, 995, 238, 995, 322, 952, 366, 862, 378, 762, 378] },
      OOT_LOST_WOODS: { at: [812, 478], terrain: 'woods', pts: [760, 402, 850, 394, 904, 422, 900, 506, 830, 526, 760, 506, 746, 450] },
      OOT_SACRED_MEADOW: { at: [958, 444], terrain: 'meadow', pts: [914, 396, 990, 392, 995, 492, 922, 502] },
      OOT_KOKIRI_FOREST: { at: [846, 636], terrain: 'forest', pts: [772, 542, 880, 532, 975, 552, 990, 642, 920, 690, 800, 688, 760, 620] },
      OOT_LAKE_HYLIA: { at: [314, 596], terrain: 'water', pts: [262, 546, 380, 540, 440, 576, 452, 642, 400, 690, 290, 692, 236, 640] },
      OOT_GERUDO_VALLEY: { at: [328, 410], terrain: 'canyon', pts: [292, 330, 368, 318, 390, 380, 372, 442, 300, 450, 280, 390] },
      OOT_GERUDO_FORTRESS: { at: [230, 384], terrain: 'sand', pts: [186, 280, 274, 270, 284, 330, 280, 422, 196, 430, 176, 350] },
      OOT_HAUNTED_WASTELAND: { at: [118, 290], terrain: 'desert', pts: [86, 180, 168, 170, 174, 300, 168, 472, 92, 500, 70, 330] },
      OOT_DESERT_COLOSSUS: { at: [70, 132], terrain: 'desert', pts: [6, 42, 120, 36, 140, 150, 70, 166, 6, 152] },
    },
    ground: [
      { terrain: 'sand', pts: [0, 0, 160, 0, 200, 170, 190, 520, 120, 560, 0, 540] },
      { terrain: 'field', pts: [440, 540, 760, 520, 760, 700, 440, 700] },
      { terrain: 'rock', pts: [640, 0, 1000, 0, 1000, 130, 900, 240, 760, 200, 650, 150] },
    ],
    water: [
      { pts: [330, 448, 334, 500, 318, 548], w: 7 },
      { pts: [762, 352, 860, 350, 940, 318, 972, 236], w: 8 },
      { pts: [762, 352, 700, 372, 640, 430, 560, 470, 470, 470, 420, 520, 360, 560], w: 5 },
      { pts: [458, 96, 470, 180, 590, 176, 596, 96], w: 4 },
      { pts: [952, 230, 950, 140], w: 6 },
    ],
    roads: [
      [524, 168, 520, 230, 540, 300],
      [622, 318, 700, 280, 758, 262],
      [508, 380, 440, 400, 382, 400],
      [600, 414, 660, 470, 750, 470],
      [500, 540, 470, 560, 430, 580],
      [688, 140, 720, 180, 766, 200],
      [280, 390, 240, 400, 196, 400],
    ],
    ranges: [
      { pts: [180, 30, 260, 20, 360, 40, 440, 30], s: 30, snow: true },
      { pts: [200, 120, 300, 110, 360, 180], s: 24 },
      { pts: [10, 590, 80, 560, 150, 600, 220, 690], s: 28, snow: true },
      { pts: [20, 690, 120, 680], s: 20 },
      { pts: [610, 110, 650, 150], s: 16 },
    ],
    forests: [
      [460, 560, 560, 548, 660, 560, 750, 540, 760, 610, 730, 690, 470, 690, 452, 640],
      [745, 400, 760, 340, 770, 395],
    ],
    marks: [
      ['castle', 515, 36, 1], ['darkcastle', 632, 40, .9], ['temple', 418, 118, .9], ['houses', 528, 120, 1],
      ['volcano', 832, 40, 1.15], ['hut', 708, 92, .9], ['windmill', 792, 248, .9], ['houses', 826, 246, .7],
      ['waterfall', 952, 168, 1], ['island', 368, 642, 1], ['barn', 568, 352, 1], ['greattree', 930, 610, 1.1],
      ['houses', 820, 600, .7], ['fortress', 230, 340, 1], ['bridge', 332, 372, 1], ['pillar', 66, 92, 1],
      ['shrine', 954, 428, .8], ['stump', 828, 440, .8],
    ],
  },
  mm: {
    land: ['#8f9a5c', '#535c34'],
    areas: {
      MM_TERMINA_FIELD: { at: [318, 236], terrain: 'field', pts: [500, 132, 640, 150, 744, 216, 790, 330, 760, 450, 660, 540, 500, 566, 340, 540, 238, 452, 208, 330, 256, 216, 360, 150] },
      MM_CLOCK_TOWN_NORTH: { at: [TX - 44, TY - 96], terrain: 'town', sharp: true, pts: town(TX, TY, TR, 225, 315) },
      MM_CLOCK_TOWN_EAST: { at: [TX + 90, TY + 10], terrain: 'town', sharp: true, pts: town(TX, TY, TR, -45, 45) },
      MM_CLOCK_TOWN_SOUTH: { at: [TX - 34, TY + 100], terrain: 'town', sharp: true, pts: town(TX, TY, TR, 45, 135) },
      MM_CLOCK_TOWN_WEST: { at: [TX - 90, TY + 10], terrain: 'town', sharp: true, pts: town(TX, TY, TR, 135, 225) },
      MM_CLOCK_TOWER_ROOFTOP: { at: [TX, TY + 44] },
      MM_STOCK_POT_INN: { at: [TX + 72, TY - 66] },
      MM_LAUNDRY_POOL: { at: [TX + 72, TY + 84] },
      MM_PATH_TO_MOUNTAIN_VILLAGE: { at: [500, 128], terrain: 'snow', pts: [470, 92, 530, 92, 534, 140, 466, 140] },
      MM_MOUNTAIN_VILLAGE: { at: [482, 64], terrain: 'snow', pts: [410, 14, 590, 12, 600, 84, 520, 92, 480, 92, 404, 82] },
      MM_TWIN_ISLANDS: { at: [342, 82], terrain: 'snow', pts: [290, 20, 392, 16, 398, 108, 296, 118] },
      MM_GORON_VILLAGE: { at: [228, 80], terrain: 'snow', pts: [178, 12, 278, 10, 284, 100, 184, 106] },
      MM_GORON_RACETRACK: { at: [216, 134] },
      MM_PATH_TO_SNOWHEAD: { at: [656, 78], terrain: 'snow', pts: [608, 22, 700, 18, 706, 100, 612, 106] },
      MM_SNOWHEAD: { at: [772, 82], terrain: 'snow', pts: [718, 8, 830, 6, 836, 98, 722, 104] },
      MM_PIRATE_FORTRESS_EXTERIOR: { at: [86, 100], terrain: 'castle', pts: [18, 70, 150, 64, 156, 228, 22, 234] },
      MM_PIRATE_FORTRESS_INTERIOR: { at: [86, 148] },
      MM_PIRATE_FORTRESS_SEWERS: { at: [86, 196] },
      MM_PINNACLE_ROCK: { at: [50, 330] },
      MM_GREAT_BAY_COAST: { at: [150, 372], terrain: 'coast', pts: [112, 248, 196, 238, 210, 340, 222, 440, 120, 458, 96, 350] },
      MM_SPIDER_HOUSE_OCEAN: { at: [166, 268] },
      MM_ZORA_CAPE: { at: [70, 494], terrain: 'coast', pts: [24, 460, 134, 470, 150, 572, 96, 616, 26, 604] },
      MM_ZORA_HALL: { at: [76, 572] },
      MM_MILK_ROAD: { at: [254, 566], terrain: 'field', pts: [220, 520, 286, 528, 292, 588, 222, 590] },
      MM_ROMANI_RANCH: { at: [248, 666], terrain: 'ranch', pts: [170, 606, 290, 604, 318, 676, 230, 696, 160, 676] },
      MM_ROAD_TO_SWAMP: { at: [500, 596], terrain: 'swamp', pts: [470, 568, 532, 568, 536, 620, 466, 620] },
      MM_SOUTHERN_SWAMP: { at: [500, 642], terrain: 'swamp', pts: [370, 628, 500, 622, 640, 628, 650, 694, 380, 696] },
      MM_DEKU_PALACE: { at: [606, 678] },
      MM_SPIDER_HOUSE_SWAMP: { at: [380, 672] },
      MM_WOODFALL: { at: [716, 676], terrain: 'woods', pts: [664, 606, 760, 600, 780, 684, 670, 694] },
      MM_ROAD_TO_IKANA: { at: [830, 352], terrain: 'canyon', pts: [796, 326, 866, 322, 870, 380, 800, 382] },
      MM_IKANA_GRAVEYARD: { at: [858, 480], terrain: 'grave', pts: [800, 420, 910, 414, 922, 512, 812, 522] },
      MM_IKANA_CANYON: { at: [940, 322], terrain: 'canyon', pts: [880, 240, 994, 236, 996, 420, 920, 424, 878, 360] },
      MM_BENEATH_THE_WELL: { at: [944, 392] },
      MM_SECRET_SHRINE: { at: [946, 262] },
      MM_IKANA_CASTLE: { at: [826, 220], terrain: 'grave', pts: [776, 156, 870, 150, 876, 232, 782, 240] },
      MM_MOON: { at: [690, 232], terrain: 'moon', pts: [690, 168, 712, 176, 720, 196, 712, 216, 690, 224, 668, 216, 660, 196, 668, 176] },
      MM_STONE_TOWER: { at: [928, 160], terrain: 'canyon', pts: [880, 30, 994, 26, 996, 220, 884, 224] },
    },
    ground: [
      { terrain: 'snow', pts: [150, 0, 860, 0, 860, 120, 600, 130, 400, 130, 150, 150] },
      { terrain: 'canyon', pts: [770, 120, 1000, 0, 1000, 700, 800, 700, 780, 540, 790, 260] },
      { terrain: 'swamp', pts: [330, 600, 800, 590, 800, 700, 330, 700] },
    ],
    water: [
      { closed: true, pts: [0, 0, 196, 0, 186, 118, 226, 236, 238, 440, 200, 520, 158, 620, 168, 700, 0, 700] },
      { pts: [640, 660, 700, 640, 740, 620], w: 4 },
      { pts: [990, 430, 970, 520, 940, 600, 900, 680], w: 6 },
      { pts: [400, 650, 470, 676, 560, 660, 640, 676], w: 5 },
    ],
    roads: [
      [500, 230, 500, 140], [500, 474, 500, 568], [378, 352, 214, 352], [622, 352, 796, 352],
      [414, 438, 290, 540], [534, 96, 608, 64], [404, 60, 392, 62], [290, 60, 284, 60], [866, 352, 880, 340],
    ],
    ranges: [
      { pts: [860, 20, 870, 110], s: 22, snow: true },
      { pts: [820, 560, 900, 600, 990, 640], s: 26 },
      { pts: [800, 690, 900, 690], s: 18 },
      { pts: [150, 130, 260, 140, 380, 128], s: 14, snow: true },
      { pts: [600, 120, 700, 115, 840, 128], s: 14, snow: true },
    ],
    forests: [
      [300, 590, 360, 600, 340, 700, 300, 690],
      [740, 540, 800, 520, 790, 600, 760, 590],
    ],
    marks: [
      ['tower', TX, TY - 10, 1], ['spire', 774, 46, 1.05], ['hut', 252, 46, .8], ['houses', 548, 44, .8], ['hut', 446, 40, .7],
      ['pinnacle', 52, 300, .8], ['dome', 112, 548, .8], ['barn', 206, 640, .9], ['palace', 604, 652, .9],
      ['temple', 718, 640, .9], ['ruin', 826, 186, 1], ['stonetower', 940, 100, 1.1], ['fortress', 120, 214, .7],
      ['shrine', 900, 270, .6],
    ],
  },
};
