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

/* A stand-in save file (Project64-EM's .fla), laid out as src/generated/save-layout.json says, with flags set the way
   OoTMM's Mark_Set (mark.c) sets them. */
const OOTMM = process.env.OOTMM_SRC || path.join(__dirname, '../../OoTMM-v33');
const LAYOUT = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/generated/save-layout.json'), 'utf8'));
const CHECKS = JSON.parse(fs.readFileSync(path.join(OOTMM, 'packages/data/dist/lib/data-checks.json'), 'utf8'));
function makeSave(slots, swap = i => i) {
  const L = LAYOUT, O = L.offsets, b = new Uint8Array(0x20000);
  const or32 = (at, n) => { const v = ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) | (1 << n); b[at] = v >>> 24; b[at + 1] = (v >>> 16) & 255; b[at + 2] = (v >>> 8) & 255; b[at + 3] = v & 255; };
  const or8 = (at, n) => { b[at + (n >> 3)] |= 1 << (n & 7); };
  slots.forEach(({ name, locations }, s) => {
    const oot = L.files.oot[0] + L.files.oot[1] * s, mm = L.files.mm[0] + L.files.mm[1] * s, cu = L.files.custom[0] + L.files.custom[1] * s;
    [...'ZELDAZ'].forEach((ch, k) => { b[oot + O.ootNewf + k] = ch.charCodeAt(0); });
    for (let k = 0; k < 8; k++) b[oot + O.ootName + k] = L.names.space;
    [...name].forEach((ch, k) => { b[oot + O.ootName + k] = ch.charCodeAt(0) - 65 + L.names.upper; });
    for (const loc of locations) {
      const c = CHECKS.find(x => x.location === loc), key = c.key >>> 0, scene = (key >>> 16) & 255, room = (key >>> 8) & 255, id = key & 255;
      const op = (L.merges[c.game][scene] ?? scene);
      if (c.ov === 'xflag') or8(cu + O.xflags, (room << 8) | id);
      else if (c.game === 'oot' && c.ov === 'chest') or32(oot + O.ootPerm + O.ootPermSize * op + O.ootChests, id);
      else if (c.game === 'mm' && c.ov === 'chest') or32(mm + O.mmPerm + O.mmPermSize * op + O.mmChest, id);
      else if (c.ov === 'npc') or8(cu + (c.game === 'oot' ? O.ootNpc : O.mmNpc), id);
      else if (c.ov === 'shop') or8(cu + (c.game === 'oot' ? O.ootShops : O.mmShops), id);
      else throw new Error('test save: no setter for ' + c.game + ' ' + c.ov);
    }
  });
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[swap(i)] = b[i];
  return Buffer.from(out).toString('base64');
}

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

  /* Catch-up from the save file. File 1 ("A", the playing game) has one check of each kind listed; file 2 ("B") has others. */
  const st = await state();
  const free = ids.filter(i => !st.done.includes(i));
  const kinds = [['oot', 'xflag'], ['oot', 'chest'], ['oot', 'npc'], ['mm', 'xflag'], ['mm', 'chest'], ['mm', 'npc']];
  const mine = kinds.map(([g, ov]) => free.find(i => { const c = CHECKS.find(x => x.location === i); return c && c.game === g && c.ov === ov; })).filter(Boolean);
  const theirs = free.filter(i => !mine.includes(i) && ['xflag', 'chest'].includes(CHECKS.find(x => x.location === i)?.ov)).slice(0, 3);
  console.log('  save file checks:', mine.join(' | '));
  await p.evaluate(([a, sw]) => {
    window.__saveFiles = { '/saves/OoTMM.fla': [a, 1000], '/saves/swapped.fla': [sw, 2000] };
    window.__savePickNext = '/saves/OoTMM.fla';
    const bytes = b64 => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    window.ootmmSave = {
      pick: async () => window.__savePickNext,
      stat: async f => window.__saveFiles[f]?.[1] ?? null,
      read: async f => window.__saveFiles[f] ? bytes(window.__saveFiles[f][0]) : null,
    };
  }, [makeSave([{ name: 'A', locations: mine }, { name: 'B', locations: theirs }]), makeSave([{ name: 'A', locations: mine }], i => i ^ 3)]);
  await p.evaluate(() => window.__feed({ type: 'GAME_START', sessionId: 'bbbb', playerName: 'A' }));
  await p.click('[data-game-track-set="1"]').catch(() => {});
  await p.click('[data-setview=game]'); await p.click('[data-setview=look]');
  await p.waitForSelector('[data-save-pick]');
  const after = await p.evaluate(() => document.querySelector('#gameState')?.nextElementSibling?.textContent);
  ok('save file section sits right under the Game tracking status', after === 'Save file', after);
  await p.click('[data-save-pick]');
  await p.waitForTimeout(800);
  s = await state();
  ok('catch-up ticked every saved check of file A', mine.length >= 4 && mine.every(i => s.done.includes(i)), `${mine.filter(i => s.done.includes(i)).length}/${mine.length}`);
  ok("catch-up left file B's checks alone", theirs.every(i => !s.done.includes(i)));
  ok('catch-up logs no items', mine.every(i => !s.found[i]));
  ok('save note says what was read', /file "A"/.test(await p.textContent('#saveState')), await p.textContent('#saveState'));
  await p.locator('#saveState').scrollIntoViewIfNeeded();
  await p.locator('#saveState').evaluate(e => e.closest('.box').scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: '.cache/shots/save-file.png' });

  /* Saving again in the game: the app sees the file change and ticks the new check. */
  const later = theirs[0];
  await p.evaluate(([a]) => { window.__saveFiles['/saves/OoTMM.fla'] = [a, 1500]; }, [makeSave([{ name: 'A', locations: [...mine, later] }, { name: 'B', locations: [] }])]);
  await p.waitForTimeout(3800);
  s = await state();
  ok('a new in-game save is picked up by itself', s.done.includes(later));

  /* The other byte order Project64 may use. */
  await p.evaluate(() => { window.__savePickNext = '/saves/swapped.fla'; });
  await p.click('[data-save-pick]');
  await p.waitForTimeout(600);
  ok('word-swapped save file reads', /file "A"/.test(await p.textContent('#saveState')), await p.textContent('#saveState'));

  /* Two files and no name to go by: the player picks. */
  await p.evaluate(([a]) => { window.__saveFiles['/saves/two.fla'] = [a, 3000]; window.__savePickNext = '/saves/two.fla'; }, [makeSave([{ name: 'C', locations: [] }, { name: 'D', locations: theirs.slice(1) }])]);
  await p.click('[data-save-pick]');
  await p.waitForTimeout(600);
  ok('two files: asks which one', await p.isVisible('[data-save-slot="1"]'));
  await p.click('[data-save-slot="1"]');
  await p.waitForTimeout(600);
  s = await state();
  ok('picked file D is caught up', theirs.slice(1).every(i => s.done.includes(i)));
  ok('entrances still untouched', JSON.stringify(s.entrances) === JSON.stringify(before.entrances));

  await p.click('[data-game-track-set="0"]');
  await p.waitForTimeout(200);
  ok('off: sockets closed', (await p.evaluate(() => window.__feedSockets.length)) === 0);
  ok('off: light hidden', await p.isHidden('#gameLink'));

  console.log('errors', errs.length, errs.slice(0, 5));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
