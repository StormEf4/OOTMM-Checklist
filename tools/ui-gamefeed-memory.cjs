// Browser test for game tracking's memory reader (Windows app). A stand-in OoTMM Client sends INFO_ENTRANCE messages,
// and a stand-in for the app's reader (window.ootmmMem, from desktop/preload.js) says which grotto numbers it saw.
// The switch shows only with entrance logging on, starts and stops the reader, and a plain grotto the reader can tell
// is logged without a question; when it can't, the app still asks.
// Run with NODE_PATH=$(npm root -g) node tools/ui-gamefeed-memory.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8943);

/* The stand-in Client. Pages call __feed(msg) through the test to send a message on every open events socket. */
const FAKE = () => {
  const URL_BASE = 'http://feed.test';
  window.__OOTMM_GAME_FEED_URL__ = URL_BASE;
  window.__feedUp = true;
  window.__feedSockets = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    if (String(u).startsWith(URL_BASE)) {
      if (!window.__feedUp) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ clients: [{ id: 'c0ffee' }] }), { headers: { 'content-type': 'application/json' } });
    }
    return realFetch(u, o);
  };
  const RealWS = window.WebSocket;
  class FakeWS {
    constructor(url) {
      if (!String(url).startsWith('ws://feed.test')) return new RealWS(url);
      this.url = url; this.readyState = 0;
      window.__feedSockets.push(this);
      setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 10);
    }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; window.__feedSockets = window.__feedSockets.filter(s => s !== this); this.onclose?.({}); }
  }
  FakeWS.OPEN = 1; FakeWS.CLOSED = 3; FakeWS.CONNECTING = 0; FakeWS.CLOSING = 2;
  window.WebSocket = FakeWS;
  window.__feed = msg => { for (const s of window.__feedSockets) s.onmessage?.({ data: JSON.stringify(msg) }); return window.__feedSockets.length; };
};


/* The stand-in reader. */
const MEM = () => {
  window.__mem = { calls: [], history: { oot: [], mm: [] }, status: { available: true, running: false, found: false, game: null, note: '' } };
  window.ootmmMem = {
    start: async () => { __mem.calls.push('start'); __mem.status = { available: true, running: true, found: true, game: 'oot', note: '' }; return __mem.status; },
    stop: async () => { __mem.calls.push('stop'); __mem.status = { available: true, running: false, found: false, game: null, note: '' }; return __mem.status; },
    status: async () => __mem.status,
    grottos: async g => { __mem.calls.push('grottos:' + g); return { now: Date.now(), since: Date.now() - 60000, history: __mem.history[g] }; },
  };
};

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; });
  await c.addInitScript(FAKE);
  await c.addInitScript(MEM);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
  const state = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1') ?? 'null'); return s?.seeds.find(x => x.id === s.current) ?? { entrances: {} }; });
  const feed = msgs => p.evaluate(ms => ms.forEach(m => window.__feed({ type: 'INFO_ENTRANCE', age: 'CHILD', ...m })), msgs);
  const seen = (g, list) => p.evaluate(([g, list]) => { const now = Date.now(); __mem.history[g] = list.map(([v, ago]) => ({ v, t: now - ago })); }, [g, list]);
  const calls = () => p.evaluate(() => __mem.calls.slice());

  await p.click('.rail .tab[data-tab=settings]');
  await p.click('[data-setview=game]');
  await p.fill('#setSearch', 'grotto shuffle');
  await p.waitForTimeout(300);
  await p.selectOption('[data-enum=erGrottos]', 'full');
  await p.waitForTimeout(800);
  await p.waitForFunction(() => window.__feedSockets.length > 0, null, { timeout: 10000 });
  await p.evaluate(() => window.__feed({ type: 'GAME_START', sessionId: 'aaaa', playerName: 'Link', worldId: 1 }));

  /* The switch is hidden until entrance logging is on, and off by default. */
  await p.click('[data-setview=look]');
  await p.waitForSelector('[data-game-entrances-set]');
  ok('no reader switch while entrance logging is off', !(await p.$('[data-game-memory-set]')));
  await p.click('[data-game-entrances-set="1"]');
  await p.waitForSelector('[data-game-memory-set]');
  ok('reader switch shows Off', await p.getAttribute('[data-game-memory-set="0"]', 'aria-pressed') === 'true');
  ok('reader not started', !(await calls()).includes('start'));

  /* Off: a Hyrule Field grotto isn't told apart by the reader. */
  await seen('oot', [[0x23, 1500], [0x1a, 900]]);
  await feed([{ original: 'OOT_FIELD_FROM_KAKARIKO', entrance: 'OOT_FIELD_FROM_KAKARIKO' }, { original: 'OOT_GROTTO_TYPE_GENERIC', entrance: 'OOT_GROTTO_GENERIC_DMC' }]);
  await p.waitForTimeout(700);
  let s = await state();
  ok('reader off: grotto not logged on the way in', !s.entrances.OOT_GROTTO_GENERIC_HF_OPEN, JSON.stringify(s.entrances));
  ok('reader off: reader not asked', !(await calls()).some(x => x.startsWith('grottos')));
  await feed([{ original: 'OOT_GROTTO_EXIT_GENERIC_DMC', entrance: 'OOT_GROTTO_EXIT_GENERIC_HF_OPEN' }]);
  await p.waitForTimeout(500);

  /* On: started, and says what it's reading. */
  await p.click('[data-game-memory-set="1"]');
  await p.waitForTimeout(400);
  ok('reader started', (await calls()).includes('start'));
  ok('says it is reading OoT', /Reading Ocarina of Time/.test(await p.textContent('#memState')), await p.textContent('#memState'));
  fs.mkdirSync('.cache/shots', { recursive: true });
  await p.locator('[data-game-memory-set]').first().evaluate(e => e.scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: '.cache/shots/memory-reader.png' });

  /* The hole's number (2, south-east grotto), then the grotto it led to (0x1a, Death Mountain Crater's): logged, no question. */
  await seen('oot', [[0x23, 30000], [0x22, 1500], [0x1a, 900]]);
  await feed([{ original: 'OOT_FIELD_FROM_KAKARIKO', entrance: 'OOT_FIELD_FROM_KAKARIKO' }, { original: 'OOT_GROTTO_TYPE_GENERIC', entrance: 'OOT_GROTTO_GENERIC_KAKARIKO' }]);
  await p.waitForTimeout(1500);
  s = await state();
  ok('reader can\'t be right here: dest number differs, nothing logged', !s.entrances.OOT_GROTTO_GENERIC_HF_SOUTHEAST, JSON.stringify(s.entrances));
  /* Leaves by a void: the app asks, as without the reader. */
  await feed([{ entrance: 'OOT_GROTTO_GENERIC_KAKARIKO' }]);
  await p.waitForSelector('[data-door-choice]', { timeout: 3000 }).catch(() => {});
  ok('falls back to asking', await p.isVisible('[data-door-choice]'));
  await p.click('.sheet [data-sheet-close].btn:has-text("None of these")');
  await p.waitForTimeout(300);

  await seen('oot', [[0x23, 30000], [0x22, 1500], [0x08, 900]]);
  await feed([{ original: 'OOT_FIELD_FROM_KAKARIKO', entrance: 'OOT_FIELD_FROM_KAKARIKO' }, { original: 'OOT_GROTTO_TYPE_GENERIC', entrance: 'OOT_GROTTO_GENERIC_KAKARIKO' }]);
  await p.waitForTimeout(1500);
  s = await state();
  ok('reader tells the hole: south-east grotto logged', s.entrances.OOT_GROTTO_GENERIC_HF_SOUTHEAST === 'OOT_GROTTO_GENERIC_KAKARIKO', JSON.stringify(s.entrances));
  ok('asked the OoT reader', (await calls()).includes('grottos:oot'));
  await feed([{ entrance: 'OOT_GROTTO_GENERIC_KAKARIKO' }]);
  await p.waitForTimeout(800);
  ok('no question once the reader told it', !(await p.isVisible('[data-door-choice]')));

  /* Off again: stopped. */
  await p.click('[data-setview=look]');
  await p.click('[data-game-memory-set="0"]');
  await p.waitForTimeout(300);
  ok('reader stopped', (await calls()).includes('stop'));

  console.log('errors', errs.length, errs.slice(0, 5));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
