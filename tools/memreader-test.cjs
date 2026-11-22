// Checks the memory reader (desktop/memreader.js) against a stand-in Project64: a fake Windows API over a made-up
// process whose N64 memory holds the game's name tag and grotto number where src/generated/ram-layout.json says.
// Run: node tools/memreader-test.cjs
const path = require('path');
const { createReader } = require('../desktop/memreader.js');
const layout = require('../src/generated/ram-layout.json');
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };

const BASE = 0x7f0000000;
const ram = Buffer.alloc(0x800000);
const put = (a, v) => { ram[(a & 0x7fffff) ^ 3] = v; };
const tag = (g, s) => [...s].forEach((c, i) => put(layout.addr[g].tag + i, c.charCodeAt(0)));
const regions = [{ base: 0x10000, size: 0x10000 }, { base: BASE, size: ram.length }];
let alive = true;
const win = {
  koffi: { sizeof: () => 48 }, MBI: {}, PROCESSENTRY32W: {},
  CreateToolhelp32Snapshot: () => ({}), CloseHandle: () => true,
  Process32FirstW: (_s, e) => { e.szExeFile = 'explorer.exe'; e.th32ProcessID = 1; e.i = 0; return true; },
  Process32NextW: (_s, e) => { if (e.i++) return false; e.szExeFile = 'Project64-EM.exe'; e.th32ProcessID = 42; return true; },
  OpenProcess: (_a, _i, pid) => pid === 42 ? { pid } : null,
  VirtualQueryEx: (_p, addr, m) => {
    const r = regions.find(r => r.base >= addr) ?? null;
    if (!r) return 0;
    Object.assign(m, { BaseAddress: r.base, AllocationBase: r.base, RegionSize: r.size, State: 0x1000 });
    return 48;
  },
  ReadProcessMemory: (_p, addr, buf, size, got) => {
    if (addr < BASE || addr + size > BASE + ram.length) return false;
    ram.copy(buf, 0, addr - BASE, addr - BASE + size); got[0] = size; return true;
  },
  GetExitCodeProcess: (_p, code) => { code[0] = alive ? 259 : 0; return true; },
};

(async () => {
  const r = createReader({ layout, win });
  const wait = ms => new Promise(res => setTimeout(res, ms));
  ok('available', r.status().available);
  r.start();
  await wait(200);
  ok('no game yet: not found', !r.status().found, JSON.stringify(r.status()));
  tag('oot', 'ZELDAZ');
  put(layout.addr.oot.grotto, 0x20 | 0x05);
  await wait(1300);
  ok('finds OoT in the emulator', r.status().found && r.status().game === 'oot', JSON.stringify(r.status()));
  put(layout.addr.oot.grotto, 0x03);
  await wait(150);
  put(layout.addr.oot.grotto, 0x1a);
  await wait(150);
  const h = r.grottoHistory('oot').map(x => x.v);
  ok('watching OoT since it was found', r.watchingSince('oot') > 0 && r.watchingSince('mm') === 0);
  ok('grotto numbers seen in order', h.slice(-3).join(',') === [0x25, 0x03, 0x1a].join(','), h.join(','));
  /* Switching to MM. */
  tag('oot', '\0\0\0\0\0\0'); tag('mm', 'ZELDA3'); put(layout.addr.mm.grotto, 0x1f);
  await wait(150);
  ok('follows the switch to MM', r.status().game === 'mm' && r.grottoHistory('mm').at(-1)?.v === 0x1f, JSON.stringify(r.status()));
  /* The emulator closes. */
  tag('mm', '\0\0\0\0\0\0'); alive = false;
  await wait(150);
  ok('lets go when the emulator closes', !r.status().found);
  r.stop();
  ok('stops', !r.status().running);
})();
