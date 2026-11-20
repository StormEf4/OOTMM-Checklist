/* Every area on the Entrances tab lists its own ways in and out: roads the settings shuffle can be logged, the rest
   show as "Not shuffled". Run with NODE_PATH=$(npm root -g) node tools/ui-roads.cjs */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const shot = n => `.cache/shots/${n}.png`;
(async () => {
  fs.mkdirSync('.cache/shots', { recursive: true });
  await new Promise(r => srv.listen(8979, r));
  const b = await chromium.launch();
  const errs = [];
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8979/'); await p.waitForSelector('#regions .reg');
  await p.click('.rail .tab[data-tab=entrances]'); await p.waitForTimeout(300);
  ok('with nothing shuffled the tab still says so', (await p.textContent('#pane')).includes('No entrances are shuffled'));

  await p.click('[data-open-entr-settings]'); await p.waitForSelector('[data-enum=erGrottos]');
  await p.selectOption('[data-enum=erGrottos]', 'full'); await p.waitForTimeout(800);
  await p.click('.rail .tab[data-tab=entrances]'); await p.waitForSelector('.entr-btn');
  const parts = async id => { await p.click(`#regions [data-entr-region="${id}"]`); await p.waitForTimeout(300);
    return p.$$eval('#entrScroll .dir-part', ds => ds.map(d => [d.querySelector('.dir-name').textContent, [...d.querySelectorAll('.entr-btn')].map(b => ({ t: b.querySelector('.t').textContent, s: b.querySelector('.s')?.textContent ?? '', fixed: !!b.querySelector('.fixed-tag') }))])); };
  const part = (ps, name) => (ps.find(x => x[0] === name) ?? [0, []])[1];
  let llr = await parts('OOT_LON_LON_RANCH');
  ok('Lon Lon Ranch lists its way in and way out first', llr[0][0] === 'Ways in' && llr[1][0] === 'Ways out', JSON.stringify(llr.map(x => x[0])));
  ok('they name Hyrule Field and say they are not shuffled', part(llr, 'Ways in').some(r => r.t === 'From Hyrule Field' && r.fixed) && part(llr, 'Ways out').some(r => r.t === 'To Hyrule Field' && r.fixed));
  const pill = await p.textContent('#pane .pill');
  await p.click('#entrScroll .row.fixed .entr-btn'); await p.waitForTimeout(200);
  ok('a road that is not shuffled has nothing to log', !(await p.$('#pickList')) && /isn't shuffled/.test(await p.textContent('#toast')));
  ok('roads that are not shuffled stay out of the logged count', /of \d+ logged/.test(pill) && (await p.textContent('#regions [data-entr-region="OOT_LON_LON_RANCH"] .c')) === '0/2', pill);
  const woods = await parts('OOT_LOST_WOODS');
  const kf = part(woods, 'Ways in').filter(r => r.t === 'From Kokiri Forest');
  ok('two roads between the same areas tell themselves apart', kf.length === 2 && kf[0].s !== kf[1].s, JSON.stringify(kf));
  const tf = await parts('MM_TERMINA_FIELD');
  ok('Termina areas get their roads too', part(tf, 'Ways out').length > 3 && part(tf, 'Ways in').length > 3);
  await p.screenshot({ path: shot('roads-fixed') });

  // regions shuffled: the same rows can be logged, from either area
  await p.click('.rail .tab[data-tab=settings]'); await p.waitForSelector('[data-enum=erRegions]');
  await p.selectOption('[data-enum=erRegions]', 'full'); await p.waitForTimeout(1200);
  await p.click('.rail .tab[data-tab=entrances]'); await p.waitForSelector('.entr-btn');
  llr = await parts('OOT_LON_LON_RANCH');
  ok('shuffled roads can be logged', !part(llr, 'Ways out')[0]?.fixed && !part(llr, 'Ways in')[0]?.fixed);
  await p.click('#entrScroll .dir-exit .entr-btn'); await p.waitForSelector('#pickList');
  await p.click('#pickList .pick >> nth=0'); await p.waitForTimeout(400);
  ok('a logged way out shows where it leads', !!(await p.$('#entrScroll .dir-exit .row.done .leads')));
  const back = await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return a.seeds.find(s => s.id === a.current).entrances.OOT_FIELD_FROM_LON_LON_RANCH; });
  ok('it is saved under the ranch\'s own way out', !!back, back);
  await p.screenshot({ path: shot('roads-shuffled') });
  const hf = await parts('OOT_HYRULE_FIELD');
  ok('the same road shows under Hyrule Field as a way in, already logged', await p.$$eval('#entrScroll .dir-enter .row.done .t', ts => ts.some(t => t.textContent === 'From Lon Lon Ranch')) && part(hf, 'Ways out').some(r => r.t === 'To Lon Lon Ranch'));
  await p.click('[data-entr-dir=out]'); await p.waitForTimeout(200);
  ok('Coming out shows only ways out', (await p.$$('#entrScroll .dir-enter')).length === 0 && (await p.$$('#entrScroll .dir-exit')).length === 1);
  await p.click('[data-entr-dir=all]'); await p.waitForTimeout(100);
  await p.click('#regions [data-entr-region=""]'); await p.waitForTimeout(200);
  await p.fill('#entrSearch', 'lon lon ranch'); await p.waitForTimeout(300);
  const heads = await p.$$eval('#entrScroll section h2', h => h.map(x => x.dataset.edit));
  ok('search lists each area once', new Set(heads).size === heads.length && heads.includes('area:OOT_LON_LON_RANCH'), heads.join());
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close(); srv.close();
})().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
