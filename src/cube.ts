/* The item menu progress display: an original take on the pause-menu cube of each game, laid out the way the games
   lay out their pages, drawn with the app's own icons (src/menu-icons.ts) instead of the games' art. Each page is a grid of slots, and a
   slot lights up once the player has the item. */

export type Slot = {
  /** Item ids that fill this slot. Several ids means a chain (trade items), shown as the furthest one owned. */
  ids: string[];
  /** Short label for the slot. A chain shows its owned item's short label instead. */
  label: string;
  /** Full name, for the tooltip, when nothing in the chain is owned. */
  name: string;
  /** Show the owned count, for progressive items and upgrades. */
  count?: boolean;
  /** Always filled, like the starting tunic. */
  always?: boolean;
  /** Fills with one of this many items, for bottles. */
  bottle?: number;
};
export type Page = { id: string; name: string; cols: number; slots: Slot[] };

const s = (id: string, label: string, name: string, more: Partial<Slot> = {}): Slot => ({ ids: [id], label, name, ...more });
const chain = (ids: string[], label: string, name: string): Slot => ({ ids, label, name });

const OOT_CHILD_TRADE = ['OOT_WEIRD_EGG', 'OOT_CHICKEN', 'OOT_ZELDA_LETTER', 'OOT_MASK_KEATON', 'OOT_MASK_SKULL', 'OOT_MASK_SPOOKY', 'OOT_MASK_BUNNY', 'OOT_MASK_GORON', 'OOT_MASK_ZORA', 'OOT_MASK_GERUDO', 'OOT_MASK_TRUTH'];
const OOT_ADULT_TRADE = ['OOT_POCKET_EGG', 'OOT_POCKET_CUCCO', 'OOT_COJIRO', 'OOT_ODD_MUSHROOM', 'OOT_ODD_POTION', 'OOT_POACHER_SAW', 'OOT_BROKEN_GORON_SWORD', 'OOT_PRESCRIPTION', 'OOT_EYEBALL_FROG', 'OOT_EYE_DROPS', 'OOT_CLAIM_CHECK'];
const OOT_BOTTLES = ['OOT_BOTTLE_EMPTY', 'OOT_BOTTLE_MILK', 'OOT_BOTTLE_RUTO_LETTER', 'OOT_BOTTLE_BLUE_FIRE', 'OOT_BOTTLE_BUGS', 'OOT_BOTTLE_FISH', 'OOT_BOTTLE_POE', 'OOT_BOTTLE_BIG_POE', 'OOT_BOTTLE_FAIRY', 'OOT_BOTTLE_POTION_RED', 'OOT_BOTTLE_POTION_GREEN', 'OOT_BOTTLE_POTION_BLUE'];
const MM_BOTTLES = ['MM_BOTTLE_EMPTY', 'MM_BOTTLE_MILK', 'MM_BOTTLE_POTION_RED', 'MM_BOTTLED_GOLD_DUST', 'MM_BOTTLE_CHATEAU', 'MM_BOTTLE_FAIRY', 'MM_BOTTLE_POE', 'MM_BOTTLE_BIG_POE', 'MM_BOTTLE_ZORA_EGG', 'MM_BOTTLE_SPRING_WATER', 'MM_BOTTLE_HOT_SPRING_WATER', 'MM_BOTTLE_DEKU_PRINCESS', 'MM_BOTTLE_MUSHROOM', 'MM_BOTTLE_BUGS', 'MM_BOTTLE_FISH'];

export const SHORT: Record<string, string> = {
  OOT_WEIRD_EGG: 'Egg', OOT_CHICKEN: 'Cucco', OOT_ZELDA_LETTER: 'Letter', OOT_MASK_KEATON: 'Keaton', OOT_MASK_SKULL: 'Skull',
  OOT_MASK_SPOOKY: 'Spooky', OOT_MASK_BUNNY: 'Bunny', OOT_MASK_GORON: 'Goron', OOT_MASK_ZORA: 'Zora', OOT_MASK_GERUDO: 'Gerudo',
  OOT_MASK_TRUTH: 'Truth', OOT_POCKET_EGG: 'Egg', OOT_POCKET_CUCCO: 'Cucco', OOT_COJIRO: 'Cojiro', OOT_ODD_MUSHROOM: 'Shroom',
  OOT_ODD_POTION: 'Potion', OOT_POACHER_SAW: 'Saw', OOT_BROKEN_GORON_SWORD: 'Broken', OOT_PRESCRIPTION: 'Rx', OOT_EYEBALL_FROG: 'Frog',
  OOT_EYE_DROPS: 'Drops', OOT_CLAIM_CHECK: 'Claim', MM_MOON_TEAR: 'Tear', MM_DEED_LAND: 'Land', MM_DEED_SWAMP: 'Swamp',
  MM_DEED_MOUNTAIN: 'Mtn', MM_DEED_OCEAN: 'Ocean', MM_ROOM_KEY: 'Key', MM_LETTER_TO_MAMA: 'Mama', MM_LETTER_TO_KAFEI: 'Kafei',
  MM_PENDANT_OF_MEMORIES: 'Pendant',
};

export const PAGES: Record<'oot' | 'mm', Page[]> = {
  oot: [
    { id: 'items', name: 'Select item', cols: 6, slots: [
      s('OOT_STICK', 'Stick', 'Deku Stick'), s('OOT_NUTS_5', 'Nut', 'Deku Nuts'), s('OOT_BOMBS_5', 'Bomb', 'Bombs'),
      s('OOT_BOW', 'Bow', 'Fairy Bow'), s('OOT_ARROW_FIRE', 'Fire', 'Fire Arrows'), s('OOT_SPELL_FIRE', 'Din', "Din's Fire"),
      s('OOT_SLINGSHOT', 'Sling', 'Fairy Slingshot'), s('OOT_OCARINA', 'Ocarina', 'Ocarina', { count: true }), s('OOT_BOMBCHU_20', 'Chu', 'Bombchu'),
      s('OOT_HOOKSHOT', 'Hook', 'Hookshot', { count: true }), s('OOT_ARROW_ICE', 'Ice', 'Ice Arrows'), s('OOT_SPELL_WIND', 'Farore', "Farore's Wind"),
      s('OOT_BOOMERANG', 'Rang', 'Boomerang'), s('OOT_LENS', 'Lens', 'Lens of Truth'), s('OOT_MAGIC_BEAN', 'Beans', 'Magic Beans'),
      s('OOT_HAMMER', 'Hammer', 'Megaton Hammer'), s('OOT_ARROW_LIGHT', 'Light', 'Light Arrows'), s('OOT_SPELL_LOVE', 'Nayru', "Nayru's Love"),
      { ids: OOT_BOTTLES, label: 'Bottle', name: 'Bottle', bottle: 1 }, { ids: OOT_BOTTLES, label: 'Bottle', name: 'Bottle', bottle: 2 },
      { ids: OOT_BOTTLES, label: 'Bottle', name: 'Bottle', bottle: 3 }, { ids: OOT_BOTTLES, label: 'Bottle', name: 'Bottle', bottle: 4 },
      chain(OOT_CHILD_TRADE, 'Child', 'Child trade item'), chain(OOT_ADULT_TRADE, 'Adult', 'Adult trade item'),
    ] },
    { id: 'equip', name: 'Equipment', cols: 6, slots: [
      s('OOT_SWORD_KOKIRI', 'Kokiri', 'Kokiri Sword'), s('OOT_SWORD_MASTER', 'Master', 'Master Sword'), s('OOT_SWORD_GORON', 'Goron', 'Giant\'s Knife / Biggoron', { count: true }),
      s('OOT_SHIELD_DEKU', 'Deku', 'Deku Shield'), s('OOT_SHIELD_HYLIAN', 'Hylian', 'Hylian Shield'), s('OOT_SHIELD_MIRROR', 'Mirror', 'Mirror Shield'),
      s('OOT_TUNIC_KOKIRI', 'Kokiri', 'Kokiri Tunic', { always: true }), s('OOT_TUNIC_GORON', 'Goron', 'Goron Tunic'), s('OOT_TUNIC_ZORA', 'Zora', 'Zora Tunic'),
      s('OOT_BOOTS_KOKIRI', 'Boots', 'Kokiri Boots', { always: true }), s('OOT_BOOTS_IRON', 'Iron', 'Iron Boots'), s('OOT_BOOTS_HOVER', 'Hover', 'Hover Boots'),
      s('OOT_STRENGTH', 'Str', 'Strength', { count: true }), s('OOT_SCALE', 'Scale', 'Scale', { count: true }), s('OOT_WALLET', 'Wallet', 'Wallet', { count: true }),
      s('OOT_BOMB_BAG', 'Bag', 'Bomb Bag', { count: true }), s('OOT_MAGIC_UPGRADE', 'Magic', 'Magic', { count: true }), s('OOT_STICK_UPGRADE', 'Sticks+', 'Deku Stick Upgrade', { count: true }),
    ] },
    { id: 'quest', name: 'Quest status', cols: 6, slots: [
      s('OOT_MEDALLION_LIGHT', 'Light', 'Light Medallion'), s('OOT_MEDALLION_FOREST', 'Forest', 'Forest Medallion'), s('OOT_MEDALLION_FIRE', 'Fire', 'Fire Medallion'),
      s('OOT_MEDALLION_WATER', 'Water', 'Water Medallion'), s('OOT_MEDALLION_SPIRIT', 'Spirit', 'Spirit Medallion'), s('OOT_MEDALLION_SHADOW', 'Shadow', 'Shadow Medallion'),
      s('OOT_STONE_EMERALD', 'Emerald', "Kokiri's Emerald"), s('OOT_STONE_RUBY', 'Ruby', "Goron's Ruby"), s('OOT_STONE_SAPPHIRE', 'Sapph', "Zora's Sapphire"),
      s('OOT_STONE_OF_AGONY', 'Agony', 'Stone of Agony'), s('OOT_GERUDO_CARD', 'Card', "Gerudo's Card"), s('OOT_GS_TOKEN', 'Skull', 'Gold Skulltula Tokens', { count: true }),
      s('OOT_SONG_TP_FOREST', 'Minuet', 'Minuet of Forest'), s('OOT_SONG_TP_FIRE', 'Bolero', 'Bolero of Fire'), s('OOT_SONG_TP_WATER', 'Seren.', 'Serenade of Water'),
      s('OOT_SONG_TP_SPIRIT', 'Requiem', 'Requiem of Spirit'), s('OOT_SONG_TP_SHADOW', 'Noct.', 'Nocturne of Shadow'), s('OOT_SONG_TP_LIGHT', 'Prelude', 'Prelude of Light'),
      s('OOT_SONG_ZELDA', 'Zelda', "Zelda's Lullaby"), s('OOT_SONG_EPONA', 'Epona', "Epona's Song"), s('OOT_SONG_SARIA', 'Saria', "Saria's Song"),
      s('OOT_SONG_SUN', 'Sun', "Sun's Song"), s('OOT_SONG_TIME', 'Time', 'Song of Time'), s('OOT_SONG_STORMS', 'Storms', 'Song of Storms'),
    ] },
  ],
  mm: [
    { id: 'items', name: 'Select item', cols: 6, slots: [
      s('MM_OCARINA', 'Ocarina', 'Ocarina of Time'), s('MM_BOW', 'Bow', "Hero's Bow"), s('MM_ARROW_FIRE', 'Fire', 'Fire Arrows'),
      s('MM_ARROW_ICE', 'Ice', 'Ice Arrows'), s('MM_ARROW_LIGHT', 'Light', 'Light Arrows'), chain(['MM_MOON_TEAR', 'MM_DEED_LAND', 'MM_DEED_SWAMP', 'MM_DEED_MOUNTAIN', 'MM_DEED_OCEAN'], 'Trade', 'Moon\'s Tear and title deeds'),
      s('MM_BOMBS_10', 'Bomb', 'Bombs'), s('MM_BOMBCHU_10', 'Chu', 'Bombchu'), s('MM_STICK', 'Stick', 'Deku Stick'),
      s('MM_NUTS_10', 'Nut', 'Deku Nuts'), s('MM_MAGIC_BEAN', 'Beans', 'Magic Beans'), chain(['MM_ROOM_KEY', 'MM_LETTER_TO_MAMA'], 'Key', 'Room Key or Express Mail'),
      s('MM_POWDER_KEG', 'Keg', 'Powder Keg'), s('MM_PICTOGRAPH_BOX', 'Picto', 'Pictograph Box'), s('MM_LENS', 'Lens', 'Lens of Truth'),
      s('MM_HOOKSHOT', 'Hook', 'Hookshot'), s('MM_GREAT_FAIRY_SWORD', 'GFS', "Great Fairy's Sword"), chain(['MM_LETTER_TO_KAFEI', 'MM_PENDANT_OF_MEMORIES'], 'Letter', 'Letter to Kafei or Pendant'),
      ...[1, 2, 3, 4, 5, 6].map(n => ({ ids: MM_BOTTLES, label: 'Bottle', name: 'Bottle', bottle: n })),
    ] },
    { id: 'masks', name: 'Masks', cols: 6, slots: [
      s('MM_MASK_POSTMAN', 'Postman', "Postman's Hat"), s('MM_MASK_ALL_NIGHT', 'Night', 'All-Night Mask'), s('MM_MASK_BLAST', 'Blast', 'Blast Mask'),
      s('MM_MASK_STONE', 'Stone', 'Stone Mask'), s('MM_MASK_GREAT_FAIRY', 'Fairy', "Great Fairy's Mask"), s('MM_MASK_DEKU', 'Deku', 'Deku Mask'),
      s('MM_MASK_KEATON', 'Keaton', 'Keaton Mask'), s('MM_MASK_BREMEN', 'Bremen', 'Bremen Mask'), s('MM_MASK_BUNNY', 'Bunny', 'Bunny Hood'),
      s('MM_MASK_DON_GERO', 'Gero', "Don Gero's Mask"), s('MM_MASK_SCENTS', 'Scents', 'Mask of Scents'), s('MM_MASK_GORON', 'Goron', 'Goron Mask'),
      s('MM_MASK_ROMANI', 'Romani', "Romani's Mask"), s('MM_MASK_TROUPE_LEADER', 'Circus', "Circus Leader's Mask"), s('MM_MASK_KAFEI', 'Kafei', "Kafei's Mask"),
      s('MM_MASK_COUPLE', 'Couple', "Couple's Mask"), s('MM_MASK_TRUTH', 'Truth', 'Mask of Truth'), s('MM_MASK_ZORA', 'Zora', 'Zora Mask'),
      s('MM_MASK_KAMARO', 'Kamaro', "Kamaro's Mask"), s('MM_MASK_GIBDO', 'Gibdo', 'Gibdo Mask'), s('MM_MASK_GARO', 'Garo', "Garo's Mask"),
      s('MM_MASK_CAPTAIN', 'Captain', "Captain's Hat"), s('MM_MASK_GIANT', 'Giant', "Giant's Mask"), s('MM_MASK_FIERCE_DEITY', 'FD', "Fierce Deity's Mask"),
    ] },
    { id: 'quest', name: 'Quest status', cols: 6, slots: [
      s('MM_REMAINS_ODOLWA', 'Odolwa', "Odolwa's Remains"), s('MM_REMAINS_GOHT', 'Goht', "Goht's Remains"), s('MM_REMAINS_GYORG', 'Gyorg', "Gyorg's Remains"),
      s('MM_REMAINS_TWINMOLD', 'Twinm.', "Twinmold's Remains"), s('MM_SWORD', 'Sword', 'Sword', { count: true }), s('MM_SHIELD_MIRROR', 'Mirror', 'Mirror Shield'),
      s('MM_SONG_TIME', 'Time', 'Song of Time'), s('MM_SONG_HEALING', 'Healing', 'Song of Healing'), s('MM_SONG_EPONA', 'Epona', "Epona's Song"),
      s('MM_SONG_SOARING', 'Soaring', 'Song of Soaring'), s('MM_SONG_STORMS', 'Storms', 'Song of Storms'), s('MM_SONG_AWAKENING', 'Sonata', 'Sonata of Awakening'),
      s('MM_SONG_GORON_HALF', 'Lullaby', 'Goron Lullaby', { count: true }), s('MM_SONG_ZORA', 'Bossa', 'New Wave Bossa Nova'), s('MM_SONG_EMPTINESS', 'Elegy', 'Elegy of Emptiness'),
      s('MM_SONG_ORDER', 'Oath', 'Oath to Order'), s('MM_WALLET', 'Wallet', 'Wallet', { count: true }), s('MM_BOMB_BAG', 'Bag', 'Bomb Bag', { count: true }),
      s('MM_MAGIC_UPGRADE', 'Magic', 'Magic', { count: true }), s('MM_SPIN_UPGRADE', 'Spin', 'Spin Attack'), s('MM_GS_TOKEN_SWAMP', 'Sw.Skull', 'Swamp Skulltula Tokens', { count: true }),
      s('MM_GS_TOKEN_OCEAN', 'Oc.Skull', 'Ocean Skulltula Tokens', { count: true }), s('MM_STRAY_FAIRY_TOWN', 'Fairy', 'Stray Fairy (Clock Town)'), s('MM_SHIELD_HERO', 'Shield', "Hero's Shield"),
    ] },
  ],
};

/** Shared items use one id for both games. */
export const alt = (id: string) => 'SHARED_' + id.replace(/^(OOT|MM)_/, '');

export type SlotView = { on: boolean; label: string; name: string; n: number; icon: string };

/** What a slot shows, given how many of each item the player has. */
export function slotView(slot: Slot, count: (id: string) => number): SlotView {
  const n = (id: string) => count(id) || count(alt(id));
  if (slot.bottle) {
    const total = slot.ids.reduce((t, id) => t + n(id), 0);
    return { on: total >= slot.bottle, label: slot.label, name: slot.name, n: 0, icon: slot.ids[0] };
  }
  if (slot.ids.length > 1) {
    const got = [...slot.ids].reverse().find(id => n(id) > 0);
    return got ? { on: true, label: SHORT[got] ?? slot.label, name: got, n: 0, icon: got } : { on: false, label: slot.label, name: slot.name, n: 0, icon: slot.ids[0] };
  }
  const have = n(slot.ids[0]);
  return { on: slot.always || have > 0, label: slot.label, name: slot.name, n: slot.count && have > 1 ? have : 0, icon: slot.ids[0] };
}
