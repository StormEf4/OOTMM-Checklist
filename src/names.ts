/* Check names in three styles: OoTMM's own, the way players tend to say them, and the player's own renames.
   Player names are made from OoTMM's names by the word swaps below, plus a few checks that players know by a
   nickname. They only change the wording, never which checks exist. */

export type NameStyle = 'original' | 'player' | 'custom';
export const NAME_STYLES: [NameStyle, string][] = [['original', 'OoTMM names'], ['player', 'Player names'], ['custom', 'Your names']];

/** Checks players know by a nickname. Keyed by OoTMM's location name, so a missing one shows up in tests. */
export const NICKNAMES: Record<string, string> = {
  'OOT Sacred Meadow Sheik Song': 'Sheik in Forest',
  'OOT Temple of Time Sheik Song': 'Sheik at Temple',
  'OOT Death Mountain Crater Sheik Song': 'Sheik in Crater',
  'OOT Ice Cavern Sheik Song': 'Sheik in Ice Cavern',
  'OOT Desert Colossus Song Spirit': 'Sheik at Colossus',
  'OOT Kakariko Song Shadow': 'Sheik in Kakariko',
  'OOT Darunia': "Darunia's Joy",
  'OOT Lost Woods Target': 'Slingshot Target',
  'OOT Lake Hylia Fire Arrow': 'Shoot the Sun',
  'OOT Lake Hylia Underwater Bottle': "Ruto's Letter",
  'OOT Laboratory Dive': 'Lab Dive',
  'OOT Kakariko Anju Bottle': "Anju's Cuccos",
  'MM Clock Town Keaton HP': 'Keaton Quiz',
  'MM Stock Pot Inn ??? HP': 'Toilet Hand',
};

/** Word swaps, in order. Each turns OoTMM's short codes into what players say. */
const SWAPS: [RegExp, string][] = [
  [/\bBoss (HC|Container)\b/g, 'Boss Heart'],
  [/\bHC\b/g, 'Heart Container'],
  [/\bHP\b/g, 'Heart Piece'],
  [/\bGS\b/g, 'Skull'],
  [/\bSR\b/g, 'Silver Rupee'],
  [/\bSF\b/g, 'Stray Fairy'],
  [/\bWonder Item\b/g, 'Wonder Spot'],
  [/\bGossip Big Fairy\b/g, 'Gossip Stone Big Fairy'],
  [/\bGossip Fairy\b/g, 'Gossip Stone Fairy'],
  [/\bPre-Boss\b/g, 'Before Boss'],
  [/\b3F\b/g, '3rd Floor'],
  [/\bNE\b/g, 'Northeast'],
  [/\bDampe\b/g, 'Dampé'],
  [/\bZeldas\b/g, "Zelda's"],
  [/\bEponas\b/g, "Epona's"],
  [/\bSarias\b/g, "Saria's"],
  [/\bSuns\b/g, "Sun's"],
  [/\b0(\d)\b/g, '$1'],
];

/** The player-style name of a check, from its OoTMM id and the name the list shows for it. */
export function playerName(id: string, name: string): string {
  const nick = NICKNAMES[id];
  if (nick) return nick;
  let out = name;
  for (const [re, to] of SWAPS) out = out.replace(re, to);
  return out;
}
