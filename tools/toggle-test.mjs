// Every value of every setting against OoTMM's locationList(). SHARD=i/n splits the work.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OOTMM, ROOT, aliases, esbuild, plugins } from './paths.mjs';
const outfile = path.join(ROOT, `.cache/toggle-test-${(process.env.SHARD ?? '0/1').replace('/', '-')}.mjs`);
await esbuild.build({
  entryPoints: [path.join(ROOT, 'tools/toggle-test-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile,
  logLevel: 'error', loader: { '.json': 'json' },
  plugins, alias: { ...aliases, '@ootmm/location-list': path.join(OOTMM, 'packages/generator/lib/combo/location-list.ts') },
});
await import(pathToFileURL(outfile).href);
