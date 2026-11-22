/*
 * Game tracking's memory reader (Windows only, off unless the player turns it on in App Settings).
 *
 * It finds Project64-EM on this PC, finds the game's memory inside it, and every 50 ms reads a few bytes:
 * - each game's name tag ("ZELDAZ" for OoT, "ZELDA3" for MM), to know which game is running;
 * - the running game's grotto number (OoTMM's gGrottoData), which a grotto hole sets as Link drops in;
 * - the running game's last ocarina notes (the 8 the free-play staff shows), how many there are, and the note each button
 *   plays, which together say which warp song was just played.
 * Where those sit comes from ram-layout.json, made from OoTMM's own code by tools/ram-layout.mjs. Nothing else is ever
 * read: not OoTMM's entrance table, nor anything that says where a door leads. It only reads, so the game, the OoTMM
 * Client and co-op aren't touched.
 *
 * Project64 keeps the N64's memory as 32-bit words in the PC's byte order, so the byte at N64 address A sits at
 * (A & 0x7fffff) ^ 3 from the start of that memory.
 *
 * It uses koffi (MIT) to call Windows' own OpenProcess, VirtualQueryEx and ReadProcessMemory. The installer adds
 * koffi; when it's missing (or this isn't Windows) the reader says so and does nothing.
 */
const path = require('path');
const fs = require('fs');

const POLL_MS = 50;
const KEEP = 12;

function loadLayout() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'ram-layout.json'), 'utf8')); } catch { return null; }
}

function makeWin() {
  if (process.platform !== 'win32') return null;
  let koffi;
  try { koffi = require('koffi'); } catch { return null; }
  const k32 = koffi.load('kernel32.dll');
  const PROCESSENTRY32W = koffi.struct('PROCESSENTRY32W', {
    dwSize: 'uint32', cntUsage: 'uint32', th32ProcessID: 'uint32', th32DefaultHeapID: 'uintptr', th32ModuleID: 'uint32',
    cntThreads: 'uint32', th32ParentProcessID: 'uint32', pcPriClassBase: 'int32', dwFlags: 'uint32', szExeFile: koffi.array('char16', 260, 'String'),
  });
  const MBI = koffi.struct('MEMORY_BASIC_INFORMATION', {
    BaseAddress: 'uintptr', AllocationBase: 'uintptr', AllocationProtect: 'uint32', PartitionId: 'uint16', RegionSize: 'uintptr',
    State: 'uint32', Protect: 'uint32', Type: 'uint32',
  });
  return {
    koffi, MBI, PROCESSENTRY32W,
    CreateToolhelp32Snapshot: k32.func('void* __stdcall CreateToolhelp32Snapshot(uint32 flags, uint32 pid)'),
    Process32FirstW: k32.func('bool __stdcall Process32FirstW(void* snap, _Inout_ PROCESSENTRY32W* entry)'),
    Process32NextW: k32.func('bool __stdcall Process32NextW(void* snap, _Inout_ PROCESSENTRY32W* entry)'),
    CloseHandle: k32.func('bool __stdcall CloseHandle(void* h)'),
    OpenProcess: k32.func('void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
    VirtualQueryEx: k32.func('uintptr __stdcall VirtualQueryEx(void* proc, uintptr addr, _Out_ MEMORY_BASIC_INFORMATION* info, uintptr size)'),
    ReadProcessMemory: k32.func('bool __stdcall ReadProcessMemory(void* proc, uintptr addr, void* buf, uintptr size, _Out_ uintptr* read)'),
    GetExitCodeProcess: k32.func('bool __stdcall GetExitCodeProcess(void* proc, _Out_ uint32* code)'),
  };
}

/* opts.layout and opts.win stand in for the real ones in tools/memreader-test.cjs. */
function createReader(opts = {}) {
  const layout = opts.layout || loadLayout();
  const win = layout ? (opts.win || makeWin()) : null;
  let proc = null, base = null, timer = null, game = null, note = '';
  const history = { oot: [], mm: [] };
  const last = { oot: null, mm: null };
  /* When the reader started watching each game this time round: numbers seen before then aren't trusted to be fresh. */
  const since = { oot: 0, mm: 0 };
  /* The ocarina's last notes in each game, and when they last changed. lastKey: what was there at the last look (null:
     not looked since the game started, so the first look only sets it). */
  const notes = { oot: null, mm: null };
  const lastKey = { oot: null, mm: null };

  const status = () => ({
    available: !!(layout && win),
    running: !!timer,
    found: base !== null,
    game,
    note: !layout ? 'This build has no memory layout for its OoTMM version.' : !win ? 'The memory reader needs the Windows app.' : note,
  });

  function findEmulator() {
    const snap = win.CreateToolhelp32Snapshot(0x2, 0);
    const pids = [];
    try {
      const e = { dwSize: win.koffi.sizeof(win.PROCESSENTRY32W) };
      if (win.Process32FirstW(snap, e)) do { if (/project64/i.test(e.szExeFile)) pids.push(e.th32ProcessID); } while (win.Process32NextW(snap, e));
    } finally { win.CloseHandle(snap); }
    return pids;
  }
  function read(addr, size) {
    const buf = Buffer.alloc(size), got = [0];
    return win.ReadProcessMemory(proc, addr, buf, size, got) && got[0] === size ? buf : null;
  }
  /* The byte at N64 address a. */
  const byteAt = a => { const b = read(base + ((a & 0x7fffff) ^ 3), 1); return b ? b[0] : null; };
  /* n bytes from N64 address a, read in one go. */
  const bytesAt = (a, n) => {
    const start = a & ~3, end = (a + n + 3) & ~3;
    const b = read(base + (start & 0x7fffff), end - start);
    if (!b) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(b[((a + i) - start) ^ 3]);
    return out;
  };
  const tagAt = (a, len) => { let s = ''; for (let i = 0; i < len; i++) { const c = byteAt(a + i); if (c === null) return null; s += String.fromCharCode(c); } return s; };
  const whichGame = () => {
    for (const g of ['oot', 'mm']) if (tagAt(layout.addr[g].tag, layout.tags[g].length) === layout.tags[g]) return g;
    return null;
  };

  /* The game's memory is the start of one of the emulator's memory blocks, where a game's name tag sits in place. */
  function findMemory() {
    const mbi = {};
    const seen = new Set();
    let addr = 0;
    for (let n = 0; n < 200000; n++) {
      if (!win.VirtualQueryEx(proc, addr, mbi, win.koffi.sizeof(win.MBI))) break;
      const size = Number(mbi.RegionSize);
      if (mbi.State === 0x1000) for (const at of [Number(mbi.AllocationBase), Number(mbi.BaseAddress)]) {
        if (!at || seen.has(at)) continue;
        seen.add(at);
        base = at;
        if (whichGame()) return true;
        base = null;
      }
      const next = Number(mbi.BaseAddress) + size;
      if (!size || next <= addr) break;
      addr = next;
    }
    return false;
  }

  function attach() {
    for (const pid of findEmulator()) {
      const h = win.OpenProcess(0x0400 | 0x0010, false, pid);
      if (!h) continue;
      proc = h;
      if (findMemory()) { note = ''; return true; }
      win.CloseHandle(h);
      proc = null;
    }
    note = 'Project64-EM with a game running wasn\'t found.';
    return false;
  }
  function detach() {
    if (proc) win.CloseHandle(proc);
    proc = null; base = null; game = null;
  }

  let wait = 0;
  function tick() {
    if (!proc) {
      /* Look for the emulator about once a second. */
      if (wait-- > 0) return;
      wait = 20;
      if (!attach()) return;
    }
    const g = whichGame();
    if (!g) {
      const code = [0];
      if (!win.GetExitCodeProcess(proc, code) || code[0] !== 259) { detach(); return; }
      game = null;
      return;
    }
    if (g !== game) { since[g] = Date.now(); lastKey[g] = null; }
    game = g;
    const v = byteAt(layout.addr[g].grotto);
    if (v === null) { detach(); return; }
    if (v !== last[g]) {
      last[g] = v;
      history[g].push({ v, t: Date.now() });
      if (history[g].length > KEEP) history[g].shift();
    }
    const oc = layout.ocarina && layout.ocarina[g];
    if (oc) {
      const len = layout.ocarinaBufLen;
      const buf = bytesAt(oc.buf, len + 1), pitch = bytesAt(oc.pitch, 5);
      if (!buf || !pitch) return;
      const cursor = Math.min(buf[len], len);
      const played = buf.slice(0, cursor);
      const key = played.join(',') + '|' + pitch.join(',');
      if (lastKey[g] !== null && key !== lastKey[g]) notes[g] = { notes: played, pitch, t: Date.now() };
      lastKey[g] = key;
    }
  }

  return {
    status,
    start() {
      if (timer || !layout || !win) return status();
      timer = setInterval(() => { try { tick(); } catch (e) { note = String(e && e.message || e); detach(); } }, POLL_MS);
      return status();
    },
    stop() { clearInterval(timer); timer = null; if (win) detach(); return status(); },
    /* The grotto numbers seen lately in this game, oldest first, with when each was first seen (ms since 1970). */
    grottoHistory(g) { return (history[g] || []).slice(); },
    /* The ocarina's last notes in this game, the note each button plays, and when they last changed; null when they
       haven't changed since the reader started watching. */
    lastNotes(g) { return notes[g] ? { ...notes[g] } : null; },
    /* Since when the reader has been watching this game without a break (0: not now). */
    watchingSince(g) { return game === g ? since[g] : 0; },
    now: () => Date.now(),
  };
}

module.exports = { createReader };
