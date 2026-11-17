// Browser test for game tracking. A stand-in for the OoTMM Client (its /clients list and events websocket) sends what
// the game would, and the checklist must tick the checks, log the items, ignore entrances and stay with its own game.
// Run with NODE_PATH=$(npm root -g) node tools/ui-gamefeed.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8941);

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
  await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_LOGIC__ = true; });
  await c.addInitScript(FAKE);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
  const state = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1') ?? 'null'); return s?.seeds.find(x => x.id === s.current) ?? { done: [], found: {}, entrances: {} }; });
  /* Wait for the item list (it comes with logic) so items log as items. */
  await p.waitForFunction(() => !document.querySelector('#logicPill') || !/Working/.test(document.querySelector('#logicPill').textContent), null, { timeout: 120000 }).catch(() => {});
  await p.waitForFunction(() => window.__feedSockets.length > 0, null, { timeout: 10000 });
  ok('not shown as connected before the game reports in', await p.isHidden('#gameLink'));

  /* Pick real names from this seed's list: one OoT and one MM check. */
  const ids = await p.evaluate(() => [...document.querySelectorAll('.row[data-id]')].map(r => r.dataset.id));
  const oot = ids.find(i => i.startsWith('OOT ')), mm = ids.find(i => i.startsWith('MM '));
  const before = await state();

  await p.evaluate(() => window.__feed({ type: 'GAME_START', sessionId: 'aaaa', playerName: 'Link', worldId: 1 }));
  await p.waitForTimeout(200);
  ok('connected light shows on game start', await p.isVisible('#gameLink'), await p.textContent('#gameLink'));

  await p.evaluate(([oot, mm]) => {
    window.__feed({ type: 'INFO_ITEM', location: oot, item: 'OOT_HOOKSHOT', self: true });
    window.__feed({ type: 'INFO_ITEM', location: mm, item: 'MM_MASK_DEKU', self: true });
    window.__feed({ type: 'INFO_ENTRANCE', original: 'OOT_KOKIRI_FOREST_FROM_LOST_WOODS', entrance: 'MM_CLOCK_TOWN', age: 'child' });
    window.__feed({ type: 'INFO_ITEM', location: 'OOT Nowhere Made Up Check', item: 'OOT_RUPEE_BLUE', self: true });
    window.__feed({ type: 'INFO_ITEM', location: '', item: 'OOT_BOMBS_5', self: true });
  }, [oot, mm]);
  await p.waitForTimeout(800);
  let s = await state();
  ok('OoT check ticked', s.done.includes(oot), oot);
  ok('MM check ticked', s.done.includes(mm), mm);
  ok('OoT item logged as an item', s.found[oot] === 'OOT_HOOKSHOT', s.found[oot]);
  ok('MM item logged as an item', s.found[mm] === 'MM_MASK_DEKU', s.found[mm]);
  ok('entrances untouched', JSON.stringify(s.entrances) === JSON.stringify(before.entrances));
  ok('unknown check ignored', !s.done.includes('OOT Nowhere Made Up Check'));
  ok('item with no check ignored', Object.keys(s.found).length === 2, JSON.stringify(s.found));
  ok('seed now follows this game', s.game === 'aaaa');
  ok('only the two checks ticked', s.done.length === before.done.length + 2);

  /* Another player's item at your check: the check is done, the item isn't counted as yours. */
  const third = ids.find(i => i.startsWith('OOT ') && i !== oot);
  await p.evaluate(t => window.__feed({ type: 'INFO_ITEM', location: t, item: 'OOT_BOW', self: false }), third);
  await p.waitForTimeout(400);
  s = await state();
  ok("another player's item: check ticked", s.done.includes(third));
  ok("another player's item: logged as words", /^text:.*another player/.test(s.found[third] ?? ''), s.found[third]);

  /* A different game (another seed's session) doesn't tick this seed. */
  const fourth = ids.find(i => i.startsWith('OOT ') && i !== oot && i !== third);
  await p.evaluate(() => { for (const s of window.__feedSockets) s.close(); });
  await p.waitForFunction(() => window.__feedSockets.length > 0, null, { timeout: 10000 });
  await p.evaluate(t => { window.__feed({ type: 'GAME_START', sessionId: 'bbbb' }); window.__feed({ type: 'INFO_ITEM', location: t, item: 'OOT_BOW', self: true }); }, fourth);
  await p.waitForTimeout(400);
  s = await state();
  ok('other game ignored', !s.done.includes(fourth));

  /* The settings: Game tracking box, then Checks only, then off. */
  await p.click('.rail .tab[data-tab=settings]');
  await p.click('[data-setview=look]');
  await p.waitForSelector('[data-game-track-set]');
  ok('settings box says connected', /Connected to your game/.test(await p.textContent('#gameState')));
  await p.click('[data-game-forget]');
  await p.click('[data-game-items-set="0"]');
  await p.waitForTimeout(150);
  await p.evaluate(t => window.__feed({ type: 'INFO_ITEM', location: t, item: 'OOT_BOW', self: true }), fourth);
  await p.waitForTimeout(400);
  s = await state();
  ok('checks only: ticked', s.done.includes(fourth));
  ok('checks only: no item logged', !s.found[fourth]);
  ok('follows the new game after "Follow a different game"', s.game === 'bbbb');
  await p.screenshot({ path: '.cache/shots/game-tracking.png' });

  /* Shared bows: the game reports OoT's own bow, which is the shared bow on the checklist. Found through OoTMM's gi(). */
  await p.click('[data-game-items-set="1"]');
  await p.click('[data-setview=game]');
  await p.fill('#setSearch', 'shared bow');
  await p.waitForTimeout(400);
  await p.click('[data-bool=sharedBows]');
  await p.waitForTimeout(6000);
  const fifth = ids.find(i => i.startsWith('OOT ') && ![oot, third, fourth].includes(i));
  await p.evaluate(t => window.__feed({ type: 'INFO_ITEM', location: t, item: 'OOT_BOW', self: true }), fifth);
  await p.waitForTimeout(600);
  s = await state();
  ok('shared bow logged as the shared item', s.found[fifth] === 'SHARED_BOW', s.found[fifth]);
  /* Item names from a real game's log (stock v33, Nov 17): each lands on the item list or, for junk, as words. */
  const real = ['OOT_SCALE_SILVER', 'MM_STRAY_FAIRY_WF', 'OOT_ARROWS_30', 'MM_DEKU_SEEDS_30', 'MM_MAGIC_JAR_SMALL', 'OOT_TRAP_FIRE', 'MM_POTION_RED', 'MM_RUPEE_GREEN'];
  const spare = ids.filter(i => ![oot, mm, third, fourth, fifth].includes(i)).slice(0, real.length);
  await p.evaluate(([spare, real]) => spare.forEach((loc, i) => window.__feed({ type: 'INFO_ITEM', location: loc, item: real[i], self: true })), [spare, real]);
  await p.waitForTimeout(600);
  s = await state();
  ok('real log items all ticked', spare.every(l => s.done.includes(l)));
  console.log(real.map((r, i) => `  ${r} -> ${s.found[spare[i]]}`).join('\n'));
  await p.click('[data-setview=look]');
  await p.waitForSelector('[data-game-track-set]');
  await p.click('[data-game-track-set="0"]');
  await p.waitForTimeout(200);
  ok('off: sockets closed', (await p.evaluate(() => window.__feedSockets.length)) === 0);
  ok('off: light hidden', await p.isHidden('#gameLink'));

  console.log('errors', errs.length, errs.slice(0, 5));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
