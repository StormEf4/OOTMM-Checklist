// Browser test: each seed keeps its own save file for game tracking's catch-up. An older save, which kept one save file
// for the whole app, gives that file to the seed that was open. Switching seeds switches save files, and one seed's
// save file never ticks another seed's checks.
// Run with NODE_PATH=$(npm root -g) node tools/ui-save-seeds.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { makeSave, CHECKS } = require('./save-fixture.cjs');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8947);

/* Two seeds saved the old way: one save file in the app's settings, none on the seeds. */
const seedOf = (id, name) => ({ id, name, settings: '', done: [], skipped: [], updated: 1 });
const OLD = { v: 1, seeds: [seedOf('sa', 'Seed A'), seedOf('sb', 'Seed B')], current: 'sa', custom: [], edits: {}, ui: { skin: 'hero', gameTrack: true, saveFile: '/saves/a.fla' } };

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await c.addInitScript(old => {
    window.__OOTMM_RAIL_OPEN__ = true;
    /* Game tracking shows its settings only where it can run. Nothing answers at this address, so it stays unconnected. */
    window.__OOTMM_GAME_FEED_URL__ = 'http://127.0.0.1:9';
    if (!localStorage.getItem('ootmm-checklist-v1')) localStorage.setItem('ootmm-checklist-v1', JSON.stringify(old));
    window.__saveFiles = JSON.parse(sessionStorage.getItem('saveFiles') ?? '{}');
    const bytes = b64 => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    window.ootmmSave = {
      pick: async () => window.__savePickNext,
      stat: async f => window.__saveFiles[f]?.[1] ?? null,
      read: async f => window.__saveFiles[f] ? bytes(window.__saveFiles[f][0]) : null,
    };
  }, OLD);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
  const all = () => p.evaluate(() => JSON.parse(localStorage.getItem('ootmm-checklist-v1')));
  const seedIn = (st, id) => st.seeds.find(s => s.id === id);

  /* Save files for each seed: A's file has two chests ticked, B's has two others. */
  const ids = await p.evaluate(() => [...document.querySelectorAll('.row[data-id]')].map(r => r.dataset.id));
  const chestIds = ids.filter(i => CHECKS.find(x => x.location === i)?.ov === 'chest');
  const forA = chestIds.slice(0, 2), forB = chestIds.slice(2, 4);
  ok('found chests to use', forA.length === 2 && forB.length === 2);
  const files = { '/saves/a.fla': [makeSave([{ name: 'A', locations: forA }]), 1000], '/saves/b.fla': [makeSave([{ name: 'B', locations: forB }]), 2000] };
  await p.evaluate(f => { window.__saveFiles = f; sessionStorage.setItem('saveFiles', JSON.stringify(f)); }, files);

  const openLook = async () => {
    await p.click('.rail .tab[data-tab=settings]');
    await p.click('[data-setview=game]').catch(() => {});
    await p.click('[data-setview=look]');
    await p.waitForSelector('[data-save-pick]');
  };
  const openSeed = async id => {
    await p.click('.rail .tab[data-tab=seeds]');
    await p.click(`[data-open="${id}"]`);
    await p.waitForTimeout(400);
  };

  await openLook();
  ok("seed A's settings show its file", (await p.textContent('#pane')).includes("This seed's save file: /saves/a.fla"));
  await p.click('[data-save-now]');
  await p.waitForTimeout(600);
  let st = await all();
  ok("catch-up ticks A's checks on A", forA.every(i => seedIn(st, 'sa').done.includes(i)));
  /* Nothing is written until something changes, so look after the first change. */
  ok('migrated: the open seed got the old save file', seedIn(st, 'sa').saveFile === '/saves/a.fla', seedIn(st, 'sa').saveFile);
  ok('migrated: the other seed has none', !seedIn(st, 'sb').saveFile);
  ok('migrated: app-wide save file removed', !st.ui.saveFile);


  await openSeed('sb');
  await openLook();
  ok('seed B shows no save file', (await p.textContent('#pane')).includes('No save file chosen for this seed.'));
  ok("seed B doesn't show A's last reading", !(await p.isVisible('#saveState')));
  await p.evaluate(() => { window.__savePickNext = '/saves/b.fla'; });
  await p.click('[data-save-pick]');
  await p.waitForTimeout(600);
  st = await all();
  ok('seed B keeps its own file', seedIn(st, 'sb').saveFile === '/saves/b.fla');
  ok('seed A still has its file', seedIn(st, 'sa').saveFile === '/saves/a.fla');
  ok("B's file ticked B's checks", forB.every(i => seedIn(st, 'sb').done.includes(i)));
  ok("B's file didn't tick A's checks on B", forA.every(i => !seedIn(st, 'sb').done.includes(i)));
  ok("A's checks didn't get B's", forB.every(i => !seedIn(st, 'sa').done.includes(i)));

  await openSeed('sa');
  await openLook();
  ok('back on seed A: its own file shows', (await p.textContent('#pane')).includes("This seed's save file: /saves/a.fla"));

  /* Still separate after the app restarts. */
  await p.reload();
  await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
  st = await all();
  ok('after restart: both files kept', seedIn(st, 'sa').saveFile === '/saves/a.fla' && seedIn(st, 'sb').saveFile === '/saves/b.fla');
  await openLook();
  ok('after restart: seed A shows its file', (await p.textContent('#pane')).includes("This seed's save file: /saves/a.fla"));

  console.log('errors', errs.length, errs.slice(0, 5));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
