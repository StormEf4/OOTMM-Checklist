const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
(async () => {
  await new Promise(r => srv.listen(8932, r));
  const b = await chromium.launch();
  /* The sidebar's headings start folded in the app; these tests open them all to reach areas. */
  { const nc = b.newContext.bind(b); b.newContext = async o => { const c = await nc(o); await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; }); return c; }; }
  const errs = [];
  const open = async o => { const c = await b.newContext(o); const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto('http://localhost:8932/'); await p.waitForSelector('#regions .reg[data-region^="OOT_"]'); return p; };
  const pc = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const tab = (p, t) => p.click(`.rail .tab[data-tab=${t}]`);

  // settings string from OoTMM format
  await tab(pc, 'settings');
  await pc.fill('#importText', 'v2.q1ZKzi8PzihNS8tJ9c8vUbIqKSpNrQUA');
  await pc.click('[data-import]'); await pc.waitForTimeout(700);
  ok('settings string import', (await pc.textContent('#countPill')).includes('545'), await pc.textContent('#countPill'));

  // real spoiler log: settings, MQ rolls, pre-completed dungeons
  await pc.setInputFiles('#importFile', '.cache/spoiler-sample.txt'); await pc.waitForTimeout(1200);
  const st = await pc.evaluate(() => { localStorage; return 1; });
  await tab(pc, 'list'); await pc.waitForTimeout(250);
  const areas = await pc.$$eval('.reg .n', e => e.map(x => x.textContent));
  const skipped = await pc.$$eval('.reg .c', e => e.filter(x => x.textContent === 'Skipped').length);
  ok('spoiler: pre-completed dungeons skipped', skipped >= 2, `skipped areas ${skipped}`);
  const body = await pc.textContent('#listScroll');
  ok('spoiler: nothing beyond the header is stored', !(await pc.evaluate(() => localStorage.getItem('ootmm-checklist-v1'))).includes('Hookshot'));
  await pc.waitForTimeout(350);
  const saved1 = await pc.evaluate(() => JSON.parse(localStorage.getItem('ootmm-checklist-v1')).seeds[0]);
  ok('spoiler: MQ rolls stored', (saved1.rolled.mqDungeons ?? []).length > 0, JSON.stringify(saved1.rolled.mqDungeons));
  ok('answered rolls clear the banner', !(await pc.textContent('#listScroll')).includes('rolls some layouts'));

  // tick, skip, custom
  await pc.click('.reg[data-region="OOT_KOKIRI_FOREST"]'); await pc.click('.row .tick-btn'); await pc.waitForTimeout(100);
  await pc.click('.reg[data-region="OOT_LOST_WOODS"]'); const before = await pc.textContent('#remain');
  await pc.click('.row .skip'); await pc.waitForTimeout(100);
  ok('skip removes a check from the total', before !== await pc.textContent('#remain'), `${before} -> ${await pc.textContent('#remain')}`);
  await pc.click('.rail [data-editmode]'); await pc.waitForTimeout(250);
  await pc.click('.editbar [data-add-check]'); await pc.waitForSelector('#edName');
  await pc.fill('#edName', 'Fork test check'); await pc.fill('#edArea', 'Kokiri Forest'); await pc.click('[data-act=save]'); await pc.waitForTimeout(300);
  await pc.click('.rail [data-editmode]'); await pc.waitForTimeout(250);
  await pc.click('.reg[data-region="OOT_KOKIRI_FOREST"]'); await pc.waitForTimeout(200);
  ok('custom check joins its area', (await pc.textContent('#listScroll')).includes('Fork test check'));

  // transfer to a fresh phone
  await tab(pc, 'seeds'); await pc.waitForTimeout(350);
  await pc.click('[data-copycode]'); await pc.waitForTimeout(250);
  const code = await pc.inputValue('#codeBox').catch(() => '');
  const made = code || await pc.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok('transfer code made', made.startsWith('OOTMM1.'), `${made.length} characters`);
  const ph = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ph.tap('.bottom .tab[data-tab=seeds]'); await ph.waitForSelector('#codeBox');
  await ph.fill('#codeBox', made); await ph.tap('[data-readcode]'); await ph.waitForTimeout(900);
  const pcLeft = await pc.textContent('#remain'), phLeft = await ph.textContent('#remain');
  ok('phone total matches PC after transfer', pcLeft === phLeft, `pc ${pcLeft} | phone ${phLeft}`);
  await ph.tap('.bottom .tab[data-tab=list]'); await ph.waitForTimeout(250);
  await ph.screenshot({ path: '.cache/shots/phone-dark.png' });
  // phone progress comes back to the same seed on PC
  await ph.tap('.reg[data-region="OOT_HYRULE_FIELD"]'); await ph.waitForTimeout(200);
  const fieldTotal = (await ph.textContent('[data-count="OOT_HYRULE_FIELD"]')).split('/')[1];
  await ph.tap('.row .tick-btn'); await ph.waitForTimeout(150);
  ok('area count updates on tick', (await ph.textContent('[data-count="OOT_HYRULE_FIELD"]')) === `1/${fieldTotal}`, await ph.textContent('[data-count="OOT_HYRULE_FIELD"]'));
  await ph.waitForTimeout(350);
  await ph.tap('.bottom .tab[data-tab=seeds]'); await ph.waitForSelector('[data-copycode]');
  await ph.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('blocked')); });
  await ph.tap('[data-copycode]'); await ph.waitForTimeout(200);
  const back = await ph.inputValue('#codeBox');
  await pc.fill('#codeBox', back); await pc.click('[data-readcode]'); await pc.waitForTimeout(800);
  ok('code back on PC updates the same seed', (await pc.$$eval('.seed .nmz', e => e.length)) === 1 && (await pc.textContent('#remain')) === '514 of 516 left', await pc.textContent('#remain'));
  await pc.fill('#codeBox', 'garbage'); await pc.click('[data-readcode]'); await pc.waitForTimeout(150);
  ok('bad code explains itself', (await pc.textContent('#toast')).includes('transfer code'), await pc.textContent('#toast'));

  // progress view
  await pc.evaluate(() => { document.querySelector('.reg').click(); });
  await pc.waitForTimeout(150);
  const n = await pc.$$eval('.tick-btn', e => { e.slice(0, 300).forEach(x => x.click()); return e.length; });
  await pc.waitForTimeout(700);
  await pc.screenshot({ path: '.cache/shots/pc-progress.png' });
  console.log('page errors', errs.length, errs.slice(0, 3));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
