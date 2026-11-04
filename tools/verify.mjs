// Compares the checklist engine against OoTMM's own locationList() on random settings.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OOTMM, ROOT, aliases, esbuild, plugins } from './paths.mjs';

const outfile = path.join(ROOT, '.cache/verify.mjs');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'tools/verify-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile,
  logLevel: 'error', loader: { '.json': 'json' },
  plugins, alias: { ...aliases, '@ootmm/location-list': path.join(OOTMM, 'packages/generator/lib/combo/location-list.ts') },
});
await import(pathToFileURL(outfile).href);
