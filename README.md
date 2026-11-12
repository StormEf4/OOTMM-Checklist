# OoTMM Checklist

A checklist for the OoTMM combo randomizer that shows only the checks your settings put on a seed.
One codebase builds the Windows app and the phone web app.

The checklist runs OoTMM's own world code, the same steps as its internal `locationList()`: every location
in the built world, minus the ones locked to their vanilla item. The app doesn't keep its own copy of the
rules, so a rebuild picks up changes in the randomizer.

## Reachable checks, items, hints and the map

- **In logic.** Checks you can get right now are marked with a gold dot, and each area shows how many. The **In logic**
  button hides the rest. It uses OoTMM's own logic and pathfinder with two things you give it: the items on the
  **Items** tab, and the entrances you've logged. A shuffled entrance you haven't logged counts as closed, so nothing
  about your seed's layout is worked out for you. Random shop prices can't be known, so shops count at their normal price.
  Turn it off on the Items tab.
- **What opens a check.** Once both ages can get something, OoT checks only one age can get right now are tagged Child or
  Adult. A check out of logic says which missing item would put it in logic on its own, and the Items tab lists the
  **Best items to find next**. Checks that need two new items together don't get a hint.
- **Settings OoTMM rolls per seed.** When a setting such as Ganon's trials, key rings, open dungeons or Master Quest is
  random, Settings asks what came up. Opening your spoiler log fills it in from the header. Until you answer, Ganon's
  trials count as all on and the rest as off. A random starting age works the same way: until you pick Child or Adult,
  logic only counts checks you could reach with either.
- **Rolled item pools.** With bottle contents or pond fish shuffled, each seed rolls which ones exist. The Items tab
  offers every one the roll could give, so you can log what you found.
- **Every OoTMM setting.** Settings lists OoTMM's whole settings list, plus its Tricks, Glitches, Special conditions,
  Starting items and Junk locations. A settings string fills all of them in, and each can be changed by hand.
- **Pre-completed dungeons.** Pick the dungeons your seed started as beaten on the Settings tab, or open your spoiler log.
  Their areas are skipped, and logic counts what OoTMM gives you for them: cleared region states, boss souls and keys.
- **Items.** Tap an item to add one. The list comes from your settings. The bag button on any check logs what you found
  there, marks the check done and counts the item. Item hints and found items show on the check.
- **Hints.** Every gossip stone on your settings, ready for you to type what it said. A hint marked Path or Foolish
  (or worded that way) tags its area in the list and on the map. **Add a hint** covers anything that isn't a stone.
- **Map.** Switch the Checks tab to Map for a sketch of Hyrule and Termina with each area's progress. Gold areas have
  checks in logic. In Edit mode, tap an area to move it.

## Check names

**Settings > Your edits > Check names** has a three-way slider:

- **OoTMM names**: the names from OoTMM and its spoiler log.
- **Player names**: everyday wording made from OoTMM's names (Skull for GS, Heart Piece for HP, Silver Rupee for SR)
  plus a few nicknames such as Sheik in Crater and Toilet Hand. The rules are in `src/names.ts`.
- **Your names**: your renames on top of whichever of the other two you picked last.

Rename a check by long-pressing it (right-click on a computer), in Edit mode, or by typing in the rename list. Renaming
while on OoTMM or player names switches to Your names so the rename shows. The other two settings hide your names but
keep them. Search finds a check by any of its names. **Share or move your names** copies them as `check = name` lines
and adds a pasted list without removing the names you have.

Saving happens on every change and again when the app closes or goes to the background. The browser is asked to keep
the site's storage, and the Windows app writes to disk before it quits. A transfer code adds its edits to the ones on
the device instead of replacing them.

## Edit mode

Press **Edit mode** and anything in the app can be changed. Press it again to finish. The button itself is the
one thing that can't be edited.

- Tap any words to reword or hide them. The change applies everywhere that wording appears.
- Tap a check, entrance or area to rename, move, reorder, hide or add notes.
- Tabs and areas keep working, so use their pencil to edit them.
- Tap empty background for colors, fonts, check mark shape and pattern.
- Add your own checks, entrances and areas. A custom check can be limited to a setting value.

Numbers in text show as `{1}`, `{2}`, so live counts keep working in your wording. Hidden things stay visible
but dimmed while Edit mode is on, so they can always be restored. **Settings > Your edits** lists every change.
Edits apply to all seeds, except notes, which belong to one seed. Transfer codes and backup files carry them.

The code is in `src/textlayer.ts` (any on-screen text) and the Windows and Edit mode sections of `src/main.ts`.
Themes live in `src/skins.ts`. Add an entry to `SKINS` and it appears in Settings.

## Adding your fork

Most fork changes come through automatically, because settings and checks are read from the OoTMM source.

Point the build at your fork, then build:

```
npm install
set OOTMM_SRC=C:\path\to\your\OoTMM-fork
npm run build
npm run verify
npm run package:win
```

In PowerShell, use `$env:OOTMM_SRC="C:\path\to\your\OoTMM-fork"`. In WSL or Linux, use `export OOTMM_SRC=/path/to/fork`.
The first build spends about 15 minutes working out which settings change checks or entrances, trying every value
of each setting on its own and alongside other shuffles. That result is cached until the
randomizer source changes. Run `npm run verify` from the same shell; `FUZZ_N=50` sets how many random settings it tries.

What each kind of fork change needs:

| You added | What to do |
| --- | --- |
| A setting in `packages/core/src/settings/data.ts` | Nothing. It appears in Settings. |
| A check in `data/checks/**.xml` and `data/world/**` | Nothing. It appears on the list. |
| Rules in `packages/logic/src/world/transform.ts` or `misc/fixer.ts` | Nothing. The app runs that code. |
| Entrances, entrance types or `er*` settings | Nothing for most changes. The Entrances tab reads OoTMM's own pool code. A new entrance type shows a plain name until you add it to `entranceKind` in `src/engine/entrances.ts`. |
| A new check type | Add its name to `TYPE_NAMES` and `TYPE_ONE` in `src/main.ts`. Until then it shows its raw type name. |
| A new settings category | Optional: add a nicer name to `CATEGORY_NAMES` in `src/main.ts`. |
| Tricks, glitches, special conditions | Nothing. They come from OoTMM's `TRICKS` and `SPECIAL_CONDS` tables. |
| Something with no data in the source | Add it to `custom-checks.json`, or use Seeds > Your own checks in the app. |

`custom-checks.json` entries look like this. `when` is optional and limits a check to certain settings:

```json
{
  "checks": [
    { "id": "my-check-1", "name": "Hidden Grotto Chest", "region": "Kokiri Forest", "game": "oot", "when": { "myNewSetting": true } }
  ]
}
```

Transfer codes only work between devices running the same build, because they're tied to the list of
locations. After rebuilding for your fork, update the Windows app and the phone version together.

The build reaches OoTMM's private `WorldShuffler`, `LogicPassEntrances` and `LogicPassSolver` classes, and the
`normalDungeons` function, through a small plugin in `tools/paths.mjs`. If you rename those, the solver's
`preCompleteDungeons` method, the pathfinder's `evalExpr` method, or the `placePools`, `poolEntrancesForTypes`, `isAssignableConstraints`,
`reverseEntrance`, `changedWorld`, `placeSingle` or `processRegions` methods, update `src/engine/entrances.ts` and
`src/engine/logic.ts` to match. The build stops with a clear message if a class is gone.

New items from a fork appear on the Items tab by themselves. Their section comes from `itemGroup` in
`src/engine/logic.ts`, and anything it doesn't recognize goes under Equipment. New overworld areas show on the map
under "Not placed on the map" until you add them to `src/mapspots.ts` or move them in Edit mode.
`node tools/logic-test.mjs` checks reachable checks against OoTMM's own pathfinder on real seeds. `LOGIC_FUZZ=10` adds
ten random settings, and `LOGIC_CASE=word` runs only the cases whose name has that word.

`npm run verify` compares the checklist with OoTMM's own `locationList()` on random settings. Run it after
changing anything in `src/engine`. If your fork makes a setting change a check's existence through an access
rule rather than through the world data, verify will report it, and you can remove the
`enableFastMode()` calls in `src/main.ts` at the cost of slower updates.

## Project layout

- `src/engine/` runs OoTMM's pipeline and logic, and reads spoiler log headers
- `src/main.ts`, `src/style.css`, `src/skins.ts`, `src/textlayer.ts` are the app, shared by PC and phone
- `desktop/` is the Windows window wrapper (Electron)
- `tools/` holds the build, audit, verify and packaging scripts
- `dist/web/` is the phone version, ready for any static host
- `dist/OoTMM-Checklist-Setup.exe` is the Windows installer

## Putting the phone version online

`dist/web` is a plain static site, and it works offline after the first visit. Upload that folder's contents
to any HTTPS host. GitHub Pages works: make a repository, add the files, and turn on Pages in the repository
settings. Then add it to your Home Screen from Safari or Chrome.

## Packaging notes

The installer is about 104 MB, which is over GitHub's 100 MB file limit, so it's attached to each GitHub Release
instead of stored in the repository. Download it from Releases, or build it with `npm run package:win`.


`npm run package:win` needs `unzip` and the NSIS compiler. On Linux, the `nsis-bundle` from
electron-builder-binaries goes in `.cache/pack/nsis`. On Windows, install NSIS and set `MAKENSIS` to
`makensis.exe` and `NSIS_HOME` to the NSIS folder.

The installer isn't code-signed, so Windows SmartScreen warns on first run. The installed `.exe` file keeps
Electron's default file icon; the shortcuts, the window and the taskbar use the app's icon.

## Credits

License details are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


Built on [OoTMM](https://github.com/OoTMM/OoTMM) by Nax and contributors (MIT license). Typefaces: Almendra and
Alegreya Sans, Cinzel Decorative, Marcellus, Metamorphous and Pirata One (SIL Open Font License). Fan-made and not affiliated with Nintendo.
