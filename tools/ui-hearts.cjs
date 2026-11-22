// Browser test for the heart container display. It shows the player's hearts the way the game does: 3 to start, up to
// 20, a Heart Container adds a heart, and Heart Pieces sit as quarters on the next empty heart. With OoTMM's Shared
// Health on there's one meter; with it off, a button switches between the OoT and MM hearts.
// Run with NODE_PATH=$(npm root -g) node tools/ui-hearts.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8944);

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

  /* Quarters in each of the 20 hearts, read from the drawing. */
  const hearts = () => p.$$eval('#hearts .heart-row svg', svgs => svgs.map(s => {
    const f = s.querySelector('.hf');
    return !f ? 0 : Number((f.getAttribute('clip-path') ?? 'hq4').replace(/\D/g, ''));
  }).join(''));
  const head = () => p.$eval('#hearts .heart-head', e => e.textContent.replace(/\s+/g, ' ').trim());
  const want = (...q) => q.join('').padEnd(20, '0');
  const items = async () => {
    await p.click('.rail .tab[data-tab=items]');
    await p.waitForFunction(() => document.querySelectorAll('section.items .item').length > 10, null, { timeout: 120000 });
  };
  const setNum = async (id, n) => {
    await p.fill(`[data-item-num="${id}"]`, String(n));
    await p.dispatchEvent(`[data-item-num="${id}"]`, 'change');
    await p.waitForTimeout(200);
  };
  const tile = id => `.item-btn[data-item="${id}"]`;

  ok('theme default is the heart display', await p.$eval('.brand', e => e.dataset.meter) === 'hearts');
  ok('starts at 3 hearts of 20', await hearts() === want(4, 4, 4), await hearts());
  ok('switch button shown when health is not shared', !!(await p.$('[data-heart-game="mm"]')), await head());

  await items();
  const group = await p.$$eval('section.items.oot .item-group', gs => [...gs].find(g => /^Hearts/.test(g.querySelector('h3').textContent))?.innerText.replace(/\s+/g, ' '));
  ok('Items tab has a Hearts group', !!group && /Heart Container/.test(group) && /Piece of Heart/.test(group) && /Double Defense/.test(group), group);
  const maxes = await p.$$eval('[data-item-num]', es => Object.fromEntries(es.filter(e => /HEART/.test(e.dataset.itemNum)).map(e => [e.dataset.itemNum, e.max])));
  ok('heart counts follow the item pool', maxes.OOT_HEART_PIECE === '36' && maxes.MM_HEART_PIECE === '52' && maxes.OOT_HEART_CONTAINER === '8', JSON.stringify(maxes));

  await setNum('OOT_HEART_PIECE', 1);
  ok('one piece is a quarter on the 4th heart', await hearts() === want(4, 4, 4, 1), await hearts());
  await setNum('OOT_HEART_PIECE', 3);
  ok('three pieces are three quarters', await hearts() === want(4, 4, 4, 3), await hearts());
  ok('label says 3¾ hearts', /OoT · 3¾ hearts/.test(await head()), await head());
  await setNum('OOT_HEART_CONTAINER', 1);
  ok('a container while holding pieces adds a whole heart and moves the quarters on', await hearts() === want(4, 4, 4, 4, 3), await hearts());
  await setNum('OOT_HEART_PIECE', 4);
  ok('four pieces make a whole heart', await hearts() === want(4, 4, 4, 4, 4), await hearts());
  await setNum('OOT_HEART_PIECE', 36); await setNum('OOT_HEART_CONTAINER', 8);
  ok('everything makes 20 full hearts', await hearts() === '4'.repeat(20), await hearts());
  await setNum('OOT_HEART_PIECE', 6); await setNum('OOT_HEART_CONTAINER', 2);

  await p.click('[data-heart-game="mm"]');
  ok('MM hearts are their own', await hearts() === want(4, 4, 4), await hearts());
  ok('MM label', /^MM · 3 hearts/.test(await head()), await head());
  await setNum('MM_HEART_PIECE', 2);
  ok('MM pieces show on MM hearts', await hearts() === want(4, 4, 4, 2), await hearts());
  await p.click('.item-btn[data-item="MM_HEART_CONTAINER"]');
  await p.waitForTimeout(200);
  ok('MM container (tapped tile) pushes the half heart on', await hearts() === want(4, 4, 4, 4, 2), await hearts());
  await p.click('[data-heart-game="oot"]');
  ok('back to OoT keeps OoT hearts', await hearts() === want(4, 4, 4, 4, 4, 4, 2), await hearts());

  /* Double Defense outlines only its own game's hearts. */
  await p.click(tile('OOT_DEFENSE_UPGRADE'));
  await p.waitForTimeout(200);
  ok('OoT Double Defense outlines OoT hearts', await p.$eval('#hearts .heart-row', e => e.classList.contains('dd')));
  await p.click('[data-heart-game="mm"]');
  ok('but not MM hearts', !(await p.$eval('#hearts .heart-row', e => e.classList.contains('dd'))));

  /* The switch keeps working in Edit mode. */
  await p.click('.rail [data-editmode]');
  await p.waitForTimeout(200);
  await p.click('[data-heart-game="oot"]');
  ok('switch works in Edit mode', /^OoT/.test(await head()), await head());
  ok('no editor opened by the switch', !(await p.$('#sheetHost .sheet')));
  await p.click('[data-heart-game="mm"]');
  await p.click('.rail [data-editmode]');
  await p.waitForTimeout(200);

  /* The choice is kept after a reload. */
  await p.reload();
  await p.waitForSelector('#hearts .heart-row');
  await p.waitForTimeout(1500);
  ok('reload keeps the MM view and counts', /^MM/.test(await head()) && await hearts() === want(4, 4, 4, 4, 2), `${await head()} ${await hearts()}`);
  fs.mkdirSync('.cache/shots', { recursive: true });
  await p.locator('.brand').screenshot({ path: '.cache/shots/hearts-split.png' });

  /* Shared Health on: one meter, no switch. */
  await p.click('.rail .tab[data-tab=settings]');
  await p.click('[data-setview=game]');
  await p.fill('#setSearch', 'shared health');
  await p.waitForTimeout(300);
  await p.click('[data-bool=sharedHealth]');
  await p.waitForFunction(() => /^Shared/.test(document.querySelector('#hearts .heart-head')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
  ok('shared: no switch button', !(await p.$('[data-heart-game]')), await head());
  ok('shared: starts at 3 hearts', await hearts() === want(4, 4, 4) && /^Shared · 3 hearts/.test(await head()), `${await head()} ${await hearts()}`);
  await items();
  const smax = await p.$$eval('[data-item-num]', es => Object.fromEntries(es.filter(e => /HEART/.test(e.dataset.itemNum)).map(e => [e.dataset.itemNum, e.max])));
  ok('shared pool: 44 pieces, 6 containers', smax.SHARED_HEART_PIECE === '44' && smax.SHARED_HEART_CONTAINER === '6' && !smax.OOT_HEART_PIECE, JSON.stringify(smax));
  await setNum('SHARED_HEART_PIECE', 5);
  ok('shared: 5 pieces = 4¼ hearts', await hearts() === want(4, 4, 4, 4, 1), await hearts());
  await setNum('SHARED_HEART_CONTAINER', 1);
  ok('shared: container moves the quarter on', await hearts() === want(4, 4, 4, 4, 4, 1), await hearts());
  await setNum('SHARED_HEART_PIECE', 44); await setNum('SHARED_HEART_CONTAINER', 6);
  ok('shared: full pool is exactly 20 hearts', await hearts() === '4'.repeat(20), await hearts());
  await setNum('SHARED_HEART_PIECE', 6);
  ok('shared: OoT Double Defense no longer outlines', !(await p.$eval('#hearts .heart-row', e => e.classList.contains('dd'))));
  await p.click(tile('SHARED_DEFENSE_UPGRADE'));
  await p.waitForTimeout(200);
  ok('shared: shared Double Defense outlines', await p.$eval('#hearts .heart-row', e => e.classList.contains('dd')));
  await p.locator('.brand').screenshot({ path: '.cache/shots/hearts-shared.png' });

  /* Logging a heart at a check counts too. */
  await p.click('.rail .tab[data-tab=list]');
  const before = await hearts();
  await p.waitForSelector('[data-found]');
  const bag = await p.$('[data-found]');
  if (bag) {
    await bag.click();
    await p.fill('#itemPickSearch', 'heart piece');
    await p.waitForTimeout(300);
    await p.click('#itemPickList [data-pick-item="SHARED_HEART_PIECE"]');
    await p.waitForTimeout(300);
    ok('a Heart Piece logged at a check adds a quarter', await hearts() === want(...'4'.repeat(10), 3), `${before} -> ${await hearts()}`);
  } else ok('found a bag button to log an item', false);

  /* Phone size. */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: '.cache/shots/hearts-phone.png' });
  const box = await p.$eval('#hearts', e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }).catch(() => null);
  ok('hearts fit on a phone', box && box.w > 200 && box.w <= 390, JSON.stringify(box));

  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
