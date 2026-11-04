// Works out which settings can change the checklist, by trying every value.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { OOTMM, ROOT, aliases, esbuild, plugins } from './paths.mjs';

const gen = path.join(ROOT, 'src/generated');
mkdirSync(gen, { recursive: true });
const hash = createHash('sha1');
const walk = d => { for (const f of readdirSync(d).sort()) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : hash.update(readFileSync(p)); } };
walk(path.join(OOTMM, 'packages/core/src')); walk(path.join(OOTMM, 'packages/logic/src')); walk(path.join(OOTMM, 'data/checks')); walk(path.join(OOTMM, 'data/world'));
const key = hash.digest('hex').slice(0, 16);
const cached = path.join(ROOT, `.cache/audit-${key}.json`);
if (!existsSync(cached)) {
  process.env.AUDIT_OUT = cached;
  const outfile = path.join(ROOT, '.cache/audit.mjs');
  await esbuild.build({ entryPoints: [path.join(ROOT, 'tools/audit-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, alias: aliases, plugins, logLevel: 'error', loader: { '.json': 'json' } });
  process.on('exit', () => copyFileSync(cached, path.join(gen, 'audit.json')));
  await import(pathToFileURL(outfile).href);
} else {
  copyFileSync(cached, path.join(gen, 'audit.json'));
}
