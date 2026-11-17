// Browser and desktop test for changing item menu icons in Edit mode.
// Run with NODE_PATH=$(npm root -g) node tools/ui-icons.cjs after npm run build.
// The desktop half runs when a Linux Electron build is at .cache/pack/linux/electron (see tools/electron-test.cjs).
const { chromium, _electron } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..', 'dist/web');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } }); });
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };

/* A small red square PNG, made here so the test needs no picture files. */
function png(size = 32) {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([220, 40, 40]))]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const pic = path.resolve(__dirname, '..', '.cache/icon-test.png');

async function changeIcon(p, label) {
  await p.click('.rail .tab[data-tab=settings]'); await p.click('[data-setview=look]'); await p.click('[data-meter-set=menu]'); await p.waitForTimeout(300);
  await p.click('.rail [data-editmode]'); await p.waitForTimeout(300);
  ok(`${label}: slots open the icon editor in Edit mode`, (await p.getAttribute('[data-cube-slot="3"]', 'data-edit')) === 'icon:OOT_BOW');
  await p.click('[data-cube-slot="3"]'); await p.waitForSelector('#iconFile', { state: 'attached' });
  await p.setInputFiles('#iconFile', pic); await p.waitForSelector('#iconNew img');
  await p.click('.layer:last-child [data-act=save]'); await p.waitForTimeout(500);
  ok(`${label}: the slot shows the new picture`, !!(await p.$('[data-cube-slot="3"] img.mi-own')));
  ok(`${label}: other slots keep their drawn icons`, !(await p.$('[data-cube-slot="0"] img')) && !!(await p.$('[data-cube-slot="0"] svg')));
  await p.click('.rail [data-editmode]'); await p.waitForTimeout(300);
}

(async () => {
  fs.mkdirSync(path.dirname(pic), { recursive: true }); fs.writeFileSync(pic, png());
  await new Promise(r => srv.listen(8941, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8941/'); await p.waitForSelector('.reg');
  await changeIcon(p, 'web');
  ok('web: tapping a slot outside Edit mode still names it', !(await p.$('.layer')) && (await p.click('[data-cube-slot="3"]'), /Bow/.test(await p.textContent('#cubeLabel'))));
  await p.reload(); await p.waitForSelector('[data-cube-slot="3"]', { timeout: 90000 }); await p.waitForTimeout(500);
  ok('web: the picture is still there after reopening', !!(await p.$('[data-cube-slot="3"] img.mi-own')));
  ok('web: the picture lives outside the saved progress', !(await p.evaluate(() => localStorage.getItem('ootmm-checklist-v1') || '')).includes('data:image'));
  await p.click('.rail .tab[data-tab=settings]'); await p.click('[data-setview=look]'); await p.waitForTimeout(300);
  ok('web: App Settings counts the changed icons', /1 icon changed/.test(await p.textContent('#iconCount')));
  await p.click('[data-reset-icons]'); await p.click('[data-reset-icons]'); await p.waitForTimeout(500);
  ok('web: putting back every icon restores the drawn ones', !(await p.$('[data-cube-slot="3"] img')));
  ok('web: no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close();

  const exe = path.resolve(__dirname, '..', '.cache/pack/linux/electron');
  if (!fs.existsSync(exe)) { console.log('SKIP desktop: no Linux Electron build'); return; }
  const appDir = path.resolve(__dirname, '..', '.cache/pack/linux/resources/app');
  fs.cpSync(path.resolve(__dirname, '..', 'dist/desktop'), appDir, { recursive: true });
  const data = path.resolve(__dirname, '..', '.cache/e-icons'); fs.rmSync(data, { recursive: true, force: true });
  const launch = () => _electron.launch({ executablePath: exe, args: ['--no-sandbox', `--user-data-dir=${data}`], timeout: 30000 });
  let app = await launch(); let w = await app.firstWindow();
  const derrs = []; w.on('pageerror', e => derrs.push(String(e)));
  await w.waitForSelector('.reg', { timeout: 30000 });
  await changeIcon(w, 'desktop');
  const dir = path.join(data, 'icons');
  ok('desktop: the picture is written to the icons folder', fs.existsSync(path.join(dir, 'OOT_BOW.png')), fs.existsSync(dir) ? fs.readdirSync(dir).join(',') : 'no folder');
  await app.close();
  /* A picture dropped into the folder by hand is used too. */
  fs.copyFileSync(pic, path.join(dir, 'OOT_STICK.png'));
  app = await launch(); w = await app.firstWindow(); w.on('pageerror', e => derrs.push(String(e)));
  await w.waitForSelector('[data-cube-slot="3"]', { timeout: 90000 }); await w.waitForTimeout(500);
  ok('desktop: icons survive reopening the app', !!(await w.$('[data-cube-slot="3"] img.mi-own')));
  ok('desktop: a picture put in the folder by hand shows up', !!(await w.$('[data-cube-slot="0"] img.mi-own')));
  ok('desktop: no page errors', !derrs.length, derrs.join(' | '));
  await app.close();
})().catch(e => { console.error(String(e).slice(0, 700)); process.exit(1); });
