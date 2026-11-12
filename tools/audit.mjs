// Works out which settings can change the checklist, by trying every value.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { OOTMM, ROOT, aliases, esbuild, plugins } from './paths.mjs';

/* Every nickname in src/names.ts must name a real OoTMM check, so a renamed location in a new OoTMM shows up here. */
{
  const ids = new Set(JSON.parse(readFileSync(path.join(OOTMM, 'packages/data/dist/lib/data-checks.json'), 'utf8')).map(c => c.location));
  const names = readFileSync(path.join(ROOT, 'src/names.ts'), 'utf8');
  const nick = names.slice(names.indexOf('NICKNAMES'), names.indexOf('};', names.indexOf('NICKNAMES')));
  const gone = [...nick.matchAll(/^\s*'((?:OOT|MM) [^']+)':/gm)].map(m => m[1]).filter(id => !ids.has(id));
  if (gone.length) { console.error(`Nicknames for checks OoTMM doesn't have: ${gone.join(', ')}. Fix them in src/names.ts.`); process.exit(1); }
}

const gen = path.join(ROOT, 'src/generated');
mkdirSync(gen, { recursive: true });
const hash = createHash('sha1');
const walk = d => { for (const f of readdirSync(d).sort()) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : hash.update(readFileSync(p)); } };
walk(path.join(OOTMM, 'packages/core/src')); walk(path.join(OOTMM, 'packages/logic/src')); walk(path.join(OOTMM, 'data/checks')); walk(path.join(OOTMM, 'data/world')); walk(path.join(ROOT, 'src/engine')); hash.update(readFileSync(path.join(ROOT, 'tools/audit-entry.ts')));
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
