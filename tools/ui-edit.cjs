const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const KEY = 'ootmm-checklist-v1';
(async () => {
  await new Promise(r => srv.listen(8934, r));
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8934/'); await p.waitForSelector('.row');
  const wait = (ms = 300) => p.waitForTimeout(ms);
  const toggle = async () => { await p.click('.rail [data-editmode]'); await wait(250); };
  const store = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const saveText = async v => { await p.fill('#edText', v); await p.click('.layer:last-child [data-act=save]'); await wait(); };

  ok('default theme is Hero of Time with hearts', (await p.evaluate(() => document.documentElement.dataset.skin)) === 'hero' && (await p.$$('.heart-row svg')).length === 20);
  ok('editing is off to start', !(await p.evaluate(() => document.body.classList.contains('editing'))));
  await p.click('.row .tick-btn >> nth=0'); await wait();
  ok('ticking works when off', (await p.textContent('#remain')).startsWith('536'));

  await toggle();
  ok('button shows it is on', (await p.textContent('.rail [data-editmode]')).includes('on') && (await p.getAttribute('.rail [data-editmode]', 'aria-pressed')) === 'true');
  const before = await p.textContent('#remain');
  await p.click('.row .tick-btn .t >> nth=1'); await p.waitForSelector('#edName');
  ok('tapping a check edits instead of ticking', (await p.textContent('#remain')) === before);

  // check: rename, note, move
  await p.fill('#edName', 'My renamed check'); await p.fill('#edNote', 'Hookshot here'); await p.fill('#edArea', 'Secret Grove'); await p.click('[data-act=save]'); await wait();
  ok('check renamed and moved to a new area', (await p.textContent('#regions')).includes('Secret Grove'));
  ok('rename and note show on the list', (await p.textContent('#listScroll')).includes('My renamed check') && (await p.textContent('#listScroll')).includes('Hookshot here'));

  // any on-screen words, with live numbers
  await p.click('#remain'); await p.waitForSelector('#edText');
  ok('live numbers become placeholders', (await p.inputValue('#edText')) === '{1} of {2} left', await p.inputValue('#edText'));
  await saveText('{1} rupees to go out of {2}');
  ok('edited phrase shows', (await p.textContent('#remain')).includes('rupees to go'), await p.textContent('#remain'));

  // toolbar button: rename, press through, hide, restore
  await p.click('[data-hidedone]'); await p.waitForSelector('#edText');
  await saveText('Tuck away finished');
  ok('button label edited', (await p.textContent('[data-hidedone]')) === 'Tuck away finished');
  await p.click('[data-hidedone]'); await p.waitForSelector('[data-act=hide]'); await p.click('[data-act=hide]'); await wait();
  ok('hidden part stays visible but dimmed in edit mode', await p.$eval('[data-hidedone]', e => e.classList.contains('ghost') && getComputedStyle(e).display !== 'none'));

  // placeholder
  await p.click('#search', { force: true }); await p.waitForSelector('#edText');
  await saveText('Find a check');
  ok('placeholder edited', (await p.getAttribute('#search', 'placeholder')) === 'Find a check');

  // area name via pencil, keeps nav
  await p.hover('.reg[data-region="OOT_LOST_WOODS"]');
  await p.click('.reg[data-region="OOT_LOST_WOODS"] .pen'); await p.waitForSelector('#edName');
  await p.fill('#edName', 'Home Village'); await p.click('[data-act=save]'); await wait();
  ok('area renamed', (await p.textContent('#regions')).includes('Home Village'));
  await p.click('.reg[data-region="OOT_HYRULE_FIELD"]'); await wait(200);
  ok('areas still navigate in edit mode', (await p.textContent('.section-head h2')).includes('Hyrule Field'));

  // tab: rename, icon, reorder; tabs navigate
  await p.click('.rail .tab[data-tab=seeds] .pen'); await p.waitForSelector('#edIcon');
  await p.fill('#edName', 'Files'); await p.fill('#edIcon', '★'); await p.click('[data-act=save]'); await wait();
  ok('tab renamed with a new icon', (await p.textContent('.rail .tab[data-tab=seeds]')).includes('Files') && (await p.textContent('.rail .tab[data-tab=seeds] .tab-ic')).includes('★'));
  await p.click('.rail .tab[data-tab=seeds] .pen'); await p.waitForSelector('[data-act=left]'); await p.click('[data-act=left]'); await wait();
  ok('tab moved', (await p.$$eval('.rail .tab', e => e.map(x => x.dataset.tab))).join() === 'list,entrances,notes,items,seeds,settings');

  // settings: name, description, dropdown choices
  await p.click('.rail .tab[data-tab=settings]'); await p.waitForSelector('#setScroll');
  await p.evaluate(() => { document.querySelector('[data-setview]'); });
  await p.fill('#setSearch', 'cow', { force: true }).catch(() => {});
  await p.evaluate(() => { const i = document.querySelector('#setSearch'); i.value = 'cow'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(400);
  await p.click('.cat .set .lab b >> nth=0'); await p.waitForSelector('#edText'); await saveText('Moo Shuffle');
  ok('setting renamed', (await p.textContent('#setScroll')).includes('Moo Shuffle'));
  await p.click('.cat .set .desc >> nth=0'); await p.waitForSelector('#edText'); await saveText('Cows get loot.');
  ok('setting description edited', (await p.textContent('#setScroll')).includes('Cows get loot.'));
  await p.evaluate(() => { const i = document.querySelector('#setSearch'); i.value = 'gold skulltula tokens shuffle'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(400);
  await p.click('.ctl:has(select[data-enum=goldSkulltulaTokens])', { position: { x: 20, y: 12 } }); await p.waitForSelector('[data-act=o0]');
  await p.click('[data-act=o0]'); await p.waitForSelector('#edText'); await saveText('Leave them alone');
  ok('dropdown choice edited', (await p.textContent('select[data-enum=goldSkulltulaTokens]')).includes('Leave them alone'));
  await p.evaluate(() => { const i = document.querySelector('#setSearch'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);

  // a window's own wording
  await p.click('.rail .tab[data-tab=list]'); await wait(250);
  await p.click('.editbar [data-add-check]'); await p.waitForSelector('[data-act=__wording]');
  await p.click('[data-act=__wording]'); await wait(100);
  await p.click('.layer .sheet-head h2'); await p.waitForSelector('#edText'); await saveText('New quest');
  await p.click('.editbar [data-add-check]'); await wait(200);
  ok('text inside a window can be edited', (await p.textContent('.layer .sheet-head h2')) === 'New quest');
  await p.click('.layer .btn[data-sheet-close]'); await wait(150);

  // always-working buttons get a pencil for their wording
  await p.click('.editbar [data-undo] .pen'); await p.waitForSelector('#edText'); await saveText('Oops');
  ok('edit bar wording can change', (await p.textContent('.editbar [data-undo]')).includes('Oops'));
  await p.click('.reg[data-region=""] .pen'); await p.waitForSelector('#edText'); await saveText('The whole world');
  ok('All areas row can be reworded', (await p.textContent('#regions')).includes('The whole world'));
  await p.click('#seedName'); await p.waitForSelector('#edName'); await p.fill('#edName', 'Ganon Run'); await p.click('.layer:last-child [data-act=save]'); await wait();
  ok('seed title edits the seed', (await p.textContent('#seedName')) === 'Ganon Run');
  await p.click('.rail .tab[data-tab=settings]'); await wait(200); await p.click('[data-setview=look]'); await wait(200);
  await p.click('.box h3:has-text("OoTMM Checklist")'); await p.waitForSelector('#edText'); await saveText('Eli Tracker');
  ok('app name changes the window title', (await p.title()) === 'Eli Tracker', await p.title());
  await p.click('.rail .tab[data-tab=list]'); await wait(250);

  // colors from the background, and the locked button
  await p.click('.editbar [data-open-colors]'); await p.waitForSelector('[data-color=bg]');
  await p.$eval('[data-color=bg]', e => { e.value = '#112233'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(150);
  ok('colors change live', (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'))).trim() === '#112233');
  await p.selectOption('[data-seal]', { label: 'Diamond' }); await p.selectOption('[data-pattern]', 'none'); await wait(150);
  ok('check shape and pattern can change', (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--clip'))).includes('100% 50%') && (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pattern'))).trim() === 'none');
  await p.click('.layer .btn[data-sheet-close]'); await wait(150);
  await p.click('.reg[data-region="OOT_HYRULE_FIELD"]'); await wait(200);
  const blank = await p.$('.scroll'); const bb = await blank.boundingBox();
  await p.mouse.click(bb.x + bb.width - 12, bb.y + bb.height - 12); await wait(250);
  ok('tapping empty background opens colors', !!(await p.$('[data-color=bg]')));
  if (await p.$('.layer')) { await p.click('.layer .btn[data-sheet-close]'); await wait(150); }
  const raw = await store();
  await p.evaluate(() => { document.querySelector('.rail [data-editmode] span').click; });
  // try to break the lock: force a text edit for its label
  await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.edits.text['Edit mode'] = 'Hacked'; s.edits.hide['Edit mode'] = 'self'; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await p.waitForTimeout(350);
  await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.edits.text['Edit mode'] = 'Hacked'; s.edits.hide['Edit mode'] = 'self'; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await p.reload(); await p.waitForSelector('.row');
  const lockTxt = await p.textContent('.rail [data-editmode]');
  ok('edit mode button cannot be renamed or hidden', lockTxt.trim() === 'Edit mode' && !(await p.$eval('.rail [data-editmode]', e => e.classList.contains('ghost'))), lockTxt);

  // reload kept everything, editing is off again
  ok('edits survive a reload', (await p.textContent('#regions')).includes('Home Village') && (await p.textContent('#remain')).includes('rupees to go'));
  ok('edit mode is off after reload', !(await p.evaluate(() => document.body.classList.contains('editing'))));
  ok('hidden button is gone when off', await p.$eval('[data-hidedone]', e => getComputedStyle(e).display === 'none'));
  await p.click('.row .tick-btn >> nth=2'); await wait();
  ok('ticking works again', /^534/.test(await p.textContent('#remain')) || /^535/.test(await p.textContent('#remain')), await p.textContent('#remain'));

  // undo
  const u1 = await p.textContent('#remain');
  await p.keyboard.press('Control+z'); await wait();
  ok('undo with the keyboard', (await p.textContent('#remain')) !== u1, await p.textContent('#remain'));

  // Your edits list, put back one, backup round trip
  await p.click('.rail .tab[data-tab=settings]'); await wait(200);
  await p.click('[data-setview=edits]'); await wait(200);
  const n = await p.$$eval('[data-undo-edit]', e => e.length);
  ok('all edits are listed', n >= 9, `${n} edits`);
  await p.goto('http://localhost:8934/'); await p.waitForSelector('.reg');
  await p.click('.rail .tab[data-tab=seeds]'); await p.waitForSelector('[data-backup]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-backup]')]);
  const file = '.cache/backup-test.json'; await dl.saveAs(file);
  const c2 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const q = await c2.newPage(); q.on('pageerror', e => errs.push(String(e)));
  await q.goto('http://localhost:8934/'); await q.waitForSelector('.row');
  await q.click('.rail .tab[data-tab=seeds]'); await q.waitForSelector('#backupFile');
  await q.setInputFiles('#backupFile', file); await q.waitForTimeout(900);
  ok('backup restores edits on another device', (await q.textContent('#regions')).includes('Home Village'));

  // transfer carries edits
  await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('x')); });
  await p.click('[data-copycode]'); await p.waitForFunction(() => document.querySelector('#codeBox').value.startsWith('OOTMM1.'), null, { timeout: 10000 });
  const code = await p.inputValue('#codeBox');
  const c3 = await b.newContext({ viewport: { width: 1280, height: 800 } }); const r = await c3.newPage();
  await r.goto('http://localhost:8934/'); await r.waitForSelector('.row');
  await r.click('.rail .tab[data-tab=seeds]'); await r.fill('#codeBox', code); await r.click('[data-readcode]'); await r.waitForTimeout(800);
  ok('transfer code carries edits', (await r.textContent('#regions')).includes('Home Village'), `code ${code.length} chars`);

  // put everything back
  await p.click('.rail .tab[data-tab=settings]'); await wait(200); await p.click('[data-setview=edits]'); await wait(200);
  await p.click('[data-reset-edits]'); await wait(80); await p.click('[data-reset-edits]'); await wait(400);
  ok('put everything back restores the original', (await p.textContent('#regions')).includes('Kokiri Forest') && !(await p.textContent('#regions')).includes('Home Village') && /left/.test(await p.textContent('#remain')));

  // old save moves over
  const old = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await old.addInitScript(k => { localStorage.setItem(k, JSON.stringify({ v: 1, current: 'a', custom: [{ id: 'z', name: 'Old custom', region: 'Kokiri Forest', game: 'oot' }], ui: { theme: 'dark' }, seeds: [{ id: 'a', name: 'Old seed', settings: 'v2.q1ZKzi8PzihNS8tJ9c8vUbIqKSpNrQUA', done: [], skipped: [], skippedRegions: [], rolled: {}, entrances: { OOT_DEKU_TREE: 'OOT_TEMPLE_FIRE' }, updated: 1 }] })); }, KEY);
  const o = await old.newPage(); o.on('pageerror', e => errs.push(String(e)));
  await o.goto('http://localhost:8934/'); await o.waitForSelector('.row');
  ok('older saves carry over', (await o.evaluate(() => document.documentElement.dataset.skin)) === 'termina' && (await o.textContent('#seedName')) === 'Old seed', await o.textContent('#remain'));

  // every theme, both sizes
  const ph = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); ph.on('pageerror', e => errs.push(String(e)));
  await ph.goto('http://localhost:8934/'); await ph.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]');
  const shots = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); shots.on('pageerror', e => errs.push(String(e)));
  await shots.goto('http://localhost:8934/'); await shots.waitForSelector('.row');
  await shots.$$eval('.tick-btn', e => e.slice(0, 200).forEach(x => x.click())); await shots.waitForTimeout(500);
  for (const s of ['hero', 'termina', 'zora', 'mountain', 'shadow', 'day']) {
    await shots.click('.rail .tab[data-tab=settings]'); await shots.waitForTimeout(100); await shots.click('[data-setview=look]'); await shots.waitForTimeout(100);
    await shots.click(`[data-skin-set=${s}]`); await shots.waitForTimeout(150);
    if (s === 'hero') await shots.screenshot({ path: '.cache/shots/skin-settings.png' });
    await shots.click('.rail .tab[data-tab=list]'); await shots.waitForTimeout(200);
    await shots.screenshot({ path: `.cache/shots/skin-${s}.png` });
  }
  await ph.tap('.bottom [data-editmode]'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: '.cache/shots/edit-phone-rail.png' });
  await ph.tap('.reg[data-region="OOT_LOST_WOODS"] .n'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: '.cache/shots/edit-phone-list.png' });
  ok('phone bottom bar holds edit mode', (await ph.textContent('.bottom [data-editmode]')).includes('Edit mode'));
  ok('no sideways scroll on phone', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 300));
  await b.close(); srv.close();
})().catch(e => { console.error(String(e).slice(0, 700)); process.exit(1); });
