// Browser test for the settings that sit outside OoTMM's main list (tricks, glitches, special conditions,
// starting items, junk locations), for settings that only matter with another one on, and for a random
// starting age. Run with NODE_PATH=$(npm root -g) node tools/ui-settings.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const shot = '.cache/shots/';
(async () => {
  fs.mkdirSync(shot, { recursive: true });
  await new Promise(r => srv.listen(8937, r));
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8937/'); await p.waitForSelector('.row');
  const wait = (ms = 400) => p.waitForTimeout(ms);
  const count = async () => Number((await p.textContent('#countPill')).replace(/[^\d]/g, ''));
  const reach = async () => Number((await p.textContent('#logicPill')).replace(/[^\d]/g, ''));
  const waitLogic = async () => { await p.waitForFunction(() => !/in logic now/.test(document.getElementById('logicPill')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => {}); await waitDone(); };
  const waitDone = async () => { await p.waitForFunction(() => /in logic now/.test(document.getElementById('logicPill')?.textContent ?? ''), null, { timeout: 90000 }); await wait(200); };
  const settings = async () => { await p.click('.rail .tab[data-tab=settings]'); await p.waitForSelector('#setScroll'); };
  const search = async q => { await p.fill('#setSearch', q); await wait(); };
  const toChecks = async () => { await p.click('.rail .tab[data-tab=list]'); await p.waitForSelector('.row'); };

  await waitDone();
  const startReach = await reach();

  /* A toggle that only matters with another one on still shows under "Changes your lists". */
  await settings();
  await p.click('[data-changes="1"]'); await wait();
  await search('grass shuffle (mm)');
  await p.selectOption('[data-enum=shuffleGrassMm]', 'all'); await wait(1500);
  await search('termina field grass');
  ok('Termina Field grass shows under Changes your lists', !!(await p.$('[data-bool=shuffleTFGrassMm]')));
  const before = await count();
  await p.click('[data-bool=shuffleTFGrassMm]'); await wait(1500);
  ok('Termina Field grass adds checks', (await count()) > before, `${before} -> ${await count()}`);

  /* Tricks and glitches */
  await search('backflip over mido');
  ok('tricks are listed', !!(await p.$('[data-trick=OOT_MIDO_SKIP]')));
  const was = await p.getAttribute('[data-trick=OOT_MIDO_SKIP]', 'aria-checked');
  await p.click('[data-trick=OOT_MIDO_SKIP]'); await wait(800);
  ok('a trick can be switched', (await p.getAttribute('[data-trick=OOT_MIDO_SKIP]', 'aria-checked')) !== was);
  await search('');
  ok('glitches have their own section', !!(await p.$('details[data-cat="x.glitches"]')));

  /* Special conditions appear once a goal uses them */
  await search('rainbow bridge');
  ok('no special conditions before a custom bridge', !(await p.$('[data-cond-count=BRIDGE]')));
  await p.selectOption('[data-enum=rainbowBridge]', 'custom'); await wait(800);
  await search('rainbow bridge');
  ok('custom bridge shows its conditions', !!(await p.$('[data-cond-count=BRIDGE]')));
  await p.click('[data-cond=BRIDGE][data-val=stones]'); await wait(600);
  await p.fill('[data-cond-count=BRIDGE]', '2'); await p.press('[data-cond-count=BRIDGE]', 'Enter'); await wait(800);
  ok('conditions can be set', (await p.getAttribute('[data-cond=BRIDGE][data-val=stones]', 'aria-pressed')) === 'true' && (await p.inputValue('[data-cond-count=BRIDGE]')) === '2');

  /* Starting items feed logic */
  await search('starting items');
  await p.selectOption('[data-start-add]', 'OOT_BOMB_BAG'); await wait(800);
  ok('a starting item can be added', !!(await p.$('[data-start-num=OOT_BOMB_BAG]')));
  await toChecks(); await waitLogic();
  const withBombs = await reach();
  ok('starting items open more checks', withBombs > startReach, `${startReach} -> ${withBombs}`);

  /* Junk locations */
  await settings(); await search('junk locations');
  await p.fill('#junkAdd', await p.evaluate(() => document.querySelector('#junkChecks option').value));
  await p.click('[data-junk-add]'); await wait(800);
  ok('a junk location can be added', !!(await p.$('[data-junk-del]')), await p.evaluate(() => document.querySelector('[data-junk-del]')?.dataset.junkDel ?? ''));

  /* Random starting age */
  await search('starting age (oot)');
  await p.selectOption('[data-enum=startingAgeOot]', 'random'); await wait(800);
  ok('random starting age asks what the seed rolled', !!(await p.$('[data-rolled=startingAgeOot]')));
  await toChecks(); await waitLogic();
  const either = await reach();
  ok('unknown age keeps logic running', either > 0, `${either} in logic`);
  ok('banner asks for the roll', /rolls some settings/.test(await p.textContent('#pane')));
  await settings();
  await p.click('[data-rolled=startingAgeOot][data-val=child]'); await wait(600);
  await toChecks(); await waitLogic();
  const child = await reach();
  ok('picking child counts child checks', child >= either, `${either} -> ${child}`);
  await p.screenshot({ path: shot + 'settings-extra.png' });

  /* Survives a reload */
  await p.reload(); await p.waitForSelector('.row'); await waitLogic();
  ok('choices survive a reload', (await reach()) === child);

  console.log('errors', errs.length, errs.slice(0, 5));
  if (errs.length) process.exitCode = 1;
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
