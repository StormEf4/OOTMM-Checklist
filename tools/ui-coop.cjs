// Browser test for Coop outside the hosted page, using Firebase. Two players open the phone build with a stand-in
// for Google's Firebase libraries and a shared store, share one seed, and check that changes reach each other.
// Run with NODE_PATH=$(npm root -g) node tools/ui-coop.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8942);
const KEY = 'ootmm-checklist-v1';

/* The stand-in Firebase: the app/auth/firestore modules the app loads from gstatic. */
const store = new Map();
const pages = [];
let signIns = 0, writes = [];
const MODULES = {
  'firebase-app.js': `export const initializeApp = (cfg, name) => ({ cfg, name });`,
  'firebase-auth.js': `export const getAuth = a => ({ a }); export const signInAnonymously = async () => { await window.__fbSignIn(); return { user: { uid: 'anon' } }; };`,
  'firebase-firestore.js': `
    const listeners = window.__fbListeners ??= {};
    window.__fbFire = (p, d) => { for (const f of listeners[p] ?? []) f(d); };
    const snap = (ref, d) => ({ id: ref.path.split('/').pop(), exists: () => d != null, data: () => d ?? undefined, metadata: { fromCache: false, hasPendingWrites: false } });
    export const getFirestore = a => ({ a });
    export const doc = (db, path) => ({ path });
    export const getDoc = async ref => snap(ref, await window.__fbGet(ref.path));
    export const setDoc = async (ref, d) => { await window.__fbSet(ref.path, JSON.parse(JSON.stringify(d))); };
    export const onSnapshot = (ref, next, err) => { const f = d => next(snap(ref, d)); (listeners[ref.path] ??= []).push(f); window.__fbGet(ref.path).then(f); return () => { listeners[ref.path] = listeners[ref.path].filter(x => x !== f); }; };`,
};

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const errs = [];
  const open = async (who, config = true, online = true) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.exposeBinding('__fbSignIn', () => { signIns++; });
    await ctx.exposeBinding('__fbGet', (_, p) => store.get(p) ?? null);
    await ctx.exposeBinding('__fbSet', async (_, p, d) => {
      writes.push(p);
      store.set(p, d);
      for (const pg of pages) pg.evaluate(([p2, d2]) => window.__fbFire?.(p2, d2), [p, d]).catch(() => {});
    });
    await ctx.addInitScript(on => { window.__OOTMM_FIREBASE__ = on ? { apiKey: 'test-key', projectId: 'test-project', appId: 'x' } : {}; }, config);
    await ctx.route('https://www.gstatic.com/firebasejs/**', route => {
      if (!online) return route.abort();
      const m = route.request().url().split('/').pop();
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: MODULES[m] ?? '' });
    });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(`${who}: ${e}`));
    pages.push(p);
    await p.goto(`http://localhost:${PORT}/`); await p.waitForSelector('.row');
    return p;
  };
  const tab = (p, t) => p.click(`.rail .tab[data-tab=${t}]`);
  const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  const isDone = (p, id) => p.evaluate(([k, id]) => { const s = JSON.parse(localStorage.getItem(k)); return !!s?.seeds.find(x => x.id === s.current)?.done.includes(id); }, [KEY, id]);
  const tick = async (p, id) => { await tab(p, 'list'); await p.fill('#search', id.split(' ').slice(-2).join(' ')); await p.waitForTimeout(300); await p.click(`.row[data-id="${id}"] .tick-btn`); };

  /* No Firebase config: Coop explains it isn't set up and loads nothing */
  const plain = await open('plain', false);
  await tab(plain, 'coop');
  ok('without a config, Coop says it is not set up', /isn't set up/.test(await plain.textContent('#pane')) && !(await plain.$('[data-live-start]')));
  ok('without a config, nothing signs in', signIns === 0);

  /* Offline: a clear message and a retry */
  const off = await open('off', true, false);
  await tab(off, 'coop');
  ok('offline shows a retry', await until(async () => !!(await off.$('[data-coop-retry]'))));

  /* Two players */
  const a = await open('a');
  ok('the app does not load Firebase until Coop is used', signIns === 0);
  await tab(a, 'coop');
  ok('opening Coop signs in and shows sharing', await until(async () => !!(await a.$('[data-live-start]'))) && signIns === 1);
  await a.click('[data-live-start]'); await a.waitForSelector('.live-code');
  const code = await a.textContent('.live-code');
  ok('sharing gives a 16-character code', /^LIVE-[A-Z0-9]{16}$/.test(code), code);
  ok('the room is written under live/', await until(() => writes.some(w => /^live\/[a-z0-9]{16}$/.test(w))));
  const bb = await open('b');
  await tab(bb, 'coop'); await bb.waitForSelector('#liveJoin');
  await bb.fill('#liveJoin', code); await bb.click('[data-live-join]');
  ok('partner joins', await until(() => bb.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); return !!s?.seeds.find(x => x.id === s.current).live; }, KEY)));

  const KS = 'OOT Kokiri Forest Kokiri Sword Chest', MIDO = "OOT Mido's House Top Left";
  await tab(bb, 'list'); await bb.fill('#search', 'kokiri sword'); await bb.waitForTimeout(300);
  await tick(a, KS);
  ok("A's tick reaches B", await until(() => isDone(bb, KS)));
  ok("B's open list shows it without a reload", await until(() => bb.evaluate(id => document.querySelector(`.row[data-id="${CSS.escape(id)}"]`)?.classList.contains('done') ?? false, KS)));
  await tick(bb, MIDO);
  ok("B's tick reaches A", await until(() => isDone(a, MIDO)));

  /* Reload reconnects on its own */
  const before = signIns;
  await bb.reload(); await bb.waitForSelector('.row');
  ok('after a reload B signs in again by itself', await until(async () => signIns > before));
  await tick(a, KS);
  ok('after a reload B still follows A', await until(async () => !(await isDone(bb, KS))));

  console.log('errors', errs.length, errs.slice(0, 5));
  if (errs.length) process.exitCode = 1;
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
