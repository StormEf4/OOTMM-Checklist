# OoTMM Checklist

A checklist and entrance log for the OoTMM randomizer. One codebase builds the Windows app, the phone web app and
a hosted page. This repository is the source of truth: start all work here, from an up-to-date `main`.

## Rules that must stay true

- The checklist comes from OoTMM's own code. Never hand-copy check or settings rules.
- The Entrances tab is filled in by the player. Never run a real shuffle, and never read destinations from a spoiler
  log. The spoiler importer stops before the log's Entrances section.
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
- `src/mapspots.ts`: where each area sits on the Map view
- `src/main.ts`: the app and Edit mode
- `src/textlayer.ts`: makes any on-screen text editable
- `src/skins.ts`: themes
- `src/notes.ts`: the Notes tab's cleaning of formatted notes. `src/live.ts`: live play merging on the hosted page
- `desktop/`: the Windows window (Electron)
- `tools/`: build, tests and packaging
- `dist/web/`: the built phone site, committed so it's always available

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
- `tools/ui-flows.cjs`, `tools/ui-entrances.cjs`, `tools/ui-edit.cjs`, `tools/ui-test.cjs`, `tools/ui-logic.cjs`, `tools/ui-settings.cjs`, `tools/ui-names.cjs`, `tools/ui-notes.cjs`, `tools/ui-live.cjs`: browser tests. Run with
  `NODE_PATH=$(npm root -g) node <file>`. `ui-flows` and `ui-entrances` read spoiler logs from `.cache/`. Create them
  with `tools/dump-spoiler-entry.ts` and `tools/er-test.mjs`.

## Releasing

1. Run the tests, then `npm run build`, and commit `dist/web`.
2. Build `dist/OoTMM-Checklist-Setup.exe` with `npm run package:win`. It's over GitHub's 100 MB file limit, so attach it
   to a GitHub Release. Never commit it.
3. Republish the hosted page from `dist/artifact/ootmm-checklist.html` to
   https://claude.ai/artifact/9mUJwKrCFE88AprUDRHoe1 with capabilities `db`, `user` and `downloads`.
4. Note in the release which things weren't tested. The installer hasn't been run on real Windows or a real phone
   unless the owner has confirmed it.
