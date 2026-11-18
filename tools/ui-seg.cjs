// Browser test: every segmented option group (.seg) ends at its last button, on every Settings page,
// every theme, at PC and phone widths. Run with NODE_PATH=$(npm root -g) node tools/ui-seg.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
let fails = 0, checked = 0;
const shot = '.cache/shots/';
(async () => {
  fs.mkdirSync(shot, { recursive: true });
  await new Promise(r => srv.listen(8951, r));
  const b = await chromium.launch();
  for (const [label, vp] of [['pc', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8951/'); await p.waitForSelector('.row', { state: 'attached' });
    const openSettings = async () => { await p.evaluate(() => document.querySelector('.tab[data-tab=settings]')?.click()); await p.waitForSelector('.subnav'); };
    await openSettings();
    const skins = await p.$$eval('.skin-grid [data-skin]', els => els.map(e => e.getAttribute('data-skin'))).catch(() => []);
    await p.click('[data-setview=look]'); await p.waitForTimeout(300);
    const skinList = await p.$$eval('.skin-grid button', els => els.map((e, i) => i));
    for (const si of skinList) {
      await openSettings();
      await p.click('[data-setview=look]'); await p.waitForTimeout(200);
      await p.locator('.skin-grid button').nth(si).click(); await p.waitForTimeout(300);
      for (const view of ['game', 'look', 'pins', 'edits']) {
        await openSettings();
        await p.click(`[data-setview=${view}]`); await p.waitForTimeout(300);
        if (view === 'game') await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
        const res = await p.$$eval('.seg', segs => segs.filter(s => s.offsetParent).map(s => {
          const r = s.getBoundingClientRect(); const bs = [...s.children].filter(c => c.offsetParent);
          if (!bs.length) return null;
          const right = Math.max(...bs.map(c => c.getBoundingClientRect().right));
          const bottom = Math.max(...bs.map(c => c.getBoundingClientRect().bottom));
          const pr = s.parentElement.getBoundingClientRect();
          return { name: s.getAttribute('aria-label') || s.className, gap: Math.round(r.right - right), gapB: Math.round(r.bottom - bottom), over: Math.round(r.right - Math.min(pr.right, innerWidth)) };
        }).filter(Boolean));
        for (const x of res) {
          checked++;
          const bad = x.gap > 2 || x.gapB > 2 || x.over > 1;
          if (bad) { fails++; if (fails < 40) console.log(`FAIL ${label} skin#${si} ${view} "${x.name}" extra=${x.gap}px below=${x.gapB}px past-edge=${x.over}px`); }
        }
        if (si === 0) await p.screenshot({ path: `${shot}seg-${label}-${view}.png`, fullPage: false });
      }
    }
    await ctx.close();
  }
  console.log(`${fails ? 'FAIL' : 'PASS'} ${checked} option groups checked, ${fails} too wide`);
  if (fails) process.exitCode = 1;
  await b.close(); srv.close();
})();
