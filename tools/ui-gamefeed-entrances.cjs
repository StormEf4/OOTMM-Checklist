// Browser test for game tracking's entrance logging. A stand-in OoTMM Client sends the INFO_ENTRANCE messages the game
// sends as the player walks through loading zones. Logging is off until the player turns it on; then only the door just
// used is logged, grottos are told apart by where the player was, and doors the player logged stay as they are.
// Run with NODE_PATH=$(npm root -g) node tools/ui-gamefeed-entrances.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8942);

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

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; });
  await c.addInitScript(FAKE);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
  const state = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1') ?? 'null'); return s?.seeds.find(x => x.id === s.current) ?? { entrances: {} }; });
  const feed = msgs => p.evaluate(ms => ms.forEach(m => window.__feed({ type: 'INFO_ENTRANCE', age: 'CHILD', ...m })), msgs);

  /* Shuffle grottos and interiors. */
  await p.click('.rail .tab[data-tab=settings]');
  await p.click('[data-setview=game]');
  for (const [k, v] of [['erGrottos', 'full'], ['erIndoors', 'full']]) {
    await p.fill('#setSearch', k === 'erGrottos' ? 'grotto shuffle' : 'interiors shuffle');
    await p.waitForTimeout(300);
    await p.selectOption(`[data-enum=${k}]`, v);
    await p.waitForTimeout(800);
  }
  await p.fill('#setSearch', 'shuffle most interiors');
  await p.waitForTimeout(300);
  await p.click('[data-bool=erIndoorsMajor]');
  await p.waitForTimeout(800);
  await p.waitForFunction(() => window.__feedSockets.length > 0, null, { timeout: 10000 });
  await p.evaluate(() => window.__feed({ type: 'GAME_START', sessionId: 'aaaa', playerName: 'Link', worldId: 1 }));

  /* Off by default: a door walked through isn't logged. */
  await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS', entrance: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS' }, { original: 'OOT_GROTTO_TYPE_GENERIC', entrance: 'OOT_GROTTO_GENERIC_DMT' }]);
  await p.waitForTimeout(400);
  let s = await state();
  ok('off by default: nothing logged', Object.keys(s.entrances).length === 0, JSON.stringify(s.entrances));

  await p.click('[data-setview=look]');
  await p.waitForSelector('[data-game-entrances-set]');
  ok('switch shows Off', await p.getAttribute('[data-game-entrances-set="0"]', 'aria-pressed') === 'true');
  await p.click('[data-game-entrances-set="1"]');
  await p.waitForTimeout(200);

  /* In Kokiri Forest: its one plain grotto is the door used. */
  await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS', entrance: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS' }, { original: 'OOT_GROTTO_TYPE_GENERIC', entrance: 'OOT_GROTTO_GENERIC_DMT' }]);
  await p.waitForTimeout(500);
  s = await state();
  ok('grotto in Kokiri Forest logged', s.entrances.OOT_GROTTO_GENERIC_KOKIRI_FOREST === 'OOT_GROTTO_GENERIC_DMT', JSON.stringify(s.entrances));
  ok('its way back filled in too', s.entrances.OOT_GROTTO_EXIT_GENERIC_DMT === 'OOT_GROTTO_EXIT_GENERIC_KOKIRI_FOREST', s.entrances.OOT_GROTTO_EXIT_GENERIC_DMT);
  const logged = Object.keys(s.entrances).length;

  /* An interior, named exactly: logged. */
  await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS', entrance: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS' }, { original: 'OOT_HOUSE_MIDO', entrance: 'OOT_HOUSE_SARIA' }]);
  await p.waitForTimeout(500);
  s = await state();
  ok("Mido's house door logged", s.entrances.OOT_HOUSE_MIDO === 'OOT_HOUSE_SARIA', JSON.stringify(s.entrances));

  /* Hyrule Field has three plain grottos: can't tell which, so nothing. */
  const n = Object.keys(s.entrances).length;
  await feed([{ original: 'OOT_FIELD_FROM_KAKARIKO', entrance: 'OOT_FIELD_FROM_KAKARIKO' }, { original: 'OOT_GROTTO_TYPE_GENERIC', entrance: 'OOT_GROTTO_GENERIC_KAKARIKO' }]);
  await p.waitForTimeout(500);
  s = await state();
  ok('Hyrule Field plain grotto: not logged', Object.keys(s.entrances).length === n, JSON.stringify(s.entrances));

  /* A void or savewarp (no door), an unknown place, and another game: nothing. */
  await feed([{ entrance: 'OOT_HOUSE_SARIA' }, { original: 'UNKNOWN', entrance: 'UNKNOWN' }]);
  await p.evaluate(() => { window.__feed({ type: 'GAME_START', sessionId: 'bbbb' }); window.__feed({ type: 'INFO_ENTRANCE', original: 'OOT_HOUSE_SARIA', entrance: 'OOT_HOUSE_KNOW_IT_ALL', age: 'CHILD' }); });
  await p.waitForTimeout(500);
  s = await state();
  ok('no door, unknown place or other game: nothing', Object.keys(s.entrances).length === n && !s.entrances.OOT_HOUSE_SARIA, JSON.stringify(s.entrances));

  /* A door the player already logged stays as they set it. */
  await p.evaluate(() => window.__feed({ type: 'GAME_START', sessionId: 'aaaa' }));
  await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS', entrance: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS' }, { original: 'OOT_HOUSE_MIDO', entrance: 'OOT_HOUSE_KNOW_IT_ALL' }]);
  await p.waitForTimeout(500);
  s = await state();
  ok('already logged door kept', s.entrances.OOT_HOUSE_MIDO === 'OOT_HOUSE_SARIA', s.entrances.OOT_HOUSE_MIDO);

  /* Shows on the Entrances tab. */
  await p.click('[data-setview=look]');
  ok('settings note counts what was logged', /logged/.test(await p.textContent('.box:has([data-game-entrances-set])')));
  await p.locator('[data-game-entrances-set]').first().evaluate(e => e.closest('.box').scrollIntoView({ block: 'center' }));
  fs.mkdirSync('.cache/shots', { recursive: true });
  await p.screenshot({ path: '.cache/shots/game-entrances.png' });

  /* Turned off again: stops. */
  await p.click('[data-game-entrances-set="0"]');
  await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS', entrance: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS' }, { original: 'OOT_HOUSE_SARIA', entrance: 'OOT_HOUSE_KNOW_IT_ALL' }]);
  await p.waitForTimeout(400);
  s = await state();
  ok('off again: nothing new', !s.entrances.OOT_HOUSE_SARIA);

  console.log('errors', errs.length, errs.slice(0, 5));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
