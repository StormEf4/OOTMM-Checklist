// Browser test for live play on the hosted page. Two players open the hosted build with a stand-in for the page's
// shared database, share one seed, and check that each one's changes reach the other. Run with
// NODE_PATH=$(npm root -g) node tools/ui-live.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'dist/artifact/ootmm-checklist.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(file)); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8939);

/* The stand-in database: documents live here, and every write is pushed to every open page's listeners. */
const store = new Map();
const pages = [];
const MOCK = who => `
  (() => {
    const listeners = {};
    window.__dbFire = (path, data) => { for (const f of listeners[path] ?? []) f(data); };
    const snap = (path, data) => ({ id: path.split('/').pop(), exists: data != null, data: () => data ?? undefined, metadata: { fromCache: false, hasPendingWrites: false } });
    const doc = path => ({
      id: path.split('/').pop(), path,
      get: async () => snap(path, await window.__dbGet(path)),
      set: async data => { await window.__dbSet(path, JSON.parse(JSON.stringify(data))); },
      onSnapshot(next) {
        const f = data => next(snap(path, data));
        (listeners[path] ??= []).push(f);
        window.__dbGet(path).then(f);
        return () => { listeners[path] = listeners[path].filter(x => x !== f); };
      },
    });
    const db = { doc, collection: p => ({ doc: id => doc(p + '/' + id) }) };
    const user = { id: async () => 'user-${who}' };
    window.claude = { use: async name => name === 'db' ? db : name === 'user' ? user : null };
  })();`;

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const errs = [];
  const open = async who => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.exposeBinding('__dbGet', (_, p) => store.get(p) ?? null);
    await ctx.exposeBinding('__dbSet', async (_, p, data) => {
      store.set(p, data);
      for (const pg of pages) pg.evaluate(([p2, d]) => window.__dbFire(p2, d), [p, data]).catch(() => {});
    });
    await ctx.addInitScript(MOCK(who));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(`${who}: ${e}`));
    pages.push(p);
    await p.goto(`http://localhost:${PORT}/`); await p.waitForSelector('.row');
    return p;
  };
  const a = await open('a');
  const bb = await open('b');
  const tab = (p, t) => p.click(`.rail .tab[data-tab=${t}]`);
  const isDone = (p, id) => p.evaluate(id => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return s.seeds.find(x => x.id === s.current).done.includes(id); }, id);
  const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  const tick = async (p, id) => { await tab(p, 'list'); await p.fill('#search', id.split(' ').slice(-2).join(' ')); await p.waitForTimeout(300); await p.click(`.row[data-id="${id}"] .tick-btn`); };

  /* A shares, B joins */
  await tab(a, 'seeds');
  ok('the Seeds tab has no live box', !(await a.$('[data-live-start]')));
  await tab(a, 'coop');
  ok('live box shows on the Coop tab', !!(await a.$('[data-live-start]')));
  await a.click('[data-live-start]'); await a.waitForSelector('.live-code');
  const code = await a.textContent('.live-code');
  ok('sharing gives a code', /^LIVE-[A-Z0-9]+$/.test(code), code);
  await until(() => store.size > 0);
  await tab(bb, 'coop'); await bb.fill('#liveJoin', code); await bb.click('[data-live-join]'); await bb.waitForTimeout(800);
  ok('partner joins the seed', (await bb.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return s.seeds.find(x => x.id === s.current).live; })) === code.slice(5).toLowerCase());

  await tab(a, 'coop');
  ok('the Coop tab lists the live seed', /LIVE-/.test(await a.textContent('#coopList')));

  /* Ticks go both ways */
  const KS = 'OOT Kokiri Forest Kokiri Sword Chest', MIDO = "OOT Mido's House Top Left", MIDO2 = "OOT Mido's House Top Right";
  await tick(a, KS);
  ok("A's tick reaches B", await until(() => isDone(bb, KS)));
  await tick(bb, MIDO);
  ok("B's tick reaches A", await until(() => isDone(a, MIDO)));
  await bb.fill('#search', 'kokiri sword'); await bb.waitForTimeout(300);
  ok("B's screen shows A's tick", await until(() => bb.evaluate(id => document.querySelector(`.row[data-id="${CSS.escape(id)}"]`)?.classList.contains('done') ?? false, KS)));

  /* Both at once */
  await Promise.all([tick(a, MIDO2), tick(bb, "OOT Mido's House Bottom Left")]);
  ok('ticks made at the same moment both survive', await until(async () => (await isDone(a, MIDO2)) && (await isDone(a, "OOT Mido's House Bottom Left")) && (await isDone(bb, MIDO2)) && (await isDone(bb, "OOT Mido's House Bottom Left")), 6000));

  /* Untick */
  await tick(a, KS);
  ok("A's untick reaches B", await until(async () => !(await isDone(bb, KS))));

  /* Notes */
  await tab(a, 'notes'); await a.click('#docPage'); await a.keyboard.type('Go to Forest first');
  await a.click('.rail .tab[data-tab=list]');
  await tab(bb, 'notes');
  ok("A's notes reach B", await until(async () => /Go to Forest first/.test(await bb.textContent('#docPage'))));

  /* Settings */
  const startSettings = await a.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return s.seeds.find(x => x.id === s.current).settings; });
  await tab(a, 'settings'); await a.fill('#importText', 'v2.q1ZKzi8PzihNS8tJ9c8vUbIqKSpNrQUA'); await a.click('[data-import]');
  const cur = p => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return s.seeds.find(x => x.id === s.current).settings; });
  ok('the settings changed on A', await until(async () => (await cur(a)) !== startSettings));
  ok("A's settings reach B", await until(async () => (await cur(bb)) === (await cur(a)) && (await cur(a)).length > 0, 8000));

  /* Reload keeps it live */
  await bb.reload(); await bb.waitForSelector('.row');
  await tick(a, MIDO);
  ok('after a reload B still follows A', await until(async () => !(await isDone(bb, MIDO))));

  /* Stop */
  await tab(bb, 'coop'); await bb.click('[data-live-stop]'); await bb.waitForTimeout(300);
  await tick(a, KS);
  await bb.waitForTimeout(1500);
  ok('after stopping, B no longer changes', !(await isDone(bb, KS)));

  console.log('errors', errs.length, errs.slice(0, 5));
  if (errs.length) process.exitCode = 1;
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
