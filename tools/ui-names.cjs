// Browser test for check names: the three-way names slider, quick renaming without Edit mode, the rename list,
// sharing names, and renames surviving reloads, quick closes, new seeds, settings changes, transfer codes and
// older saves. Run with NODE_PATH=$(npm root -g) node tools/ui-names.cjs after npm run build.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const KEY = 'ootmm-checklist-v1';
const PORT = Number(process.env.PORT ?? 8938);
const MIDO = "OOT Mido's House Top Left";
const HP = 'OOT Hyrule Field Grotto Tektite HP';
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/`); await p.waitForSelector('.row');
  const wait = (ms = 300) => p.waitForTimeout(ms);
  const store = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const rowName = id => p.evaluate(id => document.querySelector(`.row[data-id="${CSS.escape(id)}"] .t`)?.textContent ?? null, id);
  /* Each check's name, found by a word in its id that a rename doesn't change. */
  const nameOf = async id => { await searchList(id === MIDO ? 'mido' : 'tektite'); return rowName(id); };
  const searchList = async q => { await p.fill('#search', q); await wait(400); };
  const toChecks = async () => { await p.click('.rail .tab[data-tab=list]'); await p.waitForSelector('.row'); };
  const toNames = async () => { await p.click('.rail .tab[data-tab=settings]'); await p.click('[data-setview=edits]'); await p.waitForSelector('#renameSearch'); };
    const remain = () => p.textContent('#remain');

  const midoOrig = await nameOf(MIDO), hpOrig = await nameOf(HP);
  ok('starts on the names it had before', midoOrig === "Mido's House Top Left" && hpOrig === 'Grotto Tektite HP', `${midoOrig} | ${hpOrig}`);

  /* The slider */
  await toNames();
  ok('names slider shows, set to Your names', (await p.getAttribute('[data-names-set=custom]', 'aria-pressed')) === 'true');
  await p.click('[data-names-set=player]'); await wait();
  await toChecks();
  ok('player names swap the short codes', (await nameOf(HP)) === 'Grotto Tektite Heart Piece', await nameOf(HP));
  await searchList('tektite heart piece'); ok('search finds a player name', (await rowName(HP)) !== null);
  await searchList('tektite hp'); ok("search still finds OoTMM's name", (await rowName(HP)) !== null);
  await searchList('sheik'); ok('known nicknames show', (await p.textContent('#listScroll')).includes('Sheik in Crater'));

  /* Right-click renames without Edit mode, and does not tick the check */
  await searchList('mido');
  const left = await remain();
  await p.click(`.row[data-id="${MIDO}"] .tick-btn`, { button: 'right' }); await p.waitForSelector('#edName');
  ok('right-click opens the rename box', (await p.inputValue('#edName')) === "Mido's House Top Left");
  await p.fill('#edName', 'Mido 1'); await p.press('#edName', 'Enter'); await wait();
  ok('Enter saves the rename', (await rowName(MIDO)) === 'Mido 1', await rowName(MIDO));
  ok('right-click did not tick it', (await remain()) === left);
  ok('renaming switches to Your names on player names', (await store()).ui.names === 'custom' && (await store()).ui.nameBase === 'player');
  ok('other checks keep player names under Your names', (await nameOf(HP)) === 'Grotto Tektite Heart Piece');
  await searchList('mido 1'); ok('search finds your name', (await rowName(MIDO)) === 'Mido 1');
  await searchList("mido's house top left"); ok("search finds it by OoTMM's name", (await rowName(MIDO)) === 'Mido 1');

  /* The rename list */
  await toNames();
  ok('rename list shows what you renamed', (await p.$$('[data-rename]')).length === 1 && (await p.inputValue('[data-rename]')) === 'Mido 1');
  await p.fill('#renameSearch', 'tektite'); await wait(400);
  await p.fill(`[data-rename="${HP}"]`, 'House skull'); await wait(400);
  await toChecks();
  ok('typing in the rename list renames', (await nameOf(HP)) === 'House skull', await nameOf(HP));

  /* Original names hide renames without losing them */
  await toNames(); await p.fill('[data-names-range]', '0'); await p.dispatchEvent('[data-names-range]', 'change'); await wait();
  await toChecks();
  ok('OoTMM names hide your renames', (await nameOf(MIDO)) === "Mido's House Top Left" && (await nameOf(HP)) === 'Grotto Tektite HP');
  ok('renames are still saved', (await store()).edits.checks[MIDO]?.name === 'Mido 1');
  await toNames(); await p.click('[data-names-set=custom]'); await wait();
  await toChecks();
  ok('Your names now builds on OoTMM names', (await nameOf(MIDO)) === 'Mido 1' && (await nameOf(HP)) === 'House skull');

  /* Edit mode still renames */
  await searchList('mido');
  await p.click('.rail [data-editmode]'); await wait();
  await p.click(`.row[data-id="${MIDO}"] .tick-btn .t`); await p.waitForSelector('#edName');
  await p.fill('#edName', 'Mido house'); await p.click('.layer:last-child [data-act=save]'); await wait();
  await p.click('.rail [data-editmode]'); await wait();
  ok('Edit mode renames too', (await rowName(MIDO)) === 'Mido house');

  /* A quick close straight after a rename */
  await p.click(`.row[data-id="${MIDO}"] .tick-btn`, { button: 'right' }); await p.waitForSelector('#edName');
  await p.fill('#edName', 'Mido quick'); await p.press('#edName', 'Enter');
  await p.reload(); await p.waitForSelector('.row');
  ok('a rename right before closing is kept', (await nameOf(MIDO)) === 'Mido quick', await nameOf(MIDO));

  /* New seed and settings changes */
  await p.click('.rail .tab[data-tab=seeds]'); await p.click('[data-new]'); await wait(800);
  await toChecks();
  ok('a new seed keeps your names', (await nameOf(MIDO)) === 'Mido quick');
  await p.click('.rail .tab[data-tab=settings]'); await p.click('[data-setview=game]'); await p.waitForSelector('#setScroll');
  await p.fill('#setSearch', 'skulltula tokens'); await wait(500);
  await p.selectOption('[data-enum=goldSkulltulaTokens]', 'all'); await wait(1500);
  await toChecks();
  ok('a settings change keeps your names', (await nameOf(MIDO)) === 'Mido quick' && (await nameOf(HP)) === 'House skull');

  /* Sharing names */
  await toNames();
  await p.click('.rn-share summary');
  await p.fill('#namesText', `${HP} = Skull in the house\nOOT Not A Real Check = Nope\nnonsense line`);
  await p.click('[data-names-add]'); await wait();
  ok('pasted names are added, unknown checks left out', (await store()).edits.checks[HP]?.name === 'Skull in the house' && !(await store()).edits.checks['OOT Not A Real Check']);
  await p.click('[data-names-copy]'); await wait();
  ok('copy lists your names', (await p.inputValue('#namesText')).includes(`${MIDO} = Mido quick`));

  /* A transfer code from another device adds its names and keeps the ones only on this device */
  await p.click('.rail .tab[data-tab=seeds]'); await p.click('[data-copycode]');
  await p.waitForFunction(() => document.querySelector('#codeBox')?.value.startsWith('OOTMM1.'), null, { timeout: 10000 }).catch(() => {});
  let code = await p.inputValue('#codeBox');
  if (!code.startsWith('OOTMM1.')) code = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const other = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  other.on('pageerror', e => errs.push(String(e)));
  await other.goto(`http://localhost:${PORT}/`); await other.waitForSelector('.row');
  await other.click('.rail .tab[data-tab=settings]'); await other.click('[data-setview=edits]'); await other.click('.rn-share summary');
  await other.fill('#namesText', 'OOT Kokiri Forest Storms Grotto = Only on the phone'); await other.click('[data-names-add]'); await other.waitForTimeout(400);
  await other.click('.rail .tab[data-tab=seeds]'); await other.fill('#codeBox', code); await other.click('[data-readcode]'); await other.waitForTimeout(900);
  const merged = await other.evaluate(k => JSON.parse(localStorage.getItem(k)).edits.checks, KEY);
  ok('transfer code brings names across', merged[MIDO]?.name === 'Mido quick', `code ${code.length} chars`);
  ok('transfer code keeps names only on this device', merged['OOT Kokiri Forest Storms Grotto']?.name === 'Only on the phone');

  /* An older save with renames and no names setting still shows them */
  await other.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); delete s.ui.names; delete s.ui.nameBase; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await other.reload(); await other.waitForSelector('.row');
  await other.fill('#search', 'mido'); await other.waitForTimeout(400);
  ok('older saves show their renames', (await other.evaluate(id => document.querySelector(`.row[data-id="${CSS.escape(id)}"] .t`)?.textContent, MIDO)) === 'Mido quick');

  /* Long-press on a phone */
  const phone = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
  phone.on('pageerror', e => errs.push(String(e)));
  await phone.goto(`http://localhost:${PORT}/`); await phone.waitForSelector('.bottom .tab');
  await phone.waitForSelector('.reg[data-region="OOT_KOKIRI_FOREST"]'); await phone.tap('.reg[data-region="OOT_KOKIRI_FOREST"]');
  await phone.waitForSelector('.row .tick-btn', { state: 'visible', timeout: 10000 }).catch(() => {});
  const row = await phone.$('.row .tick-btn >> visible=true');
  if (row) {
    const box = await row.boundingBox();
    const cdp = await phone.context().newCDPSession(phone);
    const pt = { x: box.x + 30, y: box.y + box.height / 2 };
    const before = await phone.evaluate(() => document.querySelectorAll('.row.done').length);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await phone.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.waitForTimeout(400);
    ok('long-press opens the rename box on a phone', !!(await phone.$('#edName')));
    ok('long-press does not tick the check', (await phone.evaluate(() => document.querySelectorAll('.row.done').length)) === before);
  } else ok('phone shows checks', false);

  console.log('errors', errs.length, errs.slice(0, 5));
  if (errs.length) process.exitCode = 1;
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
