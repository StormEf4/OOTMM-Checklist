/* The checkmark on every check and entrance clears it off the main list into "Cleared checks", and puts it back from
   there. Kept per seed, carried in transfer codes and Coop, and older saves without it still load.
   Run with NODE_PATH=$(npm root -g) node tools/ui-clear.cjs */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const PORT = 8981, KEY = 'ootmm-checklist-v1';
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const shot = n => `.cache/shots/${n}.png`;
(async () => {
  fs.mkdirSync('.cache/shots', { recursive: true });
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const errs = [];
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/`); await p.waitForSelector('#regions .reg');
  const seed = () => p.evaluate(k => { const a = JSON.parse(localStorage.getItem(k)); return a.seeds.find(s => s.id === a.current); }, KEY);

  /* Checks */
  await p.click('.reg[data-region="OOT_KOKIRI_FOREST"]'); await p.waitForTimeout(300);
  const id = await p.getAttribute('#listScroll section:not(.cleared-sec) .row >> nth=0', 'data-id');
  ok('every check has a clear button', (await p.$$('#listScroll .row')).length === (await p.$$('#listScroll .row .clear-btn')).length);
  await p.click(`#listScroll .row[data-id="${id}"] .clear-btn`); await p.waitForTimeout(300);
  ok('a cleared check leaves its area', !(await p.$(`#listScroll section:not(.cleared-sec) .row[data-id="${id}"]`)));
  ok('and shows under Cleared checks', !!(await p.$(`#listScroll .cleared-sec .row[data-id="${id}"] .clear-btn.on`)) && (await p.textContent('.cleared-sec h2')) === 'Cleared checks');
  ok('it is saved on the seed', (await seed()).cleared.includes(id));
  ok('clearing is not the same as done', !(await seed()).done.includes(id));
  await p.screenshot({ path: shot('clear-checks') });
  await p.click(`#listScroll .cleared-sec .row[data-id="${id}"] .clear-btn`); await p.waitForTimeout(300);
  ok('pressing it again puts it back', !!(await p.$(`#listScroll section:not(.cleared-sec) .row[data-id="${id}"]`)) && !(await p.$('.cleared-sec')) && !(await seed()).cleared.includes(id));
  await p.click(`#listScroll .row[data-id="${id}"] .clear-btn`); await p.waitForTimeout(300);

  /* Works in Edit mode too */
  await p.click('[data-editmode]'); await p.waitForTimeout(300);
  await p.click(`#listScroll .cleared-sec .row[data-id="${id}"] .clear-btn`); await p.waitForTimeout(300);
  ok('the button works in Edit mode', !(await seed()).cleared.includes(id) && !(await p.$('.sheet:not([hidden]) .editor, .layer .editor')));
  await p.click('[data-editmode]'); await p.waitForTimeout(300);
  await p.click(`#listScroll .row[data-id="${id}"] .clear-btn`); await p.waitForTimeout(300);

  /* Entrances */
  await p.click('.rail .tab[data-tab=entrances]'); await p.waitForTimeout(200);
  await p.click('[data-open-entr-settings]'); await p.waitForSelector('[data-enum=erGrottos]');
  await p.selectOption('[data-enum=erGrottos]', 'full'); await p.waitForTimeout(800);
  await p.click('.rail .tab[data-tab=entrances]'); await p.waitForSelector('.entr-btn');
  ok('every entrance has a clear button', (await p.$$('#entrScroll .row.entr')).length === (await p.$$('#entrScroll .row.entr .clear-btn')).length);
  const eid = await p.getAttribute('#entrScroll .row.entr:not(.fixed) .clear-btn >> nth=0', 'data-clear');
  await p.click(`#entrScroll .clear-btn[data-clear="${eid}"]`); await p.waitForTimeout(300);
  ok('a cleared entrance leaves the main list', (await p.$$(`#entrScroll section:not(.cleared-sec) [data-clear="${eid}"]`)).length === 0);
  ok('and shows under Cleared checks', !!(await p.$(`#entrScroll .cleared-sec [data-clear="${eid}"].on`)));
  ok('it is saved on the seed', (await seed()).cleared.includes(eid));
  await p.screenshot({ path: shot('clear-entrances') });
  await p.click(`#entrScroll .cleared-sec [data-clear="${eid}"]`); await p.waitForTimeout(300);
  ok('pressing it again puts it back', !(await p.$('#entrScroll .cleared-sec')) && !(await seed()).cleared.includes(eid));
  await p.click(`#entrScroll .clear-btn[data-clear="${eid}"]`); await p.waitForTimeout(300);

  /* Transfer code carries it */
  await p.click('.rail .tab[data-tab=seeds]'); await p.click('[data-copycode]');
  await p.waitForFunction(() => document.querySelector('#codeBox')?.value.startsWith('OOTMM1.'), null, { timeout: 10000 }).catch(() => {});
  let code = await p.inputValue('#codeBox');
  if (!code.startsWith('OOTMM1.')) code = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const o = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  o.on('pageerror', e => errs.push(String(e)));
  await o.goto(`http://localhost:${PORT}/`); await o.waitForSelector('#regions .reg');
  await o.click('.rail .tab[data-tab=seeds]'); await o.fill('#codeBox', code); await o.click('[data-readcode]'); await o.waitForTimeout(900);
  const got = await o.evaluate(k => JSON.parse(localStorage.getItem(k)).seeds.map(s => s.cleared ?? []), KEY);
  ok('a transfer code brings cleared checks across', got.some(l => l.includes(id) && l.includes(eid)), JSON.stringify(got));

  /* An older save with no cleared list still loads */
  /* (Saved data is flushed when a page closes, so the old save goes into a fresh page before it starts.) */
  const old = await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); for (const x of s.seeds) delete x.cleared; return JSON.stringify(s); }, KEY);
  ok('the stand-in old save has no cleared list', !old.includes('"cleared"'));
  const op = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  op.on('pageerror', e => errs.push(String(e)));
  await op.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; }, [KEY, old]);
  await op.goto(`http://localhost:${PORT}/`); await op.waitForSelector('#regions .reg');
  await op.click('.rail .tab[data-tab=list]'); await op.click('.reg[data-region="OOT_KOKIRI_FOREST"]'); await op.waitForTimeout(300);
  ok('an older save loads with nothing cleared', !(await op.$('.cleared-sec')) && (await op.$$('#listScroll .row .clear-btn')).length > 0);
  await op.click('#listScroll .row .clear-btn'); await op.waitForTimeout(300);
  ok('and can clear checks', !!(await op.$('.cleared-sec .row')));

  /* Phone size: the row still fits */
  const ph = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  ph.on('pageerror', e => errs.push(String(e)));
  await ph.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; });
  await ph.goto(`http://localhost:${PORT}/`); await ph.waitForSelector('.reg');
  await ph.tap('.reg[data-region="OOT_KOKIRI_FOREST"]'); await ph.waitForTimeout(300);
  await ph.tap('#listScroll .row .clear-btn'); await ph.waitForTimeout(300);
  ok('phone: clearing works by tap', !!(await ph.$('.cleared-sec .row')));
  ok('phone: no sideways scroll', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await ph.screenshot({ path: shot('clear-phone') });

  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close(); srv.close();
})().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
