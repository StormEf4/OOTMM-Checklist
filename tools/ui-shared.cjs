// Browser test for shared items on the Items tab. Items the seed's settings share between the games (OoTMM's shared*
// settings) are listed once, in a Shared section, and not under Hyrule or Termina. With the setting off, each game's
// own copy is listed under its game.
// Run with NODE_PATH=$(npm root -g) node tools/ui-shared.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8945);

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });

  /* Item ids in each section. */
  const sections = () => p.evaluate(() => Object.fromEntries(['oot', 'mm', 'shared'].map(g =>
    [g, [...document.querySelectorAll(`section.items.${g} .item-btn`)].map(b => b.dataset.item)])));
  const items = async () => {
    await p.click('.rail .tab[data-tab=items]');
    await p.waitForFunction(() => document.querySelectorAll('section.items .item').length > 10, null, { timeout: 120000 });
    await p.waitForTimeout(500);
    return sections();
  };

  let s = await items();
  const sharedAtStart = s.shared.length;
  ok('default settings: no game section lists a SHARED_ item', ![...s.oot, ...s.mm].some(id => id.startsWith('SHARED_')));
  ok('default settings: bows and health are per game', s.oot.includes('OOT_BOW') && s.mm.includes('MM_BOW') && s.oot.includes('OOT_HEART_PIECE') && s.mm.includes('MM_HEART_PIECE'));
  ok('Shared filter only when something is shared', !!(await p.$('[data-item-game=shared]')) === (sharedAtStart > 0), String(sharedAtStart));

  /* Turn on every shared switch. */
  await p.click('.rail .tab[data-tab=settings]');
  await p.click('[data-setview=game]');
  await p.fill('#setSearch', 'shared');
  await p.waitForTimeout(400);
  const keys = await p.$$eval('[data-bool^=shared]', es => es.filter(e => e.getAttribute('aria-checked') !== 'true').map(e => e.dataset.bool));
  for (const k of keys) { await p.click(`[data-bool=${k}]`); await p.waitForTimeout(250); }
  console.log('   turned on:', keys.join(' '));
  await p.click('.rail .tab[data-tab=items]');
  await p.waitForFunction(() => document.querySelector('section.items.shared .item-btn[data-item="SHARED_BOW"]'), null, { timeout: 180000 }).catch(() => {});
  s = await items();
  console.log('   shared section:', s.shared.join(' '));
  ok('shared items listed in the Shared section', ['SHARED_BOW', 'SHARED_HEART_PIECE', 'SHARED_HEART_CONTAINER', 'SHARED_HOOKSHOT', 'SHARED_MASK_GORON', 'SHARED_LENS'].every(id => s.shared.includes(id)));
  ok('no SHARED_ item under Hyrule or Termina', ![...s.oot, ...s.mm].some(id => id.startsWith('SHARED_')), [...s.oot, ...s.mm].filter(id => id.startsWith('SHARED_')).join(' '));
  const tiles = await p.$$eval('section.items.shared .item-btn', bs => bs.map(b => b.dataset.item + '#' + (b.dataset.itemLevel ?? '')));
  ok('each shared item (or step) listed once', new Set(tiles).size === tiles.length);
  ok("games' own copies are gone", !['OOT_BOW', 'MM_BOW', 'OOT_HEART_PIECE', 'MM_HEART_PIECE', 'OOT_LENS', 'MM_LENS'].some(id => [...s.oot, ...s.mm].includes(id)));
  ok('the Shared section only holds SHARED_ items', s.shared.every(id => id.startsWith('SHARED_')));
  ok('sidebar has a Shared heading', !!(await p.$('.rail .group.shared')));

  await p.click('[data-item-game=shared]');
  await p.waitForTimeout(300);
  s = await sections();
  ok('Shared filter shows only the Shared section', s.shared.length > 0 && !s.oot.length && !s.mm.length);
  await p.click('[data-item-game=oot]');
  await p.waitForTimeout(300);
  s = await sections();
  ok('OoT filter shows only Hyrule', s.oot.length > 0 && !s.shared.length && !s.mm.length);
  await p.click('[data-item-game=all]');

  /* Ticking a shared item works and is saved under its shared id. */
  await p.click('section.items.shared .item-btn[data-item="SHARED_LENS"]');
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return s.seeds.find(x => x.id === s.current).have; });
  ok('ticking a shared item saves it', st.SHARED_LENS === 1, JSON.stringify(st));
  fs.mkdirSync('.cache/shots', { recursive: true });
  await p.locator('section.items.shared').screenshot({ path: '.cache/shots/items-shared.png' });

  /* Phone width. */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: '.cache/shots/items-shared-phone.png' });

  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
