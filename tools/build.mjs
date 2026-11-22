// Builds one app three ways: dist/web (phone + hosting), dist/desktop (Windows), dist/artifact (hosted page).
import path from 'node:path';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { OOTMM, ROOT, aliases, esbuild, plugins } from './paths.mjs';
import { saveLayoutHash } from './save-layout-hash.mjs';

const css = ['src/generated/fonts.css', 'src/generated/fonts-extra.css', 'src/style.css'].map(f => readFileSync(path.join(ROOT, f), 'utf8')).join('');
const changelog = readFileSync(path.join(OOTMM, 'CHANGELOG.md'), 'utf8');
let version = changelog.match(/^## \[(\d[\d.]*)\]/m)?.[1] ?? 'unknown';
try {
  const d = execSync('git describe --tags --always --dirty', { cwd: OOTMM, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  if (d) version = d;
} catch {}

/* Game tracking's save file catch-up only runs when its layout was worked out from this same OoTMM source. */
const layoutFile = path.join(ROOT, 'src/generated/save-layout.json');
const saveLayoutOk = existsSync(layoutFile) && JSON.parse(readFileSync(layoutFile, 'utf8')).hash === saveLayoutHash(OOTMM);
if (!saveLayoutOk) console.warn('Save file catch-up is off in this build: OoTMM changed since src/generated/save-layout.json was made. Run node tools/save-layout.mjs.');

const bundle = async target => {
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/main.ts')], bundle: true, write: false, minify: true, format: 'iife', target: 'es2021',
    platform: 'browser', alias: aliases, plugins, loader: { '.json': 'json' }, logLevel: 'warning', legalComments: 'none',
    define: { __TARGET__: JSON.stringify(target), __OOTMM__: JSON.stringify(version), __SAVE_LAYOUT_OK__: JSON.stringify(saveLayoutOk), 'process.env.NODE_ENV': '"production"' },
  });
  return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
};

const title = 'OoTMM Checklist';
const fullPage = (js, head = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<title>${title}</title>${head}
<style>${css}</style></head>
<body><div id="app"></div><script>${js}</script></body></html>`;

rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
const out = d => { const p = path.join(ROOT, 'dist', d); mkdirSync(p, { recursive: true }); return p; };

/* Phone / hosted */
const web = out('web');
const jsWeb = await bundle('web');
const iconTags = `
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0d211a">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="OoTMM Checks">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-192.png">`;
writeFileSync(path.join(web, 'index.html'), fullPage(jsWeb, iconTags));
writeFileSync(path.join(web, 'manifest.webmanifest'), JSON.stringify({
  name: title, short_name: 'OoTMM Checks', start_url: '.', scope: '.', display: 'standalone', background_color: '#0d211a', theme_color: '#0d211a',
  icons: [192, 512].map(s => ({ src: `icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any maskable' })),
}));
const stamp = Date.now().toString(36);
writeFileSync(path.join(web, 'sw.js'), `const C='ootmm-${stamp}',F=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});`);
if (existsSync(path.join(ROOT, 'icons'))) cpSync(path.join(ROOT, 'icons/web'), web, { recursive: true });

/* Windows */
const desk = out('desktop');
writeFileSync(path.join(desk, 'index.html'), fullPage(await bundle('desktop')));
cpSync(path.join(ROOT, 'desktop'), desk, { recursive: true });

/* Hosted page: the host adds the document skeleton */
const art = out('artifact');
writeFileSync(path.join(art, 'ootmm-checklist.html'), `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="app"></div>
<script>${await bundle('artifact')}</script>
`);
console.log(`Built from OoTMM ${version}: ${(jsWeb.length / 1e6).toFixed(2)} MB of script`);
