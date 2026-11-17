// Browser test for the Notes tab: formatting, page options, older plain notes, pasted content being cleaned,
// Edit mode, reloads and transfer codes. Run with NODE_PATH=$(npm root -g) node tools/ui-notes.cjs after npm run build.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const KEY = 'ootmm-checklist-v1';
const PORT = Number(process.env.PORT ?? 8940);
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  /* The sidebar's headings start folded in the app; these tests open them all to reach areas. */
  { const nc = b.newContext.bind(b); b.newContext = async o => { const c = await nc(o); await c.addInitScript(() => { window.__OOTMM_RAIL_OPEN__ = true; }); return c; }; }
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));

  /* An older save with plain notes */
  await p.goto(`http://localhost:${PORT}/`); await p.waitForSelector('.row');
  await p.click('.rail .tab[data-tab=seeds]'); await p.click('[data-new]'); await p.waitForTimeout(500);
  await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); const cur = s.seeds.find(x => x.id === s.current); cur.pad = 'Old note line 1\nOld <b>line</b> 2'; delete cur.doc; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await p.reload(); await p.waitForSelector('.row');
  const tabs = await p.evaluate(() => [...document.querySelectorAll('.rail .tab')].map(t => t.dataset.tab).join(','));
  ok('Notes sits between Entrances and Items', tabs.startsWith('list,entrances,notes,items'), tabs);
  await p.click('.rail .tab[data-tab=notes]'); await p.waitForSelector('#docPage');
  const old = await p.innerHTML('#docPage');
  ok('older plain notes move over as text', old.includes('Old note line 1') && old.includes('Old &lt;b&gt;line&lt;/b&gt; 2'), old);
  await p.click('.rail .tab[data-tab=seeds]');
  const seedsText = await p.textContent('#pane');
  ok('the Coop tab outside the hosted page explains its state', await (async () => { await p.click('.rail .tab[data-tab=coop]'); const t = await p.textContent('#pane'); await p.click('.rail .tab[data-tab=seeds]'); return /hosted page|coop server|Connecting to coop/.test(t) && !(await p.$('[data-live-start]')); })());
  ok('the Seeds tab has no notes or phone sections', !/Notes for this seed|Using this on your phone|Keep it on your phone/.test(seedsText) && !(await p.$('#seedPad')));
  await p.click('.rail .tab[data-tab=notes]'); await p.waitForSelector('#docPage');

  /* Formatting */
  await p.click('#docPage'); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
  await p.keyboard.type('Route'); await p.selectOption('[data-doc-block]', 'h2');
  await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.selectOption('[data-doc-block]', 'p');
  await p.keyboard.press('Control+b'); await p.keyboard.type('Bold bit'); await p.keyboard.press('Control+b');
  await p.keyboard.press('Enter'); await p.click('[data-doc=insertOrderedList]'); await p.keyboard.type('First'); await p.keyboard.press('Enter'); await p.keyboard.type('Second');
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter');
  await p.click('[data-doc=checklist]'); await p.keyboard.type('Get bow');
  await p.waitForTimeout(500);
  const doc = () => p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); return s.seeds.find(x => x.id === s.current).doc; }, KEY);
  const d1 = await doc();
  ok('headings save', /<h2>Route<\/h2>/.test(d1), d1);
  ok('bold saves', /font-weight: bold|<b>Bold bit|<strong>Bold bit/.test(d1));
  ok('numbered lists save', /<ol><li>First<\/li><li>Second<\/li><\/ol>/.test(d1));
  ok('checklists save', /class="doc-check"><li>Get bow/.test(d1));
  const box = await p.$('#docPage ul.doc-check > li');
  const bb = await box.boundingBox();
  await p.mouse.click(bb.x - 12, bb.y + bb.height / 2); await p.waitForTimeout(300);
  ok('a checklist line ticks from its box', /<li class="done">Get bow/.test(await doc()));
  ok('word count shows', /\d+ words/.test(await p.textContent('#docCount')), await p.textContent('#docCount'));
  ok('plain-text copy kept for older versions', (await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); return s.seeds.find(x => x.id === s.current).pad; }, KEY)).includes('Bold bit'));

  /* Page options */
  await p.selectOption('[data-doc-page]', 'a4'); await p.selectOption('[data-doc-zoom]', '1.25'); await p.click('[data-doc-paper]');
  const gaps = () => p.evaluate(() => { const d = document.querySelector('.doc-scroll').getBoundingClientRect(), g = document.getElementById('docPage').getBoundingClientRect(); return [Math.round(g.left - d.left), Math.round(d.right - g.right), Math.round(g.width)]; });
  const g125 = await gaps();
  ok('the page is centered at 125%', Math.abs(g125[0] - g125[1]) <= 2 && g125[0] >= 0, g125.join(' '));
  await p.selectOption('[data-doc-zoom]', '1'); const g100 = await gaps();
  ok('zoom makes the page bigger, still centered', g125[2] > g100[2] && Math.abs(g100[0] - g100[1]) <= 2, `${g100.join(' ')} vs ${g125.join(' ')}`);
  await p.selectOption('[data-doc-zoom]', '1.25');
  ok('page size, zoom and paper apply', await p.evaluate(() => { const d = document.querySelector('.doc-desk'); return d.classList.contains('size-a4') && d.classList.contains('paper') && d.style.getPropertyValue('--zoom') === '1.25'; }));

  /* Pasting is cleaned */
  await p.click('#docPage'); await p.keyboard.press('Control+End');
  await p.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<p onclick="alert(1)">Pasted <b>ok</b><img src=x onerror="window.__bad=1"><script>window.__bad=1</script><a href="javascript:alert(1)">link</a></p>');
    document.getElementById('docPage').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(400);
  const d2 = await doc();
  ok('pasted text arrives', d2.includes('Pasted'));
  ok('pasted scripts and handlers are removed', !/onclick|onerror|<script|<img|javascript:/i.test(d2) && !(await p.evaluate(() => window.__bad)));

  /* Undo keys stay in the page */
  ok('Ctrl+Z inside the page is the page undo', await p.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }); document.getElementById('docPage').dispatchEvent(e); return !document.querySelector('#toast:not([hidden])')?.textContent?.includes('Nothing to undo'); }));

  /* Edit mode still lets you type */
  await p.click('.rail [data-editmode]'); await p.waitForTimeout(200);
  await p.click('#docPage'); await p.keyboard.press('Control+End'); await p.keyboard.type(' typed in edit mode');
  await p.click('.rail [data-editmode]'); await p.waitForTimeout(400);
  ok('typing works in Edit mode', (await doc()).includes('typed in edit mode'));
  ok('no editor sheet opened', !(await p.$('.layer')));

  /* Reload and transfer */
  await p.reload(); await p.waitForSelector('.row');
  await p.click('.rail .tab[data-tab=notes]'); await p.waitForSelector('#docPage');
  ok('notes survive a reload', /Route/.test(await p.textContent('#docPage')) && (await p.$('#docPage h2')) !== null);
  await p.click('.rail .tab[data-tab=seeds]'); await p.click('[data-copycode]');
  await p.waitForFunction(() => document.querySelector('#codeBox')?.value.startsWith('OOTMM1.'), null, { timeout: 10000 }).catch(() => {});
  let code = await p.inputValue('#codeBox');
  if (!code.startsWith('OOTMM1.')) code = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const q = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); q.on('pageerror', e => errs.push(String(e)));
  await q.goto(`http://localhost:${PORT}/`); await q.waitForSelector('.row');
  await q.click('.rail .tab[data-tab=seeds]'); await q.fill('#codeBox', code); await q.click('[data-readcode]'); await q.waitForTimeout(800);
  await q.click('.rail .tab[data-tab=notes]'); await q.waitForSelector('#docPage');
  ok('a transfer code carries formatted notes', (await q.$('#docPage h2')) !== null && /Get bow/.test(await q.textContent('#docPage')));

  console.log('errors', errs.length, errs.slice(0, 5));
  if (errs.length) process.exitCode = 1;
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
