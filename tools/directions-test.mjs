/* Checks directions (src/directions.ts) on OoTMM's real map. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, aliases, esbuild, plugins } from './paths.mjs';
const outfile = path.join(ROOT, '.cache/directions-test.mjs');
await esbuild.build({ entryPoints: [path.join(ROOT, 'tools/directions-test-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error', loader: { '.json': 'json' }, plugins, alias: aliases });
await import(pathToFileURL(outfile).href);
