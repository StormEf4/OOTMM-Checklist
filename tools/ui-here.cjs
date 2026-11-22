// Browser test for "Where you are now" and directions. The sidebar panel stays put while the sidebar's list scrolls, shows
// where the game says the player is (through a stand-in OoTMM Client) or where they set it, marks it on the Entrances tab,
// and directions route only through entrances the player logged and ones the settings don't shuffle.
// Run with NODE_PATH=$(npm root -g) node tools/ui-here.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const PORT = Number(process.env.PORT ?? 8946);
const SHOTS = process.env.SHOTS ?? '.cache/shots';

/* The stand-in Client, as in ui-gamefeed-entrances.cjs. */
const FAKE = () => {
  const URL_BASE = 'http://feed.test';
  window.__OOTMM_GAME_FEED_URL__ = URL_BASE;
  window.__feedSockets = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (u, o) => String(u).startsWith(URL_BASE) ? new Response(JSON.stringify({ clients: [{ id: 'c0ffee' }] }), { headers: { 'content-type': 'application/json' } }) : realFetch(u, o);
  const RealWS = window.WebSocket;
  class FakeWS {
    constructor(url) {
      if (!String(url).startsWith('ws://feed.test')) return new RealWS(url);
      this.readyState = 0;
      window.__feedSockets.push(this);
      setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 10);
    }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; window.__feedSockets = window.__feedSockets.filter(s => s !== this); this.onclose?.({}); }
  }
  window.WebSocket = FakeWS;
  window.__feed = msg => { for (const s of window.__feedSockets) s.onmessage?.({ data: JSON.stringify(msg) }); return window.__feedSockets.length; };
};

async function setShuffle(p) {
  await p.click('.rail .tab[data-tab=settings]');
  await p.click('[data-setview=game]');
  await p.fill('#setSearch', 'interiors shuffle');
  await p.waitForTimeout(300);
  await p.selectOption('[data-enum=erIndoors]', 'full');
  await p.waitForTimeout(800);
  await p.fill('#setSearch', 'shuffle most interiors');
  await p.waitForTimeout(300);
  await p.click('[data-bool=erIndoorsMajor]');
  await p.waitForTimeout(1200);
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();
  const errs = [];

  /* ---- Windows app, with the game connected ---- */
  {
    const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; });
    await c.addInitScript(FAKE);
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
    const state = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1') ?? 'null'); return s?.seeds.find(x => x.id === s.current) ?? {}; });
    const feed = msgs => p.evaluate(ms => ms.forEach(m => window.__feed({ type: 'INFO_ENTRANCE', age: 'CHILD', ...m })), msgs);
    const panel = () => p.textContent('#here');

    ok('panel shows in the sidebar', await p.isVisible('#here'));
    ok('nothing set yet', /Where you are now/i.test(await panel()) && /Not set yet|Go through/.test(await panel()), await panel());
    /* It stays put while the list scrolls. */
    const y0 = (await p.locator('#here').boundingBox()).y;
    await p.evaluate(() => { const r = document.getElementById('regions'); r.scrollTop = r.scrollHeight; });
    await p.waitForTimeout(100);
    const scrolled = await p.evaluate(() => document.getElementById('regions').scrollTop);
    ok('stays put while the sidebar scrolls', scrolled > 100 && (await p.locator('#here').boundingBox()).y === y0, `scrolled ${scrolled}`);

    await setShuffle(p);
    await p.waitForFunction(() => window.__feedSockets.length > 0, null, { timeout: 10000 });
    await p.evaluate(() => window.__feed({ type: 'GAME_START', sessionId: 'aaaa', playerName: 'Link' }));

    /* Leaving Link's House (not shuffled with these settings): the game says Kokiri Forest. */
    await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LINK', entrance: 'OOT_KOKIRI_FOREST_FROM_LINK' }]);
    await p.waitForTimeout(400);
    let t = await panel();
    ok('game says Kokiri Forest', /Kokiri Forest/.test(t) && /From the game/.test(t), t);
    ok('names the door', /Came in by Exit of Link's House/.test(t), t);
    let s = await state();
    ok('saved with the seed', s.here?.place === 'OOT_KOKIRI_FOREST' && s.here?.by === 'game', JSON.stringify(s.here));
    ok('nothing logged (logging is off)', Object.keys(s.entrances).length === 0);
    ok('marked in the sidebar list', await p.isVisible('.reg.is-here[data-region="OOT_KOKIRI_FOREST"] .here-mark'));

    /* The game says the age too. */
    ok('age from the game', await p.getAttribute('[data-here-age="child"]', 'aria-pressed') === 'true');
    await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LINK', entrance: 'OOT_KOKIRI_FOREST_FROM_LINK', age: 'ADULT' }]);
    await p.waitForTimeout(300);
    ok('adult from the game', await p.getAttribute('[data-here-age="adult"]', 'aria-pressed') === 'true');
    await p.click('[data-here-age="child"]');
    await p.waitForTimeout(400);
    s = await state();
    ok('age set by hand', s.here?.age === 'child', JSON.stringify(s.here));

    /* Through Mido's door, which the game says led into Saria's House. */
    await feed([{ original: 'OOT_HOUSE_MIDO', entrance: 'OOT_HOUSE_SARIA' }]);
    await p.waitForTimeout(400);
    t = await panel();
    ok("now in Saria's House", /Saria's House/.test(t) && /Entrance to Mido's House/.test(t), t);

    /* Shows it on the Entrances tab: Kokiri Forest's section, with Mido's door highlighted. */
    await p.click('[data-here-show]');
    await p.waitForSelector('#entrScroll');
    ok('switches to Entrances', await p.getAttribute('.rail .tab[data-tab=entrances]', 'aria-current') === 'page');
    ok('area marked "You are here"', await p.isVisible('.here-sec .here-badge'));
    ok("Mido's door highlighted", await p.isVisible('.row.here-row [data-entr="OOT_HOUSE_MIDO"]'));
    ok('sidebar marks the area', await p.isVisible('.reg.is-here[data-entr-region="OOT_KOKIRI_FOREST"]'));
    await p.screenshot({ path: `${SHOTS}/here-entrances.png` });

    /* Directions from Kokiri Forest to Saria's House: closed until logged. */
    await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LINK', entrance: 'OOT_KOKIRI_FOREST_FROM_LINK' }]);
    await p.waitForTimeout(300);
    await p.click('[data-directions]');
    await p.waitForSelector('#placeSearch');
    await p.fill('#placeSearch', 'saria house');
    await p.waitForTimeout(300);
    await p.click('#placeList [data-place="a:OOT Saria\'s House"]');
    await p.waitForTimeout(200);
    ok('no way while unlogged', /No way there yet/.test(await p.textContent('.sheet')));
    await p.click('.sheet .btn[data-sheet-close]');

    /* Log Mido's door by hand: now one step. */
    await p.click('[data-entr="OOT_HOUSE_MIDO"]');
    await p.fill('#pickSearch', 'saria');
    await p.waitForTimeout(300);
    await p.click('#pickList [data-pick="OOT_HOUSE_SARIA"]');
    await p.waitForTimeout(300);
    s = await state();
    ok('logged', s.entrances.OOT_HOUSE_MIDO === 'OOT_HOUSE_SARIA');
    ok('the game still says where you are', s.here?.place === 'OOT_KOKIRI_FOREST', JSON.stringify(s.here));
    await p.click('[data-directions]');
    await p.waitForSelector('.route .step');
    const steps = await p.$$eval('.route .step:not(.end) .t', x => x.map(e => e.textContent.trim()));
    ok('one step, through the logged door', steps.length === 1 && /Take Entrance to Mido's House/.test(steps[0]), steps.join(' | '));
    ok('says it was logged', /You logged this/.test(await p.textContent('.route')));
    await p.screenshot({ path: `${SHOTS}/directions-short.png` });
    await p.click('.sheet .btn[data-sheet-close]');
    t = await panel();
    ok('sidebar follows it', /Heading to Saria's House/.test(t) && /Next: take Entrance to Mido's House/.test(t), t);

    /* Walking in gets you there: directions end. */
    await feed([{ original: 'OOT_HOUSE_MIDO', entrance: 'OOT_HOUSE_SARIA' }]);
    await p.waitForTimeout(400);
    s = await state();
    ok('arriving ends the directions', !s.goal && !/Heading to/.test(await panel()), JSON.stringify(s.goal));

    /* A long way, through roads the settings don't shuffle. */
    await feed([{ original: 'OOT_KOKIRI_FOREST_FROM_LINK', entrance: 'OOT_KOKIRI_FOREST_FROM_LINK' }]);
    await p.waitForTimeout(300);
    await p.click('[data-directions]');
    await p.fill('#placeSearch', 'fire temple');
    await p.waitForTimeout(300);
    await p.click('#placeList .pick >> nth=0');
    await p.waitForSelector('.route .step');
    const long = await p.$$eval('.route .step:not(.end) .t', x => x.map(e => e.textContent.trim()));
    ok('Kokiri Forest to the Fire Temple', long.length >= 3 && long.some(x => /Lost Woods/.test(x)) && /Fire Temple/.test(long[long.length - 1]), long.join(' | '));
    ok('marks roads that are not shuffled', /Not shuffled/.test(await p.textContent('.route')));
    ok('no items logged: says the way ignores items', await p.isVisible('.route-warn'));
    /* More than one way: pick another, and the sidebar follows it. */
    ok('offers other ways', (await p.$$('.route-pick [data-route]')).length > 1);
    await p.click('.route-pick [data-route="1"]');
    await p.waitForTimeout(500);
    const other = await p.$$eval('.route .step:not(.end) .t', x => x.map(e => e.textContent.trim()));
    ok('another way shows', other.join('|') !== long.join('|') && await p.getAttribute('[data-route="1"]', 'aria-pressed') === 'true', other.join(' | '));
    s = await state();
    ok('the picked way is saved', Array.isArray(s.via) && s.via.length > 0, JSON.stringify(s.via));
    const first = other[0].replace(/^(Take|Play|Walk)/, w => w.toLowerCase());
    ok('sidebar follows the picked way', (await panel()).includes('Next: ' + first), await panel());
    await p.screenshot({ path: `${SHOTS}/directions-long.png` });
    await p.click('.sheet .btn[data-sheet-close]');

    /* Edit mode: the panel's buttons still work. */
    await p.click('.edit-slot [data-editmode]');
    await p.click('[data-directions]');
    ok('Directions works in Edit mode', await p.isVisible('.sheet .route, .sheet #placeSearch'));
    await p.click('.sheet .btn[data-sheet-close]');
    await p.click('[data-goal-stop]');
    ok('Stop works in Edit mode', !/Heading to/.test(await panel()));
    await p.click('.edit-slot [data-editmode]');
    await p.click('.rail .tab[data-tab=list]');
    await p.screenshot({ path: `${SHOTS}/here-panel.png`, clip: { x: 0, y: 0, width: 330, height: 800 } });
    await c.close();
  }

  /* ---- Phone, no game: the player sets where they are ---- */
  {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; });
    /* An older save, with nothing about where you are, and one with a broken value: both load. */
    await c.addInitScript(() => {
      if (localStorage.getItem('ootmm-checklist-v1')) return;
      const seed = { id: 'old1', name: 'Old seed', settings: '', done: [], skipped: [], skippedRegions: [], rolled: {}, entrances: {}, notes: {}, pad: '', found: {}, have: { OOT_OCARINA: 1, OOT_SONG_ZELDA: 1 }, hints: {}, updated: 1, here: 5, goal: { x: 1 } };
      localStorage.setItem('ootmm-checklist-v1', JSON.stringify({ v: 1, seeds: [seed], current: 'old1', custom: [], edits: {}, ui: {} }));
    });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
    ok('older save loads', /Old seed/.test(await p.textContent('#seedName')));
    ok('panel on the phone sidebar', await p.isVisible('#here'));
    await p.click('[data-here-set]');
    await p.fill('#placeSearch', 'lake');
    await p.waitForTimeout(300);
    await p.click('#placeList [data-place="OOT_LAKE_HYLIA"]');
    await p.waitForTimeout(300);
    const t = await p.textContent('#here');
    ok('set by hand', /Lake Hylia/.test(t) && /Set by you/.test(t), t);
    await p.click('[data-directions]');
    await p.fill('#placeSearch', 'zora domain');
    await p.waitForTimeout(300);
    await p.click('#placeList .pick >> nth=0');
    await p.waitForSelector('.route .step');
    ok('route on the phone', (await p.$$('.route .step')).length >= 2);
    await p.waitForFunction(() => /follows OoTMM/.test(document.querySelector('.sheet')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
    ok('with the Ocarina and Lullaby it follows the rules', !(await p.isVisible('.route-warn')) && /follows OoTMM/.test(await p.textContent('.sheet')), await p.textContent('.sheet'));
    await p.screenshot({ path: `${SHOTS}/directions-phone.png` });
    await p.click('.sheet .btn[data-sheet-close]');
    await p.screenshot({ path: `${SHOTS}/here-phone.png` });
    await c.close();
  }

  /* ---- Spawns: always on the Entrances tab, and directions go back to them from anywhere ---- */
  {
    const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; });
    await c.addInitScript(() => {
      if (localStorage.getItem('ootmm-checklist-v1')) return;
      const seed = { id: 'sp1', name: 'Spawn seed', settings: '', done: [], skipped: [], skippedRegions: [], rolled: {}, entrances: {}, notes: {}, pad: '', found: {}, have: { OOT_OCARINA: 1, OOT_SONG_ZELDA: 1 }, hints: {}, updated: 1, here: { place: 'OOT_ZORA_DOMAIN', by: 'you', age: 'child' } };
      localStorage.setItem('ootmm-checklist-v1', JSON.stringify({ v: 1, seeds: [seed], current: 'sp1', custom: [], edits: {}, ui: {} }));
    });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 30000 });
    await setShuffle(p);
    await p.click('.rail .tab[data-tab=entrances]');
    await p.waitForTimeout(800);
    await p.click('[data-entr-region="@spawns"]');
    await p.waitForTimeout(800);
    const main = await p.textContent('main');
    ok('spawns listed when not shuffled', /Where you start/.test(main) && /Child spawn/.test(main) && /always Link's House/.test(main) && /Adult spawn/.test(main) && /always Temple of Time/.test(main));
    await p.screenshot({ path: `${SHOTS}/spawns.png` });
    await p.click('[data-directions]');
    await p.fill('#placeSearch', "link's house");
    await p.waitForTimeout(300);
    await p.click('#placeList .pick >> nth=0');
    await p.waitForSelector('.route .step');
    await p.waitForFunction(() => /follows OoTMM/.test(document.querySelector('.sheet')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
    const r = await p.textContent('.sheet');
    ok('child goes back to the child spawn', /Go back to your child spawn/.test(r) && /Save and reset/.test(r) && (await p.$$('.route .step')).length === 2, r.replace(/\s+/g, ' ').slice(0, 400));
    await p.screenshot({ path: `${SHOTS}/directions-spawn.png` });
    await c.close();
  }

  console.log('errors', errs.length, errs.slice(0, 5));
  ok('no page errors', errs.length === 0);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
