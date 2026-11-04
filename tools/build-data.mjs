// Runs OoTMM's own data build (XML/YAML → JSON) against the chosen source tree.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { OOTMM, ROOT, aliases, esbuild } from './paths.mjs';

const buildDir = path.join(OOTMM, 'packages/data/build');
const outfile = path.join(ROOT, '.cache/build-data.mjs');
mkdirSync(path.dirname(outfile), { recursive: true });
await esbuild.build({
  entryPoints: [path.join(buildDir, 'run.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  alias: aliases,
  define: { 'import.meta.dirname': JSON.stringify(buildDir) },
});
await import(pathToFileURL(outfile).href);
console.log('OoTMM data built from', OOTMM);
