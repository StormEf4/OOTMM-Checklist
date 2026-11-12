import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, aliases, esbuild, plugins } from './paths.mjs';
const outfile = path.join(ROOT, `.cache/logic-test-${(process.env.SHARD ?? '0/1').replace('/', '-')}.mjs`);
await esbuild.build({ entryPoints: [path.join(ROOT, 'tools/logic-test-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error', loader: { '.json': 'json' }, plugins, alias: aliases,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
await import(pathToFileURL(outfile).href);
