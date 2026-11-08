// Browser test for reachable checks, the Items tab, the Hints tab and the Map view.
// Run with NODE_PATH=$(npm root -g) node tools/ui-logic.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const KEY = 'ootmm-checklist-v1';
const shot = '.cache/shots/';
(async () => {
  fs.mkdirSync(shot, { recursive: true });
  await new Promise(r => srv.listen(8936, r));
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8936/'); await p.waitForSelector('.row');
  const wait = (ms = 300) => p.waitForTimeout(ms);
  const store = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const reach = async () => Number((await p.textContent('#logicPill')).replace(/[^\d]/g, ''));
  const waitLogic = async () => { await p.waitForFunction(() => /in logic now/.test(document.getElementById('logicPill')?.textContent ?? ''), null, { timeout: 60000 }); await wait(200); };

  /* Reachable checks */
  await waitLogic();
  const start = await reach();
  ok('logic runs and marks some checks', start > 0 && start < 400, `${start} in logic`);
  ok('in-logic checks are marked in the list', (await p.$$('.row.inlogic')).length > 0 && (await p.$$('.row.outlogic')).length > 0);
  ok('rail shows checks you can get per area', (await p.$$('.reg .lg')).length > 0);
  await p.click('[data-logiconly]'); await wait();
  ok('In logic filter hides out-of-logic checks', (await p.$$('.row.outlogic')).length === 0 && (await p.$$('.row.inlogic')).length > 0);
  await p.screenshot({ path: shot + 'logic-list.png' });
  await p.click('[data-logiconly]'); await wait();

  /* Items tab */
  await p.click('.rail .tab[data-tab=items]'); await p.waitForSelector('.item-btn');
  const items = await p.$$eval('.item-btn', e => e.map(x => x.textContent.trim()));
  ok('items tab lists items from the settings', items.length > 80, `${items.length} items`);
  ok('consumable refills are left out', !items.some(t => /^5 Bombs/.test(t)));
  for (const name of ['Fairy Slingshot', 'Bomb Bag', 'Progressive Hookshot', 'Hookshot', 'Progressive Strength', "Goron's Bracelet", 'Fairy Ocarina', 'Ocarina'])
    await p.locator('.item-btn', { hasText: name }).first().click().catch(() => {});
  await wait(200);
  await p.screenshot({ path: shot + 'items.png' });
  await p.click('.rail .tab[data-tab=list]'); await waitLogic();
  const more = await reach();
  ok('adding items opens more checks', more > start, `${start} then ${more}`);
  await p.waitForSelector('.row.outlogic .opens', { timeout: 60000 }).catch(() => {});
  const opens = await p.$$eval('.row.outlogic .opens', e => e.map(x => x.textContent));
  ok('out-of-logic checks say which item opens them', opens.length > 0 && opens.every(t => /^Opens with:/.test(t)), opens[0] ?? '');
  ok('checks in logic never say what opens them', (await p.$$('.row.inlogic .opens')).length === 0);
  await p.click('.rail .tab[data-tab=items]'); await p.waitForSelector('.next-items li', { timeout: 30000 }).catch(() => {});
  const next = await p.$$eval('.next-items li', e => e.map(x => x.textContent));
  ok('items tab lists the best items to find next', next.length > 0 && /opens \d+ check/.test(next[0]), next[0] ?? '');
  await p.screenshot({ path: shot + 'next-items.png' });
  for (const name of ['Master Sword', 'Song of Time', 'Emerald', 'Ruby', 'Sapphire']) await p.locator('.item-btn', { hasText: name }).first().click();
  await p.click('.rail .tab[data-tab=list]'); await waitLogic();
  const ages = await p.$$eval('.row.inlogic .tag.age', e => e.map(x => x.textContent));
  ok('once both ages can play, one-age checks are tagged', ages.includes('Child') && ages.includes('Adult'), `${ages.filter(a => a === 'Child').length} child, ${ages.filter(a => a === 'Adult').length} adult`);
  ok('out-of-logic checks have no age tag', (await p.$$('.row.outlogic .tag.age')).length === 0);
  await p.screenshot({ path: shot + 'ages.png' });

  /* Bag button logs what was found at a check */
  const firstId = await p.getAttribute('.row.inlogic', 'data-id');
  await p.click(`.row[data-id="${firstId}"] .bag`); await p.waitForSelector('#itemPickList .pick');
  await p.fill('#itemPickSearch', 'boomerang'); await wait(250);
  await p.click('#itemPickList .pick >> nth=0'); await wait(400);
  const s1 = await store();
  const cur = s1.seeds.find(x => x.id === s1.current);
  ok('bag logs the item at the check', cur.found[firstId] === 'OOT_BOOMERANG');
  ok('logging an item marks the check done', cur.done.includes(firstId));
  ok('the row shows what was found', (await p.textContent(`.row[data-id="${firstId}"]`)).includes('Boomerang'));
  await p.click('.rail .tab[data-tab=items]'); await p.waitForSelector('.item-btn');
  ok('a logged item counts in Items', (await p.locator('.item.on', { hasText: 'Boomerang' }).count()) > 0 && (await p.locator('.item', { hasText: 'Boomerang' }).first().textContent()).includes('at'));

  /* Hints */
  await p.click('.rail .tab[data-tab=hints]'); await p.waitForSelector('[data-hint]');
  const stones = await p.$$('[data-hint]');
  ok('hints tab lists gossip stones', stones.length > 40, `${stones.length} stones`);
  await p.click('[data-hint] >> nth=0'); await p.waitForSelector('#hintText');
  await p.fill('#hintText', 'They say that Lake Hylia is a foolish choice.'); await p.click('.layer:last-child [data-act=save]'); await wait();
  ok('a written hint shows on its stone', (await p.textContent('#hintScroll')).includes('foolish choice'));
  ok('wording marks it foolish', (await p.$$('.row.hint .htag.foolish')).length === 1);
  ok('the area is tagged in the rail', (await p.textContent('.reg[data-region="OOT_LAKE_HYLIA"]')).includes('Foolish'));
  await p.click('[data-add-hint]'); await p.waitForSelector('#hintFrom');
  await p.fill('#hintFrom', 'Shop sign'); await p.fill('#hintText', 'Deku Theater has something');
  await p.fill('#hintCheck', 'Lost Woods: Skull Kid'); await p.fill('#hintItem', 'Lens of Truth');
  await p.click('.layer:last-child [data-act=save]'); await wait();
  ok('your own hints are listed', (await p.textContent('#hintScroll')).includes('Shop sign'));
  await p.screenshot({ path: shot + 'hints.png' });
  await p.click('.reg[data-region="OOT_LOST_WOODS"]'); await wait();
  ok('an item hint shows on its check', (await p.textContent('.row[data-id="OOT Lost Woods Skull Kid"]')).includes('Lens of Truth'));

  /* Map */
  await p.click('[data-checks-view=map]'); await p.waitForSelector('.map-grid .tile');
  ok('map shows overworld tiles', (await p.$$('.map-grid .tile')).length > 40);
  ok('map shows dungeons', (await p.$$('.board .tile-row .tile')).length > 8);
  ok('map tiles show reachable areas', (await p.$$('.tile.open')).length > 0);
  await p.screenshot({ path: shot + 'map.png' });
  await p.click('.tile[data-region="OOT_KAKARIKO"]'); await wait();
  ok('tapping a tile opens that area', (await p.textContent('.section-head h2')).includes('Kakariko'));

  /* Edit mode on the new screens */
  await p.click('[data-checks-view=map]'); await p.waitForSelector('.map-grid .tile');
  await p.click('.rail [data-editmode]'); await wait();
  await p.click('.tile[data-region="OOT_KAKARIKO"] .tn'); await p.waitForSelector('#edSpot');
  await p.fill('#edSpot', '1, 6'); await p.click('.layer:last-child [data-act=save]'); await wait();
  ok('edit mode moves an area on the map', (await p.getAttribute('.tile[data-region="OOT_KAKARIKO"]', 'style')).includes('grid-row:6'));
  await p.click('[data-checks-view=list]'); await wait();
  ok('view switch works in edit mode', !!(await p.$('#listScroll')));
  await p.click('.rail .tab[data-tab=items]'); await p.waitForSelector('.item-btn');
  await p.click('.item-btn .t >> nth=0'); await p.waitForSelector('#edName');
  await p.fill('#edName', 'My item'); await p.click('.layer:last-child [data-act=save]'); await wait();
  ok('edit mode renames an item', (await p.textContent('#itemScroll')).includes('My item'));
  await p.click('.rail .tab[data-tab=hints]'); await p.waitForSelector('[data-hint]');
  await p.click('[data-hint] .t >> nth=1'); await p.waitForSelector('[data-act=write]');
  await p.fill('#edName', 'Talking rock'); await p.click('.layer:last-child [data-act=save]'); await wait();
  ok('edit mode renames a stone', (await p.textContent('#hintScroll')).includes('Talking rock'));
  await p.click('.rail [data-editmode]'); await wait();


  /* Saves and transfer */
  await p.reload(); await p.waitForSelector('.row'); await waitLogic();
  ok('items and hints survive a reload', (await reach()) >= more && (await store()).seeds[0].hints && Object.keys((await store()).seeds[0].hints).length === 2);
  await p.click('.rail .tab[data-tab=seeds]'); await p.waitForSelector('[data-copycode]');
  await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('x')); });
  await p.click('[data-copycode]'); await p.waitForFunction(() => document.querySelector('#codeBox').value.startsWith('OOTMM1.'), null, { timeout: 10000 });
  const code = await p.inputValue('#codeBox');
  const c2 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const q = await c2.newPage(); q.on('pageerror', e => errs.push(String(e)));
  await q.goto('http://localhost:8936/'); await q.waitForSelector('.row');
  await q.click('.rail .tab[data-tab=seeds]'); await q.fill('#codeBox', code); await q.click('[data-readcode]'); await q.waitForTimeout(800);
  const t2 = await q.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const n2 = t2.seeds.find(x => x.id === t2.current);
  ok('transfer code carries items and hints', Object.keys(n2.found).length === 1 && Object.keys(n2.hints).length === 2 && Object.keys(n2.have).length > 0);

  /* Older saves without the new fields */
  const c3 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const o = await c3.newPage(); o.on('pageerror', e => errs.push(String(e)));
  await o.goto('http://localhost:8936/'); await o.waitForSelector('.row');
  const old = await store();
  await o.evaluate(([k, s]) => {
    for (const x of s.seeds) { delete x.found; delete x.have; delete x.hints; }
    delete s.edits.items; delete s.edits.stones;
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, old]);
  await o.reload(); await o.waitForSelector('.row');
  await o.click('.rail .tab[data-tab=items]'); await o.waitForSelector('.item-btn', { timeout: 60000 });
  await o.click('.rail .tab[data-tab=hints]'); await o.waitForSelector('[data-hint]');
  ok('older saves open the new tabs', true);

  /* Pre-completed dungeons */
  await p.click('.rail .tab[data-tab=settings]'); await p.waitForSelector('#setSearch');
  await p.fill('#setSearch', 'Pre-Completed Dungeons'); await wait(300);
  await p.click('[data-bool=preCompletedDungeons]');
  await p.waitForSelector('[data-precomplete="Water"]', { timeout: 30000 }).catch(() => {});
  const pre = await p.$$eval('[data-precomplete]', e => e.map(x => x.textContent));
  ok('pre-completed dungeons can be picked', pre.length >= 12, pre.join(', '));
  await p.click('[data-precomplete="Water"]'); await wait(400);
  const sp = await store();
  const sc = sp.seeds.find(x => x.id === sp.current);
  ok('picking one saves it and skips its area', sc.preCompleted.includes('Water') && sc.skippedRegions.some(r => /WATER/.test(r)), sc.skippedRegions.join(', '));
  await p.click('[data-precomplete="Water"]'); await wait(400);
  const sp2 = await store();
  const sc2 = sp2.seeds.find(x => x.id === sp2.current);
  ok('unpicking it brings the area back', !sc2.preCompleted.length && !sc2.skippedRegions.some(r => /WATER/.test(r)));
  await p.click('[data-bool=preCompletedDungeons]'); await wait(400);
  await p.fill('#setSearch', ''); await wait(200);

  /* Logic off */
  await p.click('.rail .tab[data-tab=items]'); await p.waitForSelector('[data-logic-toggle]');
  await p.click('[data-logic-toggle]'); await wait();
  await p.click('.rail .tab[data-tab=list]'); await wait();
  ok('logic can be turned off', (await p.$$('.row.inlogic, .row.outlogic, #logicPill')).length === 0);
  await p.click('.rail .tab[data-tab=items]'); await p.click('[data-logic-toggle]'); await wait();

  /* Phone */
  const ph = await b.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const m = await ph.newPage(); m.on('pageerror', e => errs.push(String(e)));
  await m.goto('http://localhost:8936/'); await m.waitForSelector('.reg');
  ok('phone bottom bar fits every tab', await m.evaluate(() => [...document.querySelectorAll('.bottom > *')].every(e => e.getBoundingClientRect().right <= innerWidth + 1)));
  await m.click('.bottom .tab[data-tab=items]'); await m.waitForSelector('.item-btn', { timeout: 60000 });
  ok('no sideways scroll on phone items', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await m.screenshot({ path: shot + 'phone-items.png' });
  await m.click('.bottom .tab[data-tab=hints]'); await m.waitForSelector('[data-hint]');
  await m.screenshot({ path: shot + 'phone-hints.png' });
  await m.click('.bottom .tab[data-tab=list]'); await m.click('.reg >> nth=0'); await m.click('[data-checks-view=map]'); await m.waitForSelector('.map-grid .tile');
  ok('no sideways scroll on phone map', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await m.screenshot({ path: shot + 'phone-map.png' });

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
})();
