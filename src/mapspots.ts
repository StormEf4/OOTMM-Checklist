/**
 * The Map view's two drawn maps, Hyrule and Termina. Both are original drawings: each overworld area is a rough shape
 * placed where it sits in its game, so the layout is recognisable without copying either game's map art.
 *
 * Coordinates are on a 1000 x 700 board. An area with `pts` is drawn as a smoothed shape through those points; an area
 * without is a small place (a building, a room) shown as a marker. `at` is where its name sits. Players can move any
 * name in Edit mode or take it off the map, and areas a fork adds show up under "Not on the map" until they place them.
 */
export type Terrain = 'field' | 'forest' | 'woods' | 'desert' | 'sand' | 'rock' | 'volcano' | 'water' | 'town' | 'castle'
  | 'snow' | 'swamp' | 'canyon' | 'grave' | 'ranch' | 'temple' | 'coast' | 'moon';
export type MapArea = { at: [number, number]; pts?: number[]; terrain?: Terrain; sharp?: boolean };
export type WorldMap = {
  /** Areas by OoTMM region id. */
  areas: Record<string, MapArea>;
  /** Sea, lakes and rivers drawn under the areas: closed shapes and open lines (width). */
  water: { pts: number[]; closed?: boolean; w?: number }[];
  /** Paths between places, drawn dashed. */
  roads: number[][];
  /** Decoration: mountain peaks, tree clumps and so on, scattered where nothing else is. */
  peaks: [number, number, number][];
  trees: [number, number, number][];
  dunes: [number, number][];
};

export const MAP_W = 1000;
export const MAP_H = 700;

/* Clock Town is drawn as a round town split into four districts. */
const town = (cx: number, cy: number, r: number, from: number, to: number) => {
  const pts: number[] = [cx, cy];
  for (let a = from; a <= to + 0.01; a += (to - from) / 8) pts.push(Math.round(cx + Math.cos(a * Math.PI / 180) * r), Math.round(cy + Math.sin(a * Math.PI / 180) * r));
  return pts;
};
const TX = 500, TY = 352, TR = 134;

export const WORLD: Record<'oot' | 'mm', WorldMap> = {
  oot: {
    areas: {
      OOT_HYRULE_FIELD: { at: [452, 250], terrain: 'field', pts: [395, 205, 500, 178, 625, 182, 722, 214, 752, 292, 742, 388, 700, 470, 612, 528, 500, 540, 420, 500, 382, 420, 372, 302] },
      OOT_LON_LON_RANCH: { at: [568, 362], terrain: 'ranch', pts: [515, 322, 568, 300, 622, 318, 636, 372, 602, 414, 545, 416, 508, 380] },
      OOT_SACRED_REALM: { at: [386, 188] },
      OOT_TEMPLE_OF_TIME: { at: [420, 124], terrain: 'temple', pts: [380, 102, 448, 90, 458, 148, 392, 160] },
      OOT_MARKET: { at: [524, 126], terrain: 'town', pts: [472, 98, 550, 86, 588, 112, 576, 160, 498, 168, 466, 136] },
      OOT_HYRULE_CASTLE: { at: [508, 40], terrain: 'castle', pts: [470, 14, 558, 6, 576, 72, 484, 80] },
      OOT_GANON_CASTLE_EXTERIOR: { at: [640, 46], terrain: 'volcano', pts: [592, 12, 668, 18, 672, 76, 598, 80] },
      OOT_GORON_CITY: { at: [710, 104], terrain: 'rock', pts: [668, 64, 742, 56, 758, 128, 690, 142, 660, 106] },
      OOT_DEATH_MOUNTAIN_CRATER: { at: [832, 40], terrain: 'volcano', pts: [772, 8, 878, 10, 892, 68, 790, 78] },
      OOT_DEATH_MOUNTAIN_TRAIL: { at: [832, 146], terrain: 'rock', pts: [772, 96, 880, 86, 896, 190, 802, 198, 766, 150] },
      OOT_ZORA_FOUNTAIN: { at: [950, 66], terrain: 'water', pts: [908, 18, 990, 24, 994, 118, 914, 124] },
      OOT_ZORA_DOMAIN: { at: [952, 182], terrain: 'water', pts: [910, 140, 992, 136, 995, 226, 918, 230] },
      OOT_KAKARIKO: { at: [806, 256], terrain: 'town', pts: [766, 212, 846, 206, 862, 256, 846, 304, 786, 312, 758, 262] },
      OOT_GRAVEYARD: { at: [910, 272], terrain: 'grave', pts: [872, 242, 936, 240, 946, 302, 882, 310] },
      OOT_ZORA_RIVER: { at: [868, 350], terrain: 'coast', pts: [762, 326, 852, 320, 932, 298, 954, 244, 995, 238, 995, 322, 952, 366, 862, 378, 762, 378] },
      OOT_LOST_WOODS: { at: [826, 458], terrain: 'woods', pts: [760, 402, 850, 394, 904, 422, 900, 506, 830, 526, 760, 506, 746, 450] },
      OOT_SACRED_MEADOW: { at: [954, 446], terrain: 'forest', pts: [914, 396, 990, 392, 995, 492, 922, 502] },
      OOT_KOKIRI_FOREST: { at: [874, 612], terrain: 'forest', pts: [772, 542, 880, 532, 975, 552, 990, 642, 920, 690, 800, 688, 760, 620] },
      OOT_LAKE_HYLIA: { at: [338, 616], terrain: 'water', pts: [262, 546, 380, 540, 440, 576, 452, 642, 400, 690, 290, 692, 236, 640] },
      OOT_GERUDO_VALLEY: { at: [330, 386], terrain: 'canyon', pts: [292, 330, 368, 318, 390, 380, 372, 442, 300, 450, 280, 390] },
      OOT_GERUDO_FORTRESS: { at: [230, 366], terrain: 'sand', pts: [186, 280, 274, 270, 284, 330, 280, 422, 196, 430, 176, 350] },
      OOT_HAUNTED_WASTELAND: { at: [118, 290], terrain: 'desert', pts: [86, 180, 168, 170, 174, 300, 168, 472, 92, 500, 70, 330] },
      OOT_DESERT_COLOSSUS: { at: [68, 98], terrain: 'desert', pts: [6, 42, 120, 36, 140, 150, 70, 166, 6, 152] },
    },
    water: [
      { pts: [330, 448, 334, 500, 318, 548], w: 7 },
      { pts: [762, 352, 860, 350, 940, 318, 972, 236], w: 7 },
      { pts: [762, 352, 700, 372, 640, 430, 560, 470, 470, 470, 420, 520, 360, 560], w: 5 },
      { pts: [458, 96, 470, 180, 590, 176, 596, 96], w: 4 },
    ],
    roads: [
      [524, 168, 520, 230, 540, 300],
      [622, 318, 700, 280, 758, 262],
      [508, 380, 440, 400, 382, 400],
      [600, 414, 660, 470, 750, 470],
      [500, 540, 470, 560, 430, 580],
      [688, 140, 720, 180, 766, 200],
    ],
    peaks: [
      [200, 60, 34], [250, 110, 28], [300, 52, 30], [190, 160, 24], [340, 140, 22], [356, 60, 20], [256, 30, 18],
      [640, 140, 20], [612, 104, 14], [36, 560, 28], [100, 610, 32], [160, 660, 26], [180, 560, 22],

    ],
    trees: [
      [520, 600, 16], [580, 620, 18], [640, 600, 14], [690, 650, 16], [560, 670, 14], [470, 670, 12], [640, 670, 12], [700, 560, 12],
      [728, 600, 10],
    ],
    dunes: [[30, 240], [40, 300], [24, 420], [50, 470], [140, 520], [200, 470], [110, 210], [150, 250]],
  },
  mm: {
    areas: {
      MM_TERMINA_FIELD: { at: [318, 236], terrain: 'field', pts: [500, 132, 640, 150, 744, 216, 790, 330, 760, 450, 660, 540, 500, 566, 340, 540, 238, 452, 208, 330, 256, 216, 360, 150] },
      MM_CLOCK_TOWN_NORTH: { at: [TX - 30, TY - 96], terrain: 'town', sharp: true, pts: town(TX, TY, TR, 225, 315) },
      MM_CLOCK_TOWN_EAST: { at: [TX + 86, TY - 6], terrain: 'town', sharp: true, pts: town(TX, TY, TR, -45, 45) },
      MM_CLOCK_TOWN_SOUTH: { at: [TX - 30, TY + 98], terrain: 'town', sharp: true, pts: town(TX, TY, TR, 45, 135) },
      MM_CLOCK_TOWN_WEST: { at: [TX - 86, TY - 6], terrain: 'town', sharp: true, pts: town(TX, TY, TR, 135, 225) },
      MM_CLOCK_TOWER_ROOFTOP: { at: [TX, TY + 34] },
      MM_STOCK_POT_INN: { at: [TX + 70, TY - 70] },
      MM_LAUNDRY_POOL: { at: [TX + 70, TY + 80] },
      MM_PATH_TO_MOUNTAIN_VILLAGE: { at: [500, 128], terrain: 'snow', pts: [470, 92, 530, 92, 534, 140, 466, 140] },
      MM_MOUNTAIN_VILLAGE: { at: [500, 52], terrain: 'snow', pts: [410, 14, 590, 12, 600, 84, 520, 92, 480, 92, 404, 82] },
      MM_TWIN_ISLANDS: { at: [338, 66], terrain: 'snow', pts: [290, 20, 392, 16, 398, 108, 296, 118] },
      MM_GORON_VILLAGE: { at: [226, 54], terrain: 'snow', pts: [178, 12, 278, 10, 284, 100, 184, 106] },
      MM_GORON_RACETRACK: { at: [216, 132] },
      MM_PATH_TO_SNOWHEAD: { at: [656, 60], terrain: 'snow', pts: [608, 22, 700, 18, 706, 100, 612, 106] },
      MM_SNOWHEAD: { at: [770, 52], terrain: 'snow', pts: [718, 8, 830, 6, 836, 98, 722, 104] },
      MM_PIRATE_FORTRESS_EXTERIOR: { at: [86, 100], terrain: 'castle', pts: [18, 70, 150, 64, 156, 228, 22, 234] },
      MM_PIRATE_FORTRESS_INTERIOR: { at: [86, 148] },
      MM_PIRATE_FORTRESS_SEWERS: { at: [86, 196] },
      MM_PINNACLE_ROCK: { at: [50, 330] },
      MM_GREAT_BAY_COAST: { at: [150, 360], terrain: 'coast', pts: [112, 248, 196, 238, 210, 340, 222, 440, 120, 458, 96, 350] },
      MM_SPIDER_HOUSE_OCEAN: { at: [166, 262] },
      MM_ZORA_CAPE: { at: [80, 494], terrain: 'coast', pts: [24, 460, 134, 470, 150, 572, 96, 616, 26, 604] },
      MM_ZORA_HALL: { at: [80, 562] },
      MM_MILK_ROAD: { at: [254, 560], terrain: 'field', pts: [220, 520, 286, 528, 292, 588, 222, 590] },
      MM_ROMANI_RANCH: { at: [236, 646], terrain: 'ranch', pts: [170, 606, 290, 604, 318, 676, 230, 696, 160, 676] },
      MM_ROAD_TO_SWAMP: { at: [500, 596], terrain: 'swamp', pts: [470, 568, 532, 568, 536, 620, 466, 620] },
      MM_SOUTHERN_SWAMP: { at: [486, 654], terrain: 'swamp', pts: [370, 628, 500, 622, 640, 628, 650, 694, 380, 696] },
      MM_DEKU_PALACE: { at: [606, 680] },
      MM_SPIDER_HOUSE_SWAMP: { at: [394, 680] },
      MM_WOODFALL: { at: [714, 650], terrain: 'woods', pts: [664, 606, 760, 600, 780, 684, 670, 694] },
      MM_ROAD_TO_IKANA: { at: [830, 352], terrain: 'canyon', pts: [796, 326, 866, 322, 870, 380, 800, 382] },
      MM_IKANA_GRAVEYARD: { at: [858, 468], terrain: 'grave', pts: [800, 420, 910, 414, 922, 512, 812, 522] },
      MM_IKANA_CANYON: { at: [940, 322], terrain: 'canyon', pts: [880, 240, 994, 236, 996, 420, 920, 424, 878, 360] },
      MM_BENEATH_THE_WELL: { at: [944, 390] },
      MM_SECRET_SHRINE: { at: [946, 262] },
      MM_IKANA_CASTLE: { at: [826, 196], terrain: 'grave', pts: [776, 156, 870, 150, 876, 232, 782, 240] },
      MM_MOON: { at: [690, 196], terrain: 'moon', pts: [690, 168, 712, 176, 720, 196, 712, 216, 690, 224, 668, 216, 660, 196, 668, 176] },
      MM_STONE_TOWER: { at: [930, 112], terrain: 'canyon', pts: [880, 30, 994, 26, 996, 220, 884, 224] },
    },
    water: [
      { closed: true, pts: [0, 0, 196, 0, 186, 118, 226, 236, 238, 440, 200, 520, 158, 620, 168, 700, 0, 700] },
      { pts: [640, 660, 700, 640, 740, 620], w: 4 },
      { pts: [990, 430, 970, 520, 940, 600, 900, 680], w: 6 },
    ],
    roads: [
      [500, 230, 500, 140], [500, 474, 500, 568], [378, 352, 214, 352], [622, 352, 796, 352],
      [414, 438, 290, 540], [534, 96, 608, 64], [404, 60, 392, 62], [290, 60, 284, 60], [866, 352, 880, 340],
    ],
    peaks: [
      [930, 640, 26], [840, 680, 18],
    ],
    trees: [
      [330, 600, 14], [350, 660, 12], [800, 560, 16], [760, 540, 12], [820, 600, 14],
    ],
    dunes: [[860, 280], [960, 470], [990, 180]],
  },
};
