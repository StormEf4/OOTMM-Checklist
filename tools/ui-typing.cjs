/* Typing in a search box must leave that box in place. Swapping in a new box on each keystroke made Android close and
   reopen the keyboard and scroll the page to find the new box. Run with NODE_PATH=$(npm root -g) node tools/ui-typing.cjs */
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const types = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

(async () => {
  await new Promise(r => srv.listen(8937, r));
  const b = await chromium.launch();
  const errs = [];
  const open = async opts => {
    const c = await b.newContext(opts);
    await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; window.__OOTMM_MAIN_OPEN__ = true; });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:8937/');
    await p.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]', { timeout: 20000 });
    return p;
  };
  /* Types into a box one key at a time, then checks it's still the same box, still focused, and nothing scrolled. */
  const typeIn = async (p, sel, scroller, text, label) => {
    await p.evaluate(s => { const sc = document.querySelector(s); if (sc) sc.scrollTop = 120; }, scroller);
    await p.tap?.(sel).catch(() => p.click(sel));
    await p.evaluate(sel => { document.querySelector(sel).dataset.same = '1'; }, sel);
    const before = await p.evaluate(s => document.querySelector(s)?.scrollTop ?? 0, scroller);
    await p.keyboard.type(text, { delay: 140 });
    await p.waitForTimeout(400);
    const st = await p.evaluate(([sel, s]) => {
      const el = document.querySelector(sel);
      return { same: el?.dataset.same === '1', focused: document.activeElement === el, value: el?.value, page: document.scrollingElement.scrollTop, scroller: document.querySelector(s)?.scrollTop ?? 0 };
    }, [sel, scroller]);
    ok(st.same, `${label}: the box stays the same while typing`);
    ok(st.focused, `${label}: the box keeps focus`);
    ok(st.value === text, `${label}: the box holds "${text}" (has "${st.value}")`);
    ok(st.page === 0, `${label}: the page itself didn't scroll (${st.page})`);
    return { before, after: st.scroller };
  };

  const meta = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? '';
  ok(meta.includes('interactive-widget=resizes-content'), 'phone site shrinks to fit above the Android keyboard');

  for (const [name, opts] of [['Android', devices['Pixel 7']], ['PC', { viewport: { width: 1280, height: 800 } }]]) {
    const p = await open(opts);
    if (name === 'Android') { await p.tap('.reg[data-region="OOT_KOKIRI_FOREST"]'); await p.waitForTimeout(250); }
    const rowsBefore = await p.locator('#listScroll .row').count();
    await typeIn(p, '#search', '#listScroll', 'deku', `${name} checks search`);
    const rowsAfter = await p.locator('#listScroll .row').count();
    ok(rowsAfter > 0 && rowsAfter !== rowsBefore, `${name} checks search still updates the list (${rowsBefore} to ${rowsAfter})`);
    await p.fill('#search', '');
    await p.waitForTimeout(300);

    const tabSel = name === 'Android' ? '.bottom .tab' : '.rail .tab';
    await p.click(`${tabSel}[data-tab=settings]`);
    await p.waitForSelector('#setSearch');
    await typeIn(p, '#setSearch', '#setScroll', 'cow', `${name} settings search`);
    ok(await p.locator('[data-bool=cowShuffleOot]').count() === 1, `${name} settings search still finds settings`);

    await p.click(`${tabSel}[data-tab=items]`);
    await p.waitForSelector('#itemSearch');
    await typeIn(p, '#itemSearch', '#itemScroll', 'bow', `${name} items search`);

    /* Notes: a re-render while typing (as when logic finishes or a coop change lands) keeps the page being typed in. */
    await p.click(`${tabSel}[data-tab=notes]`);
    await p.waitForSelector('#docPage');
    await p.click('#docPage');
    await p.evaluate(() => { document.querySelector('#docPage').dataset.same = '1'; });
    await p.keyboard.type('Bow in Deku', { delay: 60 });
    await p.click(`${tabSel}[data-tab=notes]`).catch(() => {});
    const notes = await p.evaluate(() => ({ text: document.querySelector('#docPage')?.innerText }));
    ok(/Bow in Deku/.test(notes.text ?? ''), `${name} notes keep what was typed`);
    await p.context().close();
  }
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  console.log(fails ? `${fails} failed` : 'all passed');
  await b.close(); srv.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
