// Writes .cache/ui-toggles.json for tools/ui-toggles.cjs.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, aliases, esbuild, plugins } from './paths.mjs';
const outfile = path.join(ROOT, '.cache/ui-toggles-data.mjs');
await esbuild.build({ entryPoints: [path.join(ROOT, 'tools/ui-toggles-data-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error', loader: { '.json': 'json' }, plugins, alias: aliases });
await import(pathToFileURL(outfile).href);
