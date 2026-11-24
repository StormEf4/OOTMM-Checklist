// Browser test for the Map view's pause-menu frame and the player's own map pictures (Edit mode).
// Run with NODE_PATH=$(npm root -g) node tools/ui-mappic.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const KEY = 'ootmm-checklist-v1';
const shot = '.cache/shots/';
(async () => {
  fs.mkdirSync(shot, { recursive: true });
  await new Promise(r => srv.listen(8941, r));
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8941/'); await p.waitForSelector('.reg', { timeout: 60000 });
  const wait = (ms = 300) => p.waitForTimeout(ms);
  const store = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  await p.click('[data-checks-view=map]'); await p.waitForSelector('.world .pin');

  /* Pause-menu frame */
  ok('each map sits in a pause panel with a title and info bar', (await p.$$('.pause .pause-title')).length === 2 && (await p.$$('.pause-info')).length === 2);
  await p.hover('.pin[data-region="OOT_KAKARIKO"]'); await wait(150);
  ok('pointing at an area names it in the info bar', (await p.textContent('[data-info="oot"]')).includes('Kakariko'));
  ok('the cursor marks the area pointed at', !!(await p.$('.pin.cursor[data-region="OOT_KAKARIKO"]')));
  await p.click('.pause-flip[data-map-jump="mm"] >> nth=0'); await wait(700);
  ok('the page arrow goes to the other map', await p.evaluate(() => { const r = document.getElementById('board-mm').getBoundingClientRect(); return r.top < innerHeight / 2 && r.top > -200; }));
  ok('picture button only shows in Edit mode', !(await p.$('[data-map-pic]')));

  /* Own picture, made here: a plain gradient, not a game image */
  const png = path.join(os.tmpdir(), 'ootmm-map-test.png');
  const data = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, '#d8c48c'); gr.addColorStop(1, '#6e8a52'); g.fillStyle = gr; g.fillRect(0, 0, 640, 480); g.fillStyle = '#3a6ea8'; g.beginPath(); g.arc(200, 380, 60, 0, 7); g.fill(); return c.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(png, Buffer.from(data, 'base64'));
  await p.click('.rail [data-editmode]'); await wait();
  await p.click('[data-map-pic="oot"]'); await p.waitForSelector('#mapPicFile', { state: 'attached' });
  await p.setInputFiles('#mapPicFile', png); await p.waitForSelector('.map-pic-prev');
  await p.click('.layer:last-child [data-act=save]'); await p.waitForSelector('.world.own img.world-own');
  ok('Edit mode sets your own Hyrule picture', !!(await p.$('.world.own[data-game="oot"]')) && !(await p.$('.world[data-game="oot"] .world-art')));
  ok('Termina keeps the drawn map', !!(await p.$('.world[data-game="mm"] .world-art')));
  const ratio = await p.$eval('.world.own', e => e.getBoundingClientRect().width / e.getBoundingClientRect().height);
  ok('the map takes your picture\'s shape', Math.abs(ratio - 640 / 480) < .03, ratio.toFixed(3));
  ok('names still sit on your picture', (await p.$$('.world.own .pin')).length > 15);
  await p.screenshot({ path: shot + 'map-own.png' });

  /* Drag a name to line it up */
  const before = (await store()).edits.areas.OOT_KAKARIKO?.spot;
  const pin = await (await p.$('.world.own .pin[data-region="OOT_KAKARIKO"]')).boundingBox();
  const world = await (await p.$('.world.own')).boundingBox();
  await p.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2); await p.mouse.down();
  await p.mouse.move(world.x + world.width * .3, world.y + world.height * .4, { steps: 8 }); await p.mouse.up(); await wait(500);
  const s1 = await store();
  const ps = s1.edits.areas.OOT_KAKARIKO?.picSpot;
  ok('dragging a name saves where it sits on your picture', ps && Math.abs(ps[0] - 30) < 2 && Math.abs(ps[1] - 40) < 2, JSON.stringify(ps));
  ok('the drawn map spot is left alone', JSON.stringify(s1.edits.areas.OOT_KAKARIKO?.spot) === JSON.stringify(before));
  ok('a drag does not open the editor', !(await p.$('.layer #edSpot')));
  await p.click('.world.own .pin[data-region="OOT_KAKARIKO"] .tc'); await p.waitForSelector('#edSpot');
  ok('tapping a name still opens its editor, with the picture spot', (await p.inputValue('#edSpot')).startsWith('30'));
  await p.click('.layer .btn[data-sheet-close]'); await wait();
  ok('the editor closes', !(await p.$('.layer #edSpot')));

  /* Drag on the drawn map */
  await p.$eval('.world[data-game="mm"] .pin[data-region="MM_MILK_ROAD"]', e => e.scrollIntoView({ block: 'center' })); await wait(200);
  const pin2 = await (await p.$('.world[data-game="mm"] .pin[data-region="MM_MILK_ROAD"]')).boundingBox();
  const w2 = await (await p.$('.world[data-game="mm"]')).boundingBox();
  await p.mouse.move(pin2.x + pin2.width / 2, pin2.y + pin2.height / 2); await p.mouse.down();
  await p.mouse.move(w2.x + w2.width * .2, w2.y + w2.height * .7, { steps: 8 }); await p.mouse.up(); await wait(500);
  const sp = (await store()).edits.areas.MM_MILK_ROAD?.spot;
  ok('dragging a name on the drawn map moves it there', sp && Math.abs(sp[0] - 20) < 2 && Math.abs(sp[1] - 70) < 2, JSON.stringify(sp));
  await p.click('.rail [data-editmode]'); await wait();

  /* Kept on this device across a reload */
  await p.reload(); await p.waitForSelector('.reg');
  await p.waitForSelector('.world.own img', { timeout: 10000 }).catch(() => {});
  ok('your picture is still there after a reload', !!(await p.$('.world.own img')));
  ok('your picture is not in the saved data or transfer codes', !JSON.stringify(await store()).includes('data:image'));
  await p.click('.world.own .pin[data-region="OOT_KAKARIKO"]'); await wait();
  ok('tapping a name on your picture opens that area', (await p.textContent('.section-head h2')).includes('Kakariko'));

  /* Back to the drawn map */
  await p.click('[data-checks-view=map]'); await p.waitForSelector('.world .pin');
  await p.click('.rail [data-editmode]'); await wait();
  await p.click('[data-map-pic="oot"]'); await p.waitForSelector('.layer [data-act=reset]');
  await p.click('.layer:last-child [data-act=reset]'); await wait(500);
  ok('going back shows the drawn Hyrule map', !!(await p.$('.world[data-game="oot"] .world-art')) && !(await p.$('.world.own')));
  await p.click('.rail [data-editmode]'); await wait();

  /* Phone */
  const ph = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ph.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; });
  const m = await ph.newPage(); m.on('pageerror', e => errs.push(String(e)));
  await m.goto('http://localhost:8941/'); await m.waitForSelector('.reg');
  await m.click('.reg >> nth=0'); await m.click('[data-checks-view=map]'); await m.waitForSelector('.world .pin');
  ok('no sideways page scroll on a phone', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await m.tap('.pin[data-region="OOT_LON_LON_RANCH"]'); await m.waitForTimeout(300);
  ok('tapping a name on a phone opens it', (await m.textContent('.section-head h2')).includes('Lon Lon'));

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
})();
