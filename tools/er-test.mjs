import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OOTMM, ROOT, aliases, esbuild, plugins } from './paths.mjs';
const outfile = path.join(ROOT, '.cache/er-test.mjs');
await esbuild.build({ entryPoints: [path.join(ROOT, 'tools/er-test-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error', loader: { '.json': 'json' },
  plugins, alias: { ...aliases, '@ootmm/spoiler': path.join(OOTMM, 'packages/generator/lib/combo/spoiler.ts') } });
await import(pathToFileURL(outfile).href);
