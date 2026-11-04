const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const shot = '.cache/shots/';
(async () => {
  await new Promise(r => srv.listen(8931, r));
  const b = await chromium.launch();
  const errs = [];
  const open = async (opts) => { const c = await b.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto('http://localhost:8931/'); await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 20000 }); return p; };

  const pc = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const r = {};
  r.remaining = await pc.textContent('#remain');
  await pc.screenshot({ path: shot + 'pc-dark.png' });
  // tick a check
  await pc.click('.row .tick-btn');
  await pc.waitForTimeout(350);
  r.afterTick = await pc.textContent('#remain');
  // toggle cows in settings
  await pc.click('.rail .tab[data-tab=settings]');
  await pc.waitForSelector('#setScroll');
  await pc.fill('#setSearch', 'cow');
  await pc.waitForTimeout(400);
  await pc.screenshot({ path: shot + 'pc-settings.png' });
  const sw = pc.locator('[data-bool=cowShuffleOot]');
  await sw.click();
  await pc.waitForTimeout(800);
  r.afterCows = await pc.textContent('#countPill');
  // persistence
  await pc.waitForTimeout(400);
  await pc.reload(); await pc.waitForSelector('.row');
  r.afterReload = await pc.textContent('#remain');
  // transfer
  await pc.click('.rail .tab[data-tab=seeds]');
  await pc.waitForSelector('[data-copycode]');
  r.code = await pc.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return { seeds: s.seeds.length, done: s.seeds[0].done.length }; });
  await pc.screenshot({ path: shot + 'pc-seeds.png' });

  const ph = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await ph.screenshot({ path: shot + 'phone-rail.png' });
  await ph.tap('.reg[data-region="OOT_KOKIRI_FOREST"]');
  await ph.waitForTimeout(250);
  await ph.tap('.row .tick-btn');
  await ph.waitForTimeout(350);
  await ph.screenshot({ path: shot + 'phone-list.png' });
  await ph.tap('.bottom .tab[data-tab=settings]');
  await ph.waitForTimeout(250);
  await ph.screenshot({ path: shot + 'phone-settings.png' });
  r.hscroll = await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(JSON.stringify(r, null, 1)); console.log('errors', errs.length, errs.slice(0, 5));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
