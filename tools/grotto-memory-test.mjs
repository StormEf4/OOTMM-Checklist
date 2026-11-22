// Checks src/grotto-memory.ts: which plain grotto hole the reader's numbers point to, and that it gives up (so the app
// asks) whenever more than one door could fit. Run: node tools/grotto-memory-test.mjs
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT, esbuild } from './paths.mjs';

const out = path.join(mkdtempSync(path.join(tmpdir(), 'grotto-mem-')), 'g.mjs');
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/grotto-memory.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { grottoFromMemory } = await import(pathToFileURL(out));
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };

const G = 'OOT_GROTTO_TYPE_GENERIC', now = 100000;
const HF = ['OOT_GROTTO_GENERIC_HF_OPEN', 'OOT_GROTTO_GENERIC_HF_SOUTHEAST', 'OOT_GROTTO_GENERIC_HF_MARKET'];
const at = (...l) => l.map(([v, ago]) => ({ v, t: now - ago }));
const run = (seen, dest, choices = HF, original = G, since = now - 120000) => grottoFromMemory(original, dest, at(...seen), now, since, choices);

ok('hole then the grotto it led to', run([[0x23, 1500], [0x08, 900]], 'OOT_GROTTO_GENERIC_KAKARIKO') === 'OOT_GROTTO_GENERIC_HF_OPEN');
ok('only the low 5 bits count', run([[0xe2, 1500], [0x08, 900]], 'OOT_GROTTO_GENERIC_KAKARIKO') === 'OOT_GROTTO_GENERIC_HF_SOUTHEAST');
ok('hole leading to a place that isn\'t a plain grotto: the last number', run([[0x08, 60000], [0x20, 1200]], 'OOT_HOUSE_SARIA') === 'OOT_GROTTO_GENERIC_HF_MARKET');
ok('a grotto\'s number not last: gives up', run([[0x23, 1500], [0x02, 900]], 'OOT_GROTTO_GENERIC_KAKARIKO') === null);
ok('hole is the grotto\'s own (vanilla), one recent change', run([[0x08, 60000], [0x03, 900]], 'OOT_GROTTO_GENERIC_HF_OPEN') === 'OOT_GROTTO_GENERIC_HF_OPEN');
ok('one recent change, both doors open: gives up', run([[0x02, 60000], [0x03, 900]], 'OOT_GROTTO_GENERIC_HF_OPEN') === null);
ok('one recent change, the other door already logged: the open one', run([[0x02, 60000], [0x03, 900]], 'OOT_GROTTO_GENERIC_HF_OPEN', ['OOT_GROTTO_GENERIC_HF_OPEN', 'OOT_GROTTO_GENERIC_HF_MARKET']) === 'OOT_GROTTO_GENERIC_HF_OPEN');
ok('no change at all: the hole already had the grotto\'s number', run([[0x03, 60000]], 'OOT_GROTTO_GENERIC_HF_OPEN') === 'OOT_GROTTO_GENERIC_HF_OPEN');
ok('hole not among the doors asked about: gives up', run([[0x23, 1500], [0x08, 900]], 'OOT_GROTTO_GENERIC_KAKARIKO', ['OOT_GROTTO_GENERIC_HF_MARKET']) === null);
ok('nothing seen: gives up', run([], 'OOT_GROTTO_GENERIC_KAKARIKO') === null);
ok('reader only just started watching: gives up', run([[0x03, 2000]], 'OOT_GROTTO_GENERIC_HF_OPEN', HF, G, now - 2000) === null);
ok('reader not watching this game: gives up', run([[0x23, 1500], [0x08, 900]], 'OOT_GROTTO_GENERIC_KAKARIKO', HF, G, 0) === null);
ok('not a plain grotto report: gives up', run([[0x23, 1500], [0x08, 900]], 'OOT_GROTTO_GENERIC_KAKARIKO', HF, 'OOT_GROTTO_TYPE_FAIRY') === null);
ok('MM: hole then grotto', run([[0x13, 2000], [0x1f, 800]], 'MM_GROTTO_GENERIC_GRASS', ['MM_GROTTO_GENERIC_PATH_SNOWHEAD', 'MM_GROTTO_GENERIC_ZORA_CAPE'], 'MM_GROTTO_TYPE_GENERIC') === 'MM_GROTTO_GENERIC_PATH_SNOWHEAD');
