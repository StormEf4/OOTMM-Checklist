const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const shot = n => `.cache/shots/${n}.png`;
(async () => {
  await new Promise(r => srv.listen(8933, r));
  const b = await chromium.launch();
  const errs = [];
  const open = async o => { const c = await b.newContext(o); const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto('http://localhost:8933/'); await p.waitForSelector('#regions .reg:nth-child(3)'); return p; };
  const pc = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('ootmm-checklist-v1')).seeds[0]);

  // nothing shuffled yet
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForTimeout(150);
  ok('empty state explains itself', (await pc.textContent('#pane')).includes('No entrances are shuffled'));
  await pc.click('[data-open-entr-settings]'); await pc.waitForSelector('[data-enum=erGrottos]');
  ok('entrance settings show in the short list', (await pc.$$('[data-enum=erDungeons]')).length === 1);

  // turn on real settings through the UI
  await pc.selectOption('[data-enum=erGrottos]', 'full'); await pc.waitForTimeout(500);
  await pc.selectOption('[data-enum=erDungeons]', 'full'); await pc.waitForTimeout(500);
  await pc.click('[data-bool=erMajorDungeons]'); await pc.waitForTimeout(600);
  await pc.selectOption('[data-enum=erSpawns]', 'both'); await pc.waitForTimeout(600);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  const firstSec = await pc.$eval('#entrScroll section', s => [s.className, s.querySelector('h2').textContent, [...s.querySelectorAll('.entr-btn')].map(b => b.textContent.trim().slice(0, 11)).join('|')]);
  ok('spawns open the list, child first', firstSec[0].includes('spawn-sec') && /Child spawn\|Adult spawn/.test(firstSec[2]), firstSec.join(' / '));
  const listed = await pc.$$eval('.entr-btn', e => e.length);
  ok('settings fill the list', listed > 100, `${listed} entrances`);
  ok('every entrance starts unlogged', (await pc.$$eval('.entr.done', e => e.length)) === 0);
  await pc.screenshot({ path: shot('er-pc-list') });

  // log one, way back fills
  await pc.fill('#entrSearch', 'Entrance to Deku Tree'); await pc.waitForTimeout(250);
  await pc.click('.entr-btn'); await pc.waitForSelector('.pick');
  await pc.screenshot({ path: shot('er-pc-picker') });
  const places = await pc.$$eval('.pick .t', e => e.map(x => x.textContent));
  ok('picker offers only dungeon places', places.includes('Fire Temple') && !places.some(x => /Grotto|Kokiri Forest$/.test(x)), `${places.length} places`);
  await pc.fill('#pickSearch', 'fire temple'); await pc.waitForTimeout(200);
  await pc.click('.pick'); await pc.waitForTimeout(400);
  ok('logged entrance shows its place', (await pc.textContent('#entrScroll')).includes('Leads to Fire Temple'));
  let s = await store(pc);
  ok('way back is filled in', s.entrances.OOT_TEMPLE_FIRE === undefined && Object.keys(s.entrances).length === 2 && s.entrances.OOT_DEKU_TREE === 'OOT_TEMPLE_FIRE' && s.entrances.OOT_DEATH_CRATER_FROM_TEMPLE_FIRE === 'OOT_KOKIRI_FOREST_FROM_DEKU_TREE', JSON.stringify(s.entrances));

  // used places drop to the bottom, and moving one releases the old holder
  await pc.fill('#entrSearch', 'Entrance to Dodongo'); await pc.waitForTimeout(250);
  await pc.click('.entr-btn'); await pc.waitForSelector('.pick');
  ok('taken place is marked', (await pc.textContent('#pickList')).includes('Already logged elsewhere'));
  await pc.fill('#pickSearch', 'fire temple'); await pc.waitForTimeout(200);
  await pc.click('.pick[data-pick=OOT_TEMPLE_FIRE]'); await pc.waitForTimeout(400);
  s = await store(pc);
  ok('moving a place releases the old entrance', !s.entrances.OOT_DEKU_TREE && s.entrances.OOT_DODONGO_CAVERN === 'OOT_TEMPLE_FIRE', JSON.stringify(s.entrances));
  await pc.click('.entr-btn'); await pc.waitForSelector('[data-act=clear]');
  await pc.click('[data-act=clear]'); await pc.waitForTimeout(400);
  s = await store(pc);
  ok('clearing removes both directions', Object.keys(s.entrances).length === 0, JSON.stringify(s.entrances));

  // search by where it leads, reload keeps it
  await pc.fill('#entrSearch', 'Entrance to Deku Tree'); await pc.waitForTimeout(250);
  await pc.click('.entr-btn'); await pc.waitForSelector('.pick');
  await pc.fill('#pickSearch', 'water temple'); await pc.waitForTimeout(200); await pc.click('.pick'); await pc.waitForTimeout(350);
  await pc.fill('#entrSearch', 'water temple'); await pc.waitForTimeout(250);
  ok('search finds entrances by destination', (await pc.textContent('#entrScroll')).includes('Entrance to Deku Tree'));
  await pc.reload(); await pc.waitForSelector('.reg');
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  ok('log survives a reload', (await pc.textContent('#entrScroll')).includes('Leads to Water Temple'));

  // a spoiler log must fill nothing in
  const log = fs.readFileSync('.cache/spoiler-er.txt', 'utf8');
  ok('sample spoiler really has entrances', /\) +-> .*\(/.test(log));
  await pc.click('.rail .tab[data-tab=seeds]'); await pc.click('[data-new]'); await pc.waitForTimeout(500);
  await pc.click('.rail .tab[data-tab=settings]'); await pc.waitForSelector('#importFile');
  await pc.setInputFiles('#importFile', '.cache/spoiler-er.txt'); await pc.waitForTimeout(1500);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  const after = await pc.evaluate(() => { const a = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return a.seeds.find(s => s.id === a.current); });
  const n = await pc.$$eval('.entr-btn', e => e.length);
  ok('spoiler import sets the list but logs nothing', n === 288 && Object.keys(after.entrances).length === 0 && (await pc.$$eval('.leads', e => e.length)) === 0, `${n} listed, ${Object.keys(after.entrances).length} logged`);

  // phone: transfer + flow
  await pc.evaluate(() => { document.querySelector('.rail .tab[data-tab=seeds]').click(); });
  await pc.waitForSelector('#seedList');
  await pc.click('[data-open]:not(.none) >> nth=1').catch(() => {});
  await pc.waitForTimeout(500);
  await pc.click('.rail .tab[data-tab=seeds]'); await pc.waitForSelector('[data-copycode]');
  await pc.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('x')); });
  await pc.click('[data-copycode]'); await pc.waitForTimeout(200);
  const code = await pc.inputValue('#codeBox');
  const srcSeed = await pc.evaluate(() => { const a = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return a.seeds.find(s => s.id === a.current).entrances; });
  const ph = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await ph.tap('.bottom .tab[data-tab=seeds]'); await ph.waitForSelector('#codeBox');
  await ph.fill('#codeBox', code); await ph.tap('[data-readcode]'); await ph.waitForTimeout(900);
  const moved = await ph.evaluate(() => { const a = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return a.seeds.find(s => s.id === a.current).entrances; });
  ok('transfer code carries the log', JSON.stringify(moved) === JSON.stringify(srcSeed), `${Object.keys(moved).length} entries, code ${code.length} chars`);
  await ph.tap('.bottom .tab[data-tab=entrances]'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: shot('er-phone-rail') });
  const firstArea = ph.locator('.reg[data-entr-region]').nth(1);
  if (await firstArea.count()) { await firstArea.tap(); await ph.waitForTimeout(250); await ph.screenshot({ path: shot('er-phone-list') });
    await ph.locator('.entr-btn').first().tap(); await ph.waitForSelector('.pick'); await ph.screenshot({ path: shot('er-phone-picker') });
    ok('phone has no sideways scroll', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    await ph.keyboard.press('Escape'); await ph.waitForTimeout(100);
    ok('picker closes', (await ph.$$('.sheet')).length === 0);
  } else ok('phone shows an area list', false);
  // saves from before this tab existed
  const oldC = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await oldC.addInitScript(() => { localStorage.setItem('ootmm-checklist-v1', JSON.stringify({ v: 1, current: 'a', custom: [], ui: {}, seeds: [{ id: 'a', name: 'Old seed', settings: 'v2.q1ZKzi8PzihNS8tJ9c8vUbIqKSpNrQUA', done: ['OOT Kokiri Forest Kokiri Sword Chest'], skipped: [], skippedRegions: [], rolled: {}, updated: 1 }] })); });
  const old = await oldC.newPage(); old.on('pageerror', e => errs.push(String(e)));
  await old.goto('http://localhost:8933/'); await old.waitForSelector('.row');
  await old.click('.rail .tab[data-tab=entrances]'); await old.waitForTimeout(200);
  await old.click('.rail .tab[data-tab=seeds]'); await old.waitForTimeout(200);
  ok('older saves still open', (await old.textContent('#remain')).startsWith('545 of 546'), await old.textContent('#remain'));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close(); srv.close();
})().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
