const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };
const shot = n => `.cache/shots/${n}.png`;
(async () => {
  await new Promise(r => srv.listen(8933, r));
  const b = await chromium.launch();
  const errs = [];
  // Every heading starts folded each time the app opens, in the sidebar and the main window.
  {
    const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage();
    await p.goto('http://localhost:8933/'); await p.waitForSelector('#listScroll .section-head');
    const allShut = async sel => p.$$eval(sel, c => c.length > 0 && c.every(x => x.getAttribute('aria-expanded') === 'false'));
    ok('Checks headings start folded', (await allShut('#listScroll .section-head .caret')) && !(await p.$('#listScroll .row')) && (await allShut('#regions .group.fold')));
    await p.click('#listScroll .section-head .caret'); await p.click('#regions .group.fold'); await p.waitForTimeout(200);
    ok('a heading opens when tapped', !!(await p.$('#listScroll .row')) && (await p.getAttribute('#regions .group.fold', 'aria-expanded')) === 'true');
    await p.click('.rail .tab[data-tab=items]'); await p.waitForSelector('#pane .section-head', { timeout: 90000 });
    ok('Items headings start folded', (await allShut('#pane .section-head .caret')) && !(await p.$('.item-btn')));
    await p.click('.rail .tab[data-tab=settings]'); await p.waitForSelector('details.cat');
    ok('Settings sections start folded', await p.$$eval('details.cat', d => d.every(x => !x.open)));
    await p.click('.rail .tab[data-tab=list]'); await p.waitForSelector('#regions .reg');
    /* The first sidebar heading is still open from above. */
    await p.click('#regions .group.fold + .reg[data-region]'); await p.waitForTimeout(300);
    ok('picking one area shows its checks straight away', !!(await p.$('#listScroll .row')));
    await p.reload(); await p.waitForSelector('#listScroll .section-head');
    ok('everything is folded again after reload', (await allShut('#listScroll .section-head .caret')) && (await allShut('#regions .group.fold')));
    await c.close();
  }
  /* The rest of this test reads the lists, so the main window's headings start open. */
  const open = async o => { const c = await b.newContext(o); await c.addInitScript(() => { window.__OOTMM_MAIN_OPEN__ = true; }); const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.goto('http://localhost:8933/'); await p.waitForSelector('#regions .reg'); return p; };
  const pc = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('ootmm-checklist-v1')).seeds[0]);

  // showing what's in logic is switched off for now
  await pc.waitForTimeout(1500);
  ok('no logic shows on Checks', !(await pc.$('#logicPill')) && !(await pc.$('[data-logiconly]')) && !(await pc.$('.row.inlogic, .row.outlogic, .lgdot, .logic-note')) && !/in logic/i.test(await pc.textContent('#pane')));
  await pc.click('.rail .tab[data-tab=items]'); await pc.waitForSelector('.item-btn', { timeout: 90000 });
  ok('Items still lists items, with no logic switch', !(await pc.$('[data-logic-toggle]')) && !/logic/i.test(await pc.textContent('#pane')));
  // Double Defense outlines the hearts
  ok('hearts start without the gold outline', !(await pc.$('.heart-row.dd')));
  await pc.click('.item-btn[data-item="OOT_DEFENSE_UPGRADE"]'); await pc.waitForTimeout(250);
  ok('Double Defense gives all 20 hearts a gold outline', (await pc.$$('.heart-row.dd')).length === 2);
  // the item menu progress display
  await pc.click('.item-btn[data-item="OOT_BOW"]'); await pc.waitForTimeout(200);
  await pc.click('.rail .tab[data-tab=settings]'); await pc.click('[data-setview=look]'); await pc.click('[data-meter-set=menu]'); await pc.waitForTimeout(200);
  ok('Item menu replaces the top of the sidebar', await pc.isVisible('.cube-face.oot') && !(await pc.isVisible('.dial')) && !(await pc.isVisible('#seedName')));
  const slotOn = name => pc.$$eval('.slot', (e, n) => e.find(x => x.getAttribute('aria-label').startsWith(n))?.classList.contains('on') ?? null, name);
  ok('items you have light up, others stay dark', (await slotOn('Fairy Bow')) === true && (await slotOn('Boomerang')) === false);
  await pc.click('[data-cube-page="equip"]'); await pc.waitForTimeout(400);
  ok('the arrows turn the page', /Equipment/i.test(await pc.textContent('.cube-name')));
  await pc.click('[data-cube-game="mm"]'); await pc.waitForTimeout(400);
  ok('the switch shows the MM menu', await pc.isVisible('.cube-face.mm') && /Select item/i.test(await pc.textContent('.cube-name')));
  await pc.click('[data-cube-slot="1"]'); await pc.waitForTimeout(200);
  ok('tapping an item names it along the bottom', /Bow/.test(await pc.textContent('#cubeLabel')));
  await pc.click('[data-cube-game="oot"]'); await pc.click('[data-meter-set=""]'); await pc.click('[data-setview=game]'); await pc.waitForTimeout(200);

  // nothing shuffled yet
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForTimeout(150);
  ok('empty state explains itself', (await pc.textContent('#pane')).includes('No entrances are shuffled'));
  await pc.click('[data-open-entr-settings]'); await pc.waitForSelector('[data-enum=erGrottos]');
  ok('entrance settings show in the short list', (await pc.$$('[data-enum=erDungeons]')).length === 1);

  // turn on real settings through the UI
  await pc.selectOption('[data-enum=erGrottos]', 'full'); await pc.waitForTimeout(500);
  await pc.selectOption('[data-enum=erDungeons]', 'full'); await pc.waitForTimeout(500);
  await pc.click('[data-bool=erMajorDungeons]'); await pc.waitForTimeout(600);
  await pc.selectOption('[data-enum=erSpawns]', 'both'); await pc.waitForTimeout(600);
  await pc.selectOption('[data-enum=erWarps]', 'full'); await pc.waitForTimeout(600);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  const secs = await pc.$$eval('#entrScroll section', ss => ss.slice(0, 4).map(s => [s.querySelector('h2').textContent, [...s.querySelectorAll('.entr-btn .t')].map(t => t.textContent).join('|')]));
  ok('spawns open the list, child first', secs[0][0] === 'Where you start' && /^Child spawn\|Adult spawn/.test(secs[0][1]), JSON.stringify(secs[0]));
  ok('songs come next, all in one section', secs[1][0] === 'Songs' && /^Minuet of Forest\|Bolero of Fire\|Serenade of Water\|Nocturne of Shadow\|Requiem of Spirit\|Prelude of Light/.test(secs[1][1]) && /SOS \(Clock Town\)/.test(secs[1][1]), secs[1][1].slice(0, 120));
  ok('OoT dungeons then MM dungeons follow the songs', secs[2][0] === 'OoT dungeons' && secs[3][0] === 'MM dungeons', JSON.stringify(secs.map(x => x[0])));
  const dung = sel => pc.$$eval(sel, ss => ss.map(s => [s.querySelector('h2').textContent, [...s.querySelectorAll('.dir-part')].map(d => [d.querySelector('.dir-name').textContent, [...d.querySelectorAll('.t')].map(t => t.textContent)])]));
  const [oot, mm] = await dung('#entrScroll section.dungeons-sec');
  const partOf = (sec, name) => (sec[1].find(p => p[0] === name) ?? [0, []])[1];
  ok('OoT dungeons split into going in, then coming out', oot[1].map(p => p[0]).join() === 'Going in,Coming out' && partOf(oot, 'Going in').includes('Deku Tree') && partOf(oot, 'Coming out').includes('Deku Tree'), JSON.stringify(oot).slice(0, 300));
  ok('MM dungeons hold only MM dungeons', partOf(mm, 'Going in').includes('Woodfall Temple') && !partOf(oot, 'Going in').includes('Woodfall Temple') && !partOf(mm, 'Going in').includes('Deku Tree'), JSON.stringify(mm).slice(0, 300));
  ok('extra dungeons stay out while their settings are off', !/Pirate Fortress|Secret Shrine/.test(JSON.stringify(mm)));
  ok('no area section holds a dungeon entrance', !(await pc.$$eval('#entrScroll section:not(.pinned-sec) .entr-btn', bs => bs.some(b => /^(Entrance to|Exit of|Boss door: )(Deku Tree|Woodfall Temple|Forest Temple)/.test(b.getAttribute('aria-label') ?? '')))));
  // extra dungeons join the MM list when OoTMM's settings shuffle them, and leave again when switched off
  await pc.click('.rail .tab[data-tab=settings]'); await pc.waitForSelector('[data-bool=erPirateFortress]');
  await pc.click('[data-bool=erPirateFortress]'); await pc.waitForTimeout(600);
  await pc.click('[data-bool=erSecretShrine]'); await pc.waitForTimeout(600);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  const [, mm2] = await dung('#entrScroll section.dungeons-sec');
  const logE = async (q, place) => { await pc.fill('#entrSearch', q); await pc.waitForTimeout(250); await pc.click('.entr-btn'); await pc.waitForSelector('.pick'); await pc.fill('#pickSearch', place); await pc.waitForTimeout(200); await pc.click('.pick'); await pc.waitForTimeout(400); await pc.fill('#entrSearch', ''); await pc.waitForTimeout(300); };
  const clearE = async q => { await pc.fill('#entrSearch', q); await pc.waitForTimeout(250); await pc.click('.entr-btn'); await pc.click('[data-act=clear]'); await pc.waitForTimeout(300); await pc.fill('#entrSearch', ''); await pc.waitForTimeout(300); };
  const bossNotes = () => pc.$$eval('#entrScroll section.dungeons-sec .dir-in .entr-btn', bs => Object.fromEntries(bs.map(b => [b.querySelector('.t').textContent, b.querySelector('.boss-note')?.textContent ?? ''])));
  ok('no boss shows on a way in that is not logged', Object.values(await bossNotes()).every(t => t === ''));
  await logE('Entrance to Woodfall Temple', 'pirate fortress');
  const pfNotes = await bossNotes();
  ok('a way in that leads to a dungeon without a boss says No boss', pfNotes['Woodfall Temple'] === 'No boss' && pfNotes['Pirate Fortress'] === '', JSON.stringify(pfNotes));
  await clearE('Entrance to Woodfall Temple');
  ok("Pirates' Fortress and the Secret Shrine show up when shuffled", ['Going in', 'Coming out'].every(n => partOf(mm2, n).includes('Pirate Fortress') && partOf(mm2, n).includes('Secret Shrine')), JSON.stringify(mm2).slice(0, 400));
  await pc.click('.rail .tab[data-tab=settings]'); await pc.waitForSelector('[data-bool=erPirateFortress]');
  await pc.click('[data-bool=erPirateFortress]'); await pc.waitForTimeout(600);
  await pc.click('[data-bool=erSecretShrine]'); await pc.waitForTimeout(600);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  ok('and leave when switched off', !/Pirate Fortress|Secret Shrine/.test(JSON.stringify(await dung('#entrScroll section.dungeons-sec'))));
  // boss doors stay under their dungeons; each way in names the boss of the dungeon the player logged it leading to
  await logE('Entrance to Deku Tree', 'fire temple');
  const n0 = await bossNotes();
  ok('with boss doors unshuffled, a way in names the usual boss of where it leads', n0['Deku Tree'] === 'Boss: Volvagia' && n0['Fire Temple'] === '', JSON.stringify(n0));
  await pc.click('.rail .tab[data-tab=settings]'); await pc.waitForSelector('[data-enum=erBoss]');
  await pc.selectOption('[data-enum=erBoss]', 'full'); await pc.waitForTimeout(600);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  const n1 = await bossNotes();
  ok('shuffled boss doors stay in their dungeons, and no boss shows until that door is logged', n1['Deku Tree'] === '' && !(await pc.$('#entrScroll section.dungeons-sec .dir-other')) && (await pc.$$eval('#entrScroll section:not(.pinned-sec) .entr-btn', bs => bs.filter(b => /^Boss door: /.test(b.getAttribute('aria-label'))).length)) === 12, JSON.stringify(n1));
  await logE('Boss door: Gohma', 'morpha');
  ok("logging the Deku Tree's boss door changes nothing on a way in that leads elsewhere", (await bossNotes())['Deku Tree'] === '');
  await logE('Boss door: Volvagia', 'bongo');
  const n2 = await bossNotes();
  ok('logging the boss door of the dungeon it leads to names that boss', n2['Deku Tree'] === 'Boss: Bongo-Bongo' && n2['Fire Temple'] === '', JSON.stringify(n2));
  // a dungeon's compass asks for its boss and its map asks which entrance leads in; the player fills both in
  const sheetTitle = () => pc.$eval('.sheet h2', h => h.textContent).catch(() => '');
  const entr = () => pc.evaluate(() => JSON.parse(localStorage.getItem('ootmm-checklist-v1')).seeds[0].entrances);
  const itemBtn = id => '.item-btn[data-item="' + id + '"]';
  await pc.click('.rail .tab[data-tab=items]'); await pc.waitForSelector(itemBtn('OOT_COMPASS_JJ'));
  await pc.click(itemBtn('OOT_COMPASS_JJ')); await pc.waitForSelector('.sheet h2', { timeout: 5000 }).catch(() => {});
  await pc.waitForTimeout(300);
  const cTitle = await sheetTitle();
  ok("getting a compass asks for that dungeon's boss", /Jabu-Jabu.*which boss/.test(cTitle), cTitle + ' / ' + (await pc.$$eval('.sheet h2', h => h.map(x => x.textContent).join('|'))));
  await pc.fill('#pickSearch', 'twinrova'); await pc.waitForTimeout(200); await pc.click('.pick'); await pc.waitForTimeout(400);
  ok('the boss picked from the compass is logged on its boss door', (await entr()).OOT_BOSS_JABU_JABU === 'OOT_BOSS_TEMPLE_SPIRIT' && (await pc.$$('.sheet')).length === 0);
  await pc.click(itemBtn('OOT_MAP_JJ')); await pc.waitForSelector('.sheet h2', { timeout: 5000 }).catch(() => {});
  ok('getting a map asks which entrance leads into that dungeon', /Jabu-Jabu.*where is Jabu-Jabu/.test(await sheetTitle()) && !!(await pc.$('.sheet [data-act="way:OOT_TEMPLE_WATER"]')), await sheetTitle());
  await pc.click('.sheet [data-act="way:OOT_TEMPLE_WATER"]'); await pc.waitForTimeout(400);
  ok('the entrance picked from the map leads there, with the way back filled', (await entr()).OOT_TEMPLE_WATER === 'OOT_JABU_JABU' && (await entr()).OOT_ZORA_FOUNTAIN_FROM_JABU_JABU === 'OOT_LAKE_HYLIA_FROM_TEMPLE_WATER', JSON.stringify(await entr()));
  ok('the map left the Items tab showing', !!(await pc.$(itemBtn('OOT_MAP_JJ'))));
  await pc.click(itemBtn('OOT_COMPASS_DT')); await pc.waitForTimeout(3000);
  ok("a compass whose boss door is already logged doesn't ask", (await pc.$$('.sheet')).length === 0);
  for (let i = 0; i < 2; i++) { await pc.click(itemBtn('OOT_COMPASS_JJ')); await pc.waitForTimeout(2500); }
  ok('each compass asks only once per seed', (await pc.$$('.sheet')).length === 0);
  for (const id of ['OOT_COMPASS_DT', 'OOT_MAP_JJ', 'OOT_COMPASS_JJ']) { if (await pc.getAttribute(itemBtn(id), 'aria-pressed') === 'true') await pc.click(itemBtn(id)); await pc.waitForTimeout(200); }
  await pc.click('.rail .tab[data-tab=settings]'); await pc.waitForSelector('[data-enum=erBoss]');
  await pc.selectOption('[data-enum=erBoss]', 'none'); await pc.waitForTimeout(600);
  await pc.evaluate(() => { const s = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); for (const x of s.seeds) x.entrances = {}; localStorage.setItem('ootmm-checklist-v1', JSON.stringify(s)); });
  await pc.reload(); await pc.waitForSelector('#regions .reg');
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  ok('no area section holds a song', !(await pc.$$eval('#entrScroll section:not(.pinned-sec) .entr-btn .t', ts => ts.some(t => /^(\w+ of (Forest|Fire|Water|Shadow|Spirit|Light)|SOS \()/.test(t.textContent)))));
  ok('sidebar headings start folded', (await pc.$$eval('#regions .group.fold', g => g.every(x => x.getAttribute('aria-expanded') === 'false'))) && !(await pc.$('#regions [data-entr-region="@songs"]')));
  await pc.click('#regions .group.fold[data-collapse="re:Start and songs"]'); await pc.waitForTimeout(200);
  await pc.click('[data-entr-region="@songs"]'); await pc.waitForTimeout(300);
  ok('the rail opens just the songs', (await pc.$$eval('#entrScroll section h2', hs => hs.map(h => h.textContent))).join() === 'Songs');
  await pc.click('[data-entr-region="@dungeons-mm"]'); await pc.waitForTimeout(300);
  ok('the rail opens just the MM dungeons', (await pc.$$eval('#entrScroll section h2', hs => hs.map(h => h.textContent))).join() === 'MM dungeons' && (await pc.textContent('#regions [data-collapse="re:Start and songs"]')).includes('dungeons'));
  await pc.click('[data-entr-region=""]'); await pc.waitForTimeout(300);
  const pinFirst = await pc.$eval('#entrScroll .row.entr .row-pin', e => e.dataset.pin);
  await pc.click(`#entrScroll .row-pin[data-pin="${pinFirst}"]`); await pc.waitForTimeout(250);
  ok('a pinned entrance moves to Pinned at the top', (await pc.$eval('#entrScroll section', s => s.className)) === 'pins-sec' && !!(await pc.$(`#entrScroll .pins-sec .row-pin[data-pin="${pinFirst}"]`)));
  await pc.click(`#entrScroll .pins-sec .row-pin[data-pin="${pinFirst}"]`); await pc.waitForTimeout(250);
  ok('unpinning puts it back', !(await pc.$('#entrScroll .pins-sec')), await pc.$eval('#entrScroll .pins-sec', e => e.textContent.replace(/\s+/g, ' ').slice(0, 200)).catch(() => ''));
  const railHas = id => pc.$$eval(`#regions [data-entr-region="${id}"]`, e => e.length);
  ok('Hyrule starts folded on Entrances', (await railHas('OOT_KOKIRI_FOREST')) === 0);
  await pc.click('#regions .group.fold[data-collapse="re:Hyrule"]'); await pc.waitForTimeout(200);
  ok('opening Hyrule shows its areas, nothing else', (await railHas('OOT_KOKIRI_FOREST')) === 1 && (await railHas('MM_CLOCK_TOWN')) === 0 && (await pc.getAttribute('[data-collapse="re:Hyrule"]', 'aria-expanded')) === 'true');
  await pc.click('#regions .group.fold[data-collapse="re:Hyrule"]'); await pc.waitForTimeout(200);
  ok('and folds again', (await railHas('OOT_KOKIRI_FOREST')) === 0);
  await pc.click('.rail .tab[data-tab=list]'); await pc.waitForTimeout(300);
  ok('Checks headings start folded too', (await pc.$$eval('#regions [data-region="MM_TERMINA_FIELD"]', e => e.length)) === 0);
  await pc.click('#regions .group.fold[data-collapse="rc:Termina"]'); await pc.waitForTimeout(200);
  ok('opening Termina on Checks shows only its areas', (await pc.$$eval('#regions [data-region="MM_TERMINA_FIELD"]', e => e.length)) === 1 && (await pc.$$eval('#regions [data-region="MM_TEMPLE_WOODFALL"]', e => e.length)) === 0);
  await pc.reload(); await pc.waitForSelector('#regions .reg');
  ok('an opened heading is folded again after reload', (await pc.getAttribute('[data-collapse="rc:Termina"]', 'aria-expanded')) === 'false');
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  // Check later: one entrance and one check, each from its own clock
  const laterE = await pc.getAttribute('.row.entr .later', 'data-later');
  await pc.click(`.later[data-later="${laterE}"]`); await pc.waitForTimeout(250);
  ok('an entrance goes on Check later', await pc.$eval(`.later[data-later="${laterE}"]`, b => b.classList.contains('on') && b.closest('.row').classList.contains('is-later')));
  await pc.click('#regions [data-entr-region="@later"]'); await pc.waitForTimeout(250);
  ok('the Check later entry lists just that entrance', (await pc.$$eval('.row.entr .later', b => b.map(x => x.dataset.later))).join() === laterE && (await pc.textContent('#regions [data-entr-region="@later"] .c')) === '1');
  await pc.click('.rail .tab[data-tab=list]'); await pc.waitForTimeout(300);
  await pc.click('#regions [data-region="@later"]'); await pc.waitForTimeout(250);
  ok('Checks has its own empty Check later list', /Nothing to check later yet/.test(await pc.textContent('#pane')));
  await pc.click('#regions [data-region=""]'); await pc.waitForTimeout(250);
  await pc.fill('#search', 'kokiri sword'); await pc.waitForTimeout(300);
  await pc.click('.row[data-id="OOT Kokiri Forest Kokiri Sword Chest"] .later'); await pc.waitForTimeout(250);
  await pc.fill('#search', ''); await pc.click('#regions [data-region="@later"]'); await pc.waitForTimeout(250);
  ok('a check goes on its Check later list', (await pc.$$eval('#pane .row[data-id]', r => r.map(x => x.dataset.id))).join() === 'OOT Kokiri Forest Kokiri Sword Chest');
  await pc.reload(); await pc.waitForSelector('#regions .reg');
  ok('Check later survives a reload', (await store(pc)).later.length === 2);
  await pc.click('#regions [data-region="@later"]'); await pc.waitForTimeout(250);
  await pc.click('.row .later.on'); await pc.waitForTimeout(250);
  ok('tapping the clock again takes it off', (await store(pc)).later.join() === laterE);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  await pc.click('#regions [data-entr-region=""]'); await pc.waitForTimeout(250);
  const listed = await pc.$$eval('.entr-btn', e => e.length);
  const kf = await pc.$$eval('#entrScroll section', ss => { const k = ss.find(s => s.querySelector('h2').textContent === 'Kokiri Forest');
    return k && [...k.querySelectorAll('.dir-part')].map(d => [d.querySelector('.dir-name').textContent, [...d.querySelectorAll('.t')].map(t => t.textContent)]); });
  ok('an area splits into going in, then coming out', kf && kf[0][0] === 'Going in' && kf[1][0] === 'Coming out', JSON.stringify(kf).slice(0, 200));
  ok('rows under a direction just name the place, and dungeons moved out', kf && !kf.flatMap(k => k[1]).includes('Deku Tree') && !kf.flatMap(k => k[1]).some(t => /^(Entrance to|Exit of) /.test(t)));
  await pc.click('[data-entr-dir=in]'); await pc.waitForTimeout(300);
  ok('the Going in filter shows only ways in', (await pc.$$eval('.dir-name', n => [...new Set(n.map(x => x.textContent))])).join() === 'Going in');
  await pc.click('[data-entr-dir=out]'); await pc.waitForTimeout(300);
  ok('the Coming out filter shows only ways out', (await pc.$$eval('.dir-name', n => [...new Set(n.map(x => x.textContent))])).join() === 'Coming out');
  await pc.click('[data-entr-dir=all]'); await pc.waitForTimeout(300);
  ok('settings fill the list', listed > 100, `${listed} entrances`);
  ok('every entrance starts unlogged', (await pc.$$eval('.entr.done', e => e.length)) === 0);
  await pc.screenshot({ path: shot('er-pc-list') });

  // log one, way back fills
  await pc.fill('#entrSearch', 'Entrance to Deku Tree'); await pc.waitForTimeout(250);
  await pc.click('.entr-btn'); await pc.waitForSelector('.pick');
  await pc.screenshot({ path: shot('er-pc-picker') });
  const places = await pc.$$eval('.pick .t', e => e.map(x => x.textContent));
  ok('picker offers only dungeon places', places.includes('Fire Temple') && !places.some(x => /Grotto|Kokiri Forest$/.test(x)), `${places.length} places`);
  await pc.fill('#pickSearch', 'fire temple'); await pc.waitForTimeout(200);
  await pc.click('.pick'); await pc.waitForTimeout(400);
  ok('logged entrance shows its place', (await pc.textContent('#entrScroll')).includes('Leads to Fire Temple'));
  let s = await store(pc);
  ok('way back is filled in', s.entrances.OOT_TEMPLE_FIRE === undefined && Object.keys(s.entrances).length === 2 && s.entrances.OOT_DEKU_TREE === 'OOT_TEMPLE_FIRE' && s.entrances.OOT_DEATH_CRATER_FROM_TEMPLE_FIRE === 'OOT_KOKIRI_FOREST_FROM_DEKU_TREE', JSON.stringify(s.entrances));

  // used places drop to the bottom, and moving one releases the old holder
  await pc.fill('#entrSearch', 'Entrance to Dodongo'); await pc.waitForTimeout(250);
  await pc.click('.entr-btn'); await pc.waitForSelector('.pick');
  ok('taken place is marked', (await pc.textContent('#pickList')).includes('Already logged elsewhere'));
  await pc.fill('#pickSearch', 'fire temple'); await pc.waitForTimeout(200);
  await pc.click('.pick[data-pick=OOT_TEMPLE_FIRE]'); await pc.waitForTimeout(400);
  s = await store(pc);
  ok('moving a place releases the old entrance', !s.entrances.OOT_DEKU_TREE && s.entrances.OOT_DODONGO_CAVERN === 'OOT_TEMPLE_FIRE', JSON.stringify(s.entrances));
  await pc.click('.entr-btn'); await pc.waitForSelector('[data-act=clear]');
  await pc.click('[data-act=clear]'); await pc.waitForTimeout(400);
  s = await store(pc);
  ok('clearing removes both directions', Object.keys(s.entrances).length === 0, JSON.stringify(s.entrances));

  // search by where it leads, reload keeps it
  await pc.fill('#entrSearch', 'Entrance to Deku Tree'); await pc.waitForTimeout(250);
  await pc.click('.entr-btn'); await pc.waitForSelector('.pick');
  await pc.fill('#pickSearch', 'water temple'); await pc.waitForTimeout(200); await pc.click('.pick'); await pc.waitForTimeout(350);
  await pc.fill('#entrSearch', 'water temple'); await pc.waitForTimeout(250);
  ok('search finds entrances by destination', (await pc.$$eval('.dir-in .entr-btn .t', t => t.map(x => x.textContent))).includes('Deku Tree'));
  await pc.reload(); await pc.waitForSelector('.reg');
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  ok('log survives a reload', (await pc.textContent('#entrScroll')).includes('Leads to Water Temple'));

  // a spoiler log must fill nothing in
  const log = fs.readFileSync('.cache/spoiler-er.txt', 'utf8');
  ok('sample spoiler really has entrances', /\) +-> .*\(/.test(log));
  await pc.click('.rail .tab[data-tab=seeds]'); await pc.click('[data-new]'); await pc.waitForTimeout(500);
  await pc.click('.rail .tab[data-tab=settings]'); await pc.waitForSelector('#importFile');
  await pc.setInputFiles('#importFile', '.cache/spoiler-er.txt'); await pc.waitForTimeout(1500);
  await pc.click('.rail .tab[data-tab=entrances]'); await pc.waitForSelector('.entr-btn');
  const after = await pc.evaluate(() => { const a = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return a.seeds.find(s => s.id === a.current); });
  const n = await pc.$$eval('.entr-btn', e => e.length);
  ok('spoiler import sets the list but logs nothing', n === 288 && Object.keys(after.entrances).length === 0 && (await pc.$$eval('.leads', e => e.length)) === 0, `${n} listed, ${Object.keys(after.entrances).length} logged`);

  // phone: transfer + flow
  await pc.evaluate(() => { document.querySelector('.rail .tab[data-tab=seeds]').click(); });
  await pc.waitForSelector('#seedList');
  await pc.click('[data-open]:not(.none) >> nth=1').catch(() => {});
  await pc.waitForTimeout(500);
  await pc.click('.rail .tab[data-tab=seeds]'); await pc.waitForSelector('[data-copycode]');
  await pc.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('x')); });
  await pc.click('[data-copycode]'); await pc.waitForTimeout(200);
  const code = await pc.inputValue('#codeBox');
  const srcSeed = await pc.evaluate(() => { const a = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return a.seeds.find(s => s.id === a.current).entrances; });
  const ph = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await ph.tap('.bottom .tab[data-tab=seeds]'); await ph.waitForSelector('#codeBox');
  await ph.fill('#codeBox', code); await ph.tap('[data-readcode]'); await ph.waitForTimeout(900);
  const moved = await ph.evaluate(() => { const a = JSON.parse(localStorage.getItem('ootmm-checklist-v1')); return a.seeds.find(s => s.id === a.current).entrances; });
  ok('transfer code carries the log', JSON.stringify(moved) === JSON.stringify(srcSeed), `${Object.keys(moved).length} entries, code ${code.length} chars`);
  await ph.tap('.bottom .tab[data-tab=entrances]'); await ph.waitForTimeout(300);
  await ph.screenshot({ path: shot('er-phone-rail') });
  const firstArea = ph.locator('.reg[data-entr-region]').nth(0);
  if (await firstArea.count()) { await firstArea.tap(); await ph.waitForTimeout(250); await ph.screenshot({ path: shot('er-phone-list') });
    await ph.locator('.entr-btn').first().tap(); await ph.waitForSelector('.pick'); await ph.screenshot({ path: shot('er-phone-picker') });
    ok('phone has no sideways scroll', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    await ph.keyboard.press('Escape'); await ph.waitForTimeout(100);
    ok('picker closes', (await ph.$$('.sheet')).length === 0);
  } else ok('phone shows an area list', false);
  // saves from before this tab existed
  const oldC = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await oldC.addInitScript(() => { window.__OOTMM_MAIN_OPEN__ = true; });
  await oldC.addInitScript(() => { localStorage.setItem('ootmm-checklist-v1', JSON.stringify({ v: 1, current: 'a', custom: [], ui: {}, seeds: [{ id: 'a', name: 'Old seed', settings: 'v2.q1ZKzi8PzihNS8tJ9c8vUbIqKSpNrQUA', done: ['OOT Kokiri Forest Kokiri Sword Chest'], skipped: [], skippedRegions: [], rolled: {}, updated: 1 }] })); });
  const old = await oldC.newPage(); old.on('pageerror', e => errs.push(String(e)));
  await old.goto('http://localhost:8933/'); await old.waitForSelector('.row');
  await old.click('.rail .tab[data-tab=entrances]'); await old.waitForTimeout(200);
  await old.click('.rail .tab[data-tab=seeds]'); await old.waitForTimeout(200);
  ok('older saves still open', (await old.textContent('#remain')).startsWith('544 of 545'), await old.textContent('#remain'));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close(); srv.close();
})().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
