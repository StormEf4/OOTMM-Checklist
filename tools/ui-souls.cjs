// Browser test for the Items tab's souls sections. Each kind of soul shows only when the seed's settings shuffle it,
// under the game it belongs to (shared souls under both), and souls can be ticked like any item.
// Run with NODE_PATH=$(npm root -g) node tools/ui-souls.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8943);

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; window.__OOTMM_LOGIC__ = true; });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });

  const sections = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('section.items')].map(s => [
    [...s.classList].find(k => k === 'oot' || k === 'mm') ?? 'pinned',
    Object.fromEntries([...s.querySelectorAll('.item-group')].map(g => [g.querySelector('h3').textContent.trim(), g.querySelectorAll('.item').length])),
  ])));
  const items = async (want) => {
    await p.click('.rail .tab[data-tab=items]');
    await p.waitForFunction(() => document.querySelectorAll('section.items .item').length > 10, null, { timeout: 120000 });
    if (want) await p.waitForFunction(w => [...document.querySelectorAll('section.items h3')].some(h => h.textContent.includes(w)), want, { timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(500);
    return sections();
  };
  const setBools = async keys => {
    await p.click('.rail .tab[data-tab=settings]');
    await p.click('[data-setview=game]');
    for (const [search, key] of keys) {
      await p.fill('#setSearch', search);
      await p.waitForTimeout(300);
      await p.click(`[data-bool=${key}]`);
      await p.waitForTimeout(500);
    }
  };

  let s = await items();
  ok('no souls on default settings', !JSON.stringify(s).includes('souls'), JSON.stringify(s));

  await setBools([['boss souls (oot)', 'soulsBossOot'], ['boss souls (mm)', 'soulsBossMm']]);
  s = await items('Boss souls');
  ok('Hyrule: 8 boss souls', s.oot?.['Boss souls'] === 8, JSON.stringify(s.oot));
  ok('Termina: 5 boss souls', s.mm?.['Boss souls'] === 5, JSON.stringify(s.mm));
  ok('only boss souls', !/Enemy souls|NPC souls|Animal souls|Other souls/.test(JSON.stringify(s)));
  const names = await p.$$eval('section.items.oot .item-group', gs => [...gs].find(g => /Boss souls/.test(g.textContent)).innerText);
  console.log('  ', names.replace(/\s+/g, ' ').slice(0, 300));
  ok('named by boss', /Queen Gohma/.test(names) && /Twinrova/.test(names));
  await p.locator('section.items.oot .item-group:has(h3:text("Boss souls")) .item-btn').first().scrollIntoViewIfNeeded();
  fs.mkdirSync('.cache/shots', { recursive: true });
  await p.screenshot({ path: '.cache/shots/souls-boss.png' });

  /* Tick one: it counts as owned. */
  await p.locator('section.items.oot .item-group:has(h3:text("Boss souls")) .item-btn').first().click();
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return s.seeds.find(x => x.id === s.current); });
  ok('ticking a soul saves it', JSON.stringify(st).includes('OOT_SOUL_BOSS_'), JSON.stringify(st.items ?? st.have ?? {}).slice(0, 200));

  /* Every other kind, in both games, then shared enemy souls. */
  await setBools([
    ['enemy souls (oot)', 'soulsEnemyOot'], ['enemy souls (mm)', 'soulsEnemyMm'], ['npc souls (oot)', 'soulsNpcOot'], ['npc souls (mm)', 'soulsNpcMm'],
    ['animal souls (oot)', 'soulsAnimalOot'], ['animal souls (mm)', 'soulsAnimalMm'], ['misc. souls (oot)', 'soulsMiscOot'], ['misc. souls (mm)', 'soulsMiscMm'],
  ]);
  s = await items('Other souls');
  console.log('   all kinds:', JSON.stringify({ oot: Object.fromEntries(Object.entries(s.oot).filter(([k]) => /souls/.test(k))), mm: Object.fromEntries(Object.entries(s.mm).filter(([k]) => /souls/.test(k))) }));
  for (const g of ['oot', 'mm']) for (const k of ['Boss souls', 'Enemy souls', 'NPC souls', 'Animal souls', 'Other souls']) ok(`${g}: ${k} shown`, (s[g]?.[k] ?? 0) > 0, String(s[g]?.[k]));
  const order = await p.$$eval('section.items.oot .item-group h3', hs => hs.map(h => h.textContent.trim()));
  ok('souls sit together', order.indexOf('Enemy souls') === order.indexOf('Boss souls') + 1, order.join(' | '));

  await setBools([['shared enemy souls', 'sharedSoulsEnemy']]);
  s = await items();
  await p.waitForFunction(() => document.querySelector('.item-btn[data-item^="SHARED_SOUL_ENEMY_"]'), null, { timeout: 120000 }).catch(() => {});
  const shared = await p.$$eval('section.items .item-btn[data-item^="SHARED_SOUL_ENEMY_"]', bs => bs.length);
  ok('shared enemy souls show (under both games)', shared > 0 && shared % 2 === 0, String(shared));

  console.log('errors', errs.length, errs.slice(0, 5));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
