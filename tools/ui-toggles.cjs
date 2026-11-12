// Uses every settings control in the app, one value at a time, and checks the settings string it saves and
// the number of checks it shows both match OoTMM. Make the expected results first with
// `node tools/ui-toggles-data.mjs`, then run NODE_PATH=$(npm root -g) node tools/ui-toggles.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const data = JSON.parse(fs.readFileSync('.cache/ui-toggles.json', 'utf8'));
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const PORT = Number(process.env.PORT ?? 8942);
let pass = 0, fail = 0;
const bad = (msg) => { fail++; console.log('FAIL ' + msg); };
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const diffs = [];
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  for (const base of data.baselines) {
    if (only && !base.cases.some(c => only.test(`${base.name} | ${c.key}`))) continue;
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForSelector('.row');
    await p.click('.rail .tab[data-tab=settings]'); await p.waitForSelector('#setScroll');
    await p.click('[data-changes="0"]');
    const saved = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return s.seeds.find(x => x.id === s.current).settings; });
    const count = async (want) => {
      let last = '';
      for (let i = 0; i < 120; ++i) {
        last = (await p.textContent('#countPill').catch(() => '')) || '';
        const n = Number(last.replace(/[^\d]/g, ''));
        if (!/Updating/.test(last) && n === want) return n;
        await p.waitForTimeout(100);
      }
      return Number(last.replace(/[^\d]/g, '')) || last;
    };
    const load = async () => {
      await p.evaluate(s => { document.getElementById('importText').value = s; document.querySelector('[data-import]').click(); }, base.string);
      await p.waitForTimeout(300);
      return count(base.count);
    };
    const start = await load();
    if (start !== base.count) bad(`${base.name}: starts with ${start} checks, OoTMM ${base.count}`);
    let n = 0;
    for (const c of base.cases) {
      n++;
      if (only && !only.test(`${base.name} | ${c.key}`)) continue;
      await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
      await p.fill('#setSearch', c.key);
      await p.waitForFunction(k => [...document.querySelectorAll('#setScroll [data-bool],#setScroll [data-enum],#setScroll [data-num],#setScroll [data-setmode]')].some(e => Object.values(e.dataset).includes(k)), c.key, { timeout: 5000 }).catch(() => {});
      try {
        if (c.type === 'boolean') await p.click(`[data-bool="${c.key}"]`, { timeout: 3000 });
        else if (c.type === 'enum') await p.selectOption(`[data-enum="${c.key}"]`, c.ui, { timeout: 3000 });
        else if (c.type === 'number') { await p.fill(`[data-num="${c.key}"]`, String(c.ui), { timeout: 3000 }); await p.press(`[data-num="${c.key}"]`, 'Tab'); }
        else if (c.type === 'set') {
          if (Array.isArray(c.ui)) { await p.click(`[data-setmode="${c.key}"][data-mode="specific"]`, { timeout: 3000 }); await p.click(`[data-setval="${c.key}"][data-val="${c.ui[1]}"]`, { timeout: 3000 }); }
          else await p.click(`[data-setmode="${c.key}"][data-mode="${c.ui}"]`, { timeout: 3000 });
        }
      } catch (e) { bad(`${base.name} | ${c.key}=${JSON.stringify(c.ui)}: no working control (${String(e).split('\n')[0].slice(0, 100)})`); await load(); continue; }
      let str = await saved();
      for (let i = 0; i < 50 && str !== c.string; ++i) { await p.waitForTimeout(100); str = await saved(); }
      const got = await count(c.count);
      const okStr = str === c.string, okCount = got === c.count;
      if (okStr && okCount) pass++;
      else { if (!okStr) diffs.push({ base: base.name, key: c.key, ui: c.ui, got: str, want: c.string }); bad(`${base.name} | ${c.key}=${JSON.stringify(c.ui)}: ${okStr ? '' : 'saved settings differ from OoTMM\'s. '}${okCount ? '' : `shows ${got} checks, OoTMM ${c.count}`}`); }
      if (n % 50 === 0) console.log(`  ${base.name}: ${n}/${base.cases.length}`);
      if (str !== base.string) { const back = await load(); if (back !== base.count) bad(`${base.name}: reset after ${c.key} shows ${back}`); }
    }
    if (errs.length) bad(`${base.name}: page errors ${errs.slice(0, 3).join(' | ')}`);
    await p.close();
  }
  fs.writeFileSync('.cache/ui-toggles-diffs.json', JSON.stringify(diffs));
  console.log(`${pass} passed, ${fail} failed. Settings no baseline shows: ${data.never.length ? data.never.join(' ') : 'none'}`);
  process.exitCode = fail ? 1 : 0;
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
