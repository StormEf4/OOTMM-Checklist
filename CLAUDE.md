# OoTMM Checklist

A checklist and entrance log for the OoTMM randomizer. One codebase builds the Windows app, the phone web app and
a hosted page. This repository is the source of truth: start all work here, from an up-to-date `main`.

## Rules that must stay true

- The checklist comes from OoTMM's own code. Never hand-copy check or settings rules.
- The Entrances tab is filled in by the player. Never run a real shuffle, and never read destinations from a spoiler
  log. The spoiler importer stops before the log's Entrances section. The one exception (owner, Nov 20 2026): with
  App Settings > Game tracking > Entrances on (off by default), the Windows app logs a door the moment the game says the
  player walked through it. Only that door and where it led; never any door not yet used, never the game's entrance
  table, and never over a door the player already logged.
- The Windows app's memory reader (App Settings > Game tracking > Memory reader, off by default) reads only each
  game's name tag and OoTMM's grotto number (gGrottoData), never OoTMM's entrance table or anything else. It only reads.
- Reachable checks use only the items and entrances the player logged. An unlogged shuffled entrance stays closed.
  Hints and found items are typed or picked by the player, never read from a spoiler log.
- In Edit mode, everything is editable. The Edit mode button is the only exception: keep `data-locked` on it.
- New screens and controls must work with Edit mode. Text is editable automatically. Always-working controls need the
  `keep` class, and list items need a `data-edit` target.
- The default theme is Hero of Time. Themes are dark, plus one light option.
- Older saves and transfer codes keep loading. Add a migration in `load()` when the saved data changes shape.

## Setup

The build needs an OoTMM source tree. It isn't in this repository.

```
git clone --depth 1 --branch v33.0 https://github.com/OoTMM/OoTMM.git ../OoTMM-v33
npm install
export OOTMM_SRC=../OoTMM-v33
npm run build
```

The owner plays on a personal fork built from v33. Point `OOTMM_SRC` at the fork when they provide it. Run
`node tools/audit.mjs` after any randomizer source change; `npm run build` includes it.

If npm is blocked, `tools/paths.mjs` also looks in `/opt/npm-tools`. Run the steps of `npm run build` directly with
`node tools/<step>.mjs`.

## Where things are

- `src/engine/`: runs OoTMM's pipeline, entrance pools and spoiler header reading
- `src/engine/logic.ts`: reachable checks, the item list, age tags, "opens with" and pre-completed dungeons, from
  OoTMM's pathfinder and solver code. It runs in its own worker
- `src/mapspots.ts`: the Map view's drawn Hyrule and Termina maps (area shapes, terrain, where names sit). `src/worldmap.ts` draws them as SVG. The art is original; never copy the games' map images
- `src/main.ts`: the app and Edit mode
- `src/textlayer.ts`: makes any on-screen text editable
- `src/skins.ts`: themes
- `src/hearts.ts`: the heart container display's maths (3 hearts to start, 20 at most, Heart Pieces as quarters on the
  next empty heart). It follows OoTMM's `sharedHealth` setting: one shared meter when on, a switch between the OoT and
  MM hearts when off
- `src/menu-icons.ts`: the item menu's drawn icons. `src/icon-store.ts`: icons the player swaps in through Edit mode, kept on their device (Windows: an `icons` folder beside the saved data, through `desktop/preload.js`; browsers: IndexedDB), never in this repository
- `src/notes.ts`: the Notes tab's cleaning of formatted notes. `src/live.ts`: Coop live play merging. `src/firebase.ts`:
  Coop's server outside the hosted page, set by `firebase-config.json`, with rules in `firestore.rules`
- `src/gamefeed.ts`: game tracking in the Windows app. It listens to the OoTMM Client's local feed
  (`127.0.0.1:39278`), never the emulator's own pipe, so co-op keeps working. Entrance messages are used only when the
  player turns on entrance logging; `src/entrance-feed.ts` works out which door it was (grottos and a few doors share a
  name, so it uses the place the player was in; when more than one fits, or for warp songs and soaring, which name no
  door, the app asks the player which way they came, a grotto only after they leave it). Item names map to the checklist through OoTMM's own `gi()` (`giItems` in `logic.ts`)
- `src/savefile.ts`: game tracking's catch-up. It reads which checks the game's save file (Project64-EM's `.fla`) says
  are collected, mirroring OoTMM's `Mark_GetOot`/`Mark_GetMm` in `mark.c`. Where things sit in the file is in
  `src/generated/save-layout.json`, made by `node tools/save-layout.mjs` from OoTMM's own C headers (needs
  `mips-linux-gnu-gcc` and OoTMM's `scripts/deps.sh`). The build turns catch-up off, with a warning, when the OoTMM
  source changed since; rerun the tool then. `node tools/savefile-test.mjs` checks the reader
- `desktop/memreader.js`: the memory reader. It finds Project64-EM, finds the game's memory in it, and watches the
  grotto number so plain grottos (which the game reports by one shared name) can be told apart; `src/grotto-memory.ts`
  turns those numbers into a door. Where they sit is `src/generated/ram-layout.json`, made by `node tools/ram-layout.mjs`
  from OoTMM's link files, headers and `Play_EntranceForOverride` (needs `mips-linux-gnu-gcc` like save-layout). The
  build leaves the reader off, with a warning, when the OoTMM source changed since. It calls Windows through koffi,
  which `tools/package-windows.mjs` adds to the installer. `node tools/memreader-test.cjs` and
  `node tools/grotto-memory-test.mjs` check it
- `desktop/`: the Windows window (Electron)
- `tools/`: build, tests and packaging
- `dist/web/`: the built phone site, and `dist/desktop/`: the built Windows app files. Both are committed

## Checking work

- `npm run verify`: compares the checklist with OoTMM's `locationList()` on random settings. Runs where OoTMM reports
  `Expression is not allowed at runtime` are combinations OoTMM refuses, not list errors.
- `node tools/seed-test.mjs` and `node tools/er-test.mjs`: compare against real seeds from the full solver.
- `node tools/logic-test.mjs`: reachable checks must match OoTMM's own pathfinder on solved seeds. `LOGIC_FUZZ=n` adds random
  settings. Random settings that OoTMM can't generate are skipped and can take minutes each.
- Full sweeps, slow, split with `SHARD=i/n` across processes:
  - `node tools/toggle-test.mjs` checks every value of every setting against `locationList()`. It takes about 35 minutes over 3 shards.
  - `LOGIC_SWEEP=1 node tools/logic-test.mjs` checks the same values against OoTMM's pathfinder on real seeds. It takes
    about an hour over 3 shards. `LOGIC_RETRY=<file of case names>` retries skipped cases with looser placement rules.
  - `node tools/ui-toggles-data.mjs`, then `tools/ui-toggles.cjs`, uses every settings control in the browser.
- Random shop prices are expected to differ in the logic sweep: the app counts shops at their normal price.
- `tools/ui-flows.cjs`, `tools/ui-entrances.cjs`, `tools/ui-edit.cjs`, `tools/ui-test.cjs`, `tools/ui-logic.cjs`, `tools/ui-settings.cjs`, `tools/ui-names.cjs`, `tools/ui-notes.cjs`, `tools/ui-live.cjs`, `tools/ui-coop.cjs`, `tools/ui-icons.cjs`, `tools/ui-gamefeed.cjs`, `tools/ui-gamefeed-entrances.cjs`, `tools/ui-gamefeed-memory.cjs`, `tools/ui-souls.cjs`, `tools/ui-seg.cjs`, `tools/ui-roads.cjs`, `tools/ui-typing.cjs`, `tools/ui-hearts.cjs`, `tools/ui-shared.cjs`: browser tests. Run with
  `NODE_PATH=$(npm root -g) node <file>`. `ui-flows` and `ui-entrances` read spoiler logs from `.cache/`. Create them
  with `tools/dump-spoiler-entry.ts` and `tools/er-test.mjs`.

## Releasing

1. Run the tests, then `npm run build`, and commit `dist/web` and `dist/desktop`.
2. When `dist/desktop` changes on `main`, the `Windows installer` workflow builds the installer and publishes it as the
   newest GitHub Release. The installer is over GitHub's 100 MB file limit, so never commit it. To build it locally,
   run `npm run package:win`.
3. The `Firebase site` workflow publishes `dist/web` and `firestore.rules` to Firebase on changes to main, once the
   `FIREBASE_SERVICE_ACCOUNT` secret and `firebase-config.json` are set.
4. Note in the release which things weren't tested. The installer hasn't been run on real Windows or a real phone
   unless the owner has confirmed it.
5. Don't republish the Claude hosted page (https://claude.ai/artifact/9mUJwKrCFE88AprUDRHoe1). Since Nov 17, 2026 the
   owner supports only the Windows app and the phone site. The build still writes `dist/artifact/`, but nothing ships it.
