import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argIdx = process.argv.indexOf('--ootmm');
export const OOTMM = path.resolve(argIdx > 0 ? process.argv[argIdx + 1] : (process.env.OOTMM_SRC || path.join(ROOT, '..', 'src', 'OoTMM-v33')));
if (!existsSync(path.join(OOTMM, 'packages/logic/src/index.ts'))) {
  throw new Error(`No OoTMM source found at ${OOTMM}. Pass --ootmm <path to your OoTMM checkout>.`);
}

const searchPaths = [ROOT, '/opt/npm-tools'];
const req = createRequire(path.join(ROOT, 'package.json'));
export const resolvePkg = name => {
  const p = req.resolve.paths(name) ?? [];
  for (const base of [...p, ...searchPaths.map(s => path.join(s, 'node_modules'))]) {
    const dir = path.join(base, name);
    if (existsSync(path.join(dir, 'package.json'))) return dir;
  }
  throw new Error(`Missing dependency ${name}. Run npm install.`);
};
const esbuildDir = resolvePkg('esbuild');
export const esbuild = createRequire(path.join(esbuildDir, 'package.json'))('./lib/main.js');

export const aliases = {
  '@ootmm/core': path.join(OOTMM, 'packages/core/src/index.ts'),
  '@ootmm/logic': path.join(OOTMM, 'packages/logic/src/index.ts'),
  '@ootmm/data': path.join(OOTMM, 'packages/data/lib/index.ts'),
  '@ootmm/regions': path.join(OOTMM, 'packages/generator/lib/combo/regions.ts'),
  'fast-xml-parser': path.join(ROOT, 'tools/shims/fast-xml-parser.mjs'),
  'csv/sync': path.join(ROOT, 'tools/shims/csv-sync.mjs'),
  'uint8array-extras': path.join(ROOT, 'tools/shims/uint8array-extras.mjs'),
  'lodash-es': resolvePkg('lodash-es'),
  'pako': path.join(ROOT, 'tools/shims/pako.mjs'),
  'pako-real': resolvePkg('pako'),
  'yaml': resolvePkg('yaml'),
};

/* OoTMM keeps its entrance pool logic in a private class. This exposes it to the
   checklist at build time, without changing the randomizer's source. */
export const plugins = [{
  name: 'expose-world-shuffler',
  setup(build) {
    build.onLoad({ filter: /solver[\\/]entrances\.ts$/ }, args => {
      const text = readFileSync(args.path, 'utf8');
      if (!/class WorldShuffler\b/.test(text)) throw new Error('OoTMM no longer has a WorldShuffler class. Update src/engine/entrances.ts to match.');
      return { contents: `${text}\nexport { WorldShuffler as ChecklistWorldShuffler };\n`, loader: 'ts' };
    });
  },
}];
