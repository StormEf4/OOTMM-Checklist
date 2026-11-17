import { CHECKS, REGIONS } from '@ootmm/data';
import { deflateRaw, inflateRaw } from 'pako';
import { uint8ArrayToBase64, base64ToUint8Array } from 'uint8array-extras';

import type { CheckEntry, ComputeResult, GossipEntry } from './engine/engine';
import type { EntranceData, EntranceEntry } from './engine/entrances';
import type { CatalogItem, LogicOutput } from './engine/logic';
import { SPECIAL_CONDS, SPECIAL_CONDS_FIELDS, TRICKS } from '@ootmm/core';
import { itemName } from '@ootmm/names';
import { DEFAULT_SETTINGS, SETTINGS, compute, enableFastMode, exportSettings, importSettings, makeSettings, serial } from './engine/engine';
import { computeLogic } from './engine/logic';
import { checklistNormalDungeons } from '@ootmm/logic';
import { MAP_SPOTS } from './mapspots';
import { NAME_STYLES, playerName, type NameStyle } from './names';
import { connectFirebase, firebaseReady, type LiveDb } from './firebase';
import { PAGE_SIZES, ZOOMS, cleanNotes, textToNotes, type NotesView } from './notes';
import { flatten, liveCode, merge, roomFromCode, sameState, stamp, unflatten, type LiveState } from './live';
import { ROLLABLE, ROLLED_CHOICES, UNKNOWN_MEANS_ALL, parseSpoilerHeader } from './engine/spoiler';
import audit from './generated/audit.json';
import shippedCustom from '../custom-checks.json';
import { COLOR_TOKENS, FONT_CHOICES, SEALS, SKINS, skinById } from './skins';
import { applyLayer, originalAttr, originalOf, templateOf, textAt } from './textlayer';

declare const __TARGET__: 'web' | 'desktop' | 'artifact';
declare const __OOTMM__: string;

/* ---------- Worker side: the same script runs the engine off the UI thread ---------- */

const isWorker = typeof document === 'undefined';
if (isWorker) {
  enableFastMode();
  self.onmessage = async (e: MessageEvent) => {
    const { job, kind, payload } = e.data;
    try {
      (self as any).postMessage({ job, result: await runJobHere(kind, payload) });
    } catch (err: any) {
      (self as any).postMessage({ job, error: String(err?.message ?? err) });
    }
  };
} else {
  boot();
}

function runJobHere(kind: 'checks' | 'logic', payload: any): Promise<any> {
  enableFastMode();
  return serial(() => kind === 'logic' ? computeLogic(payload) : compute(payload));
}

/* ---------- Types and state ---------- */

type HintKind = '' | 'woth' | 'foolish' | 'item' | 'other';
type Hint = { text: string; kind?: HintKind; area?: string; check?: string; item?: string; from?: string };

type CustomCheck = { id: string; name: string; region: string; game: 'oot' | 'mm'; type?: string; when?: Record<string, unknown> };
type CustomEntrance = { id: string; title: string; sub: string; area: string; game: 'oot' | 'mm' };
type Seed = {
  id: string;
  origin?: string;
  name: string;
  settings: string;
  done: string[];
  skipped: string[];
  skippedRegions: string[];
  rolled: Record<string, string[]>;
  /** Dungeons OoTMM pre-completed on this seed, by OoTMM's short names (DT, Water, WF...). */
  preCompleted?: string[];
  entrances: Record<string, string>;
  notes: Record<string, string>;
  /** Plain text of the seed's notes, kept for older versions of the app. */
  pad: string;
  /** The seed's notes page, as cleaned HTML. */
  doc?: string;
  /** Item the player found at a check: check id to item id, or text: for their own words. */
  found: Record<string, string>;
  /** Items the player added or took away by hand, on top of what they logged at checks. */
  have: Record<string, number>;
  /** What each gossip stone (or other hint source) said, as the player typed it. */
  hints: Record<string, Hint>;
  updated: number;
  /** The live room this seed is shared in, on the hosted page. */
  live?: string;
  /** When each shared key last changed, for merging live changes. */
  liveClock?: Record<string, number>;
};
type ItemEdit = { name?: string; sub?: string; area?: string; game?: 'oot' | 'mm'; hidden?: boolean; order?: number; map?: [number, number] };
type Edits = {
  text: Record<string, string>;
  hide: Record<string, 'self' | 'group'>;
  checks: Record<string, ItemEdit>;
  entrances: Record<string, ItemEdit>;
  dests: Record<string, ItemEdit>;
  areas: Record<string, ItemEdit>;
  order: Record<string, string[]>;
  tabs: string[];
  icons: Record<string, string>;
  colors: Record<string, Record<string, string>>;
  customEntrances: CustomEntrance[];
  items: Record<string, ItemEdit>;
  stones: Record<string, ItemEdit>;
};
type Saved = {
  v: 1; seeds: Seed[]; current: string; custom: CustomCheck[]; edits: Edits;
  ui: {
    skin?: string; theme?: string; meter?: string; font?: string; seal?: string; noPattern?: boolean; scale?: number; compact?: boolean; hideDone?: boolean; hideFound?: boolean;
    showLocked?: boolean; changesOnly?: boolean; collapsed?: string[];
    logicOff?: boolean; logicOnly?: boolean; checksView?: 'list' | 'map'; haveOnly?: boolean; hideWritten?: boolean;
    /** Which check names show. Custom puts the player's renames on top of nameBase. */
    names?: NameStyle; nameBase?: 'original' | 'player';
    notes?: NotesView;
    /** Items pinned to the top of the Items tab. Kept here only while savePins is on. */
    pins?: string[]; savePins?: boolean;
  };
};

const blankEdits = (): Edits => ({ text: {}, hide: {}, checks: {}, entrances: {}, dests: {}, areas: {}, order: {}, tabs: [], icons: {}, colors: {}, customEntrances: [], items: {}, stones: {} });

const AFFECTS = new Set<string>(audit.affects);
/** Settings outside the Entrances section that still change which entrances shuffle. */
const AFFECTS_ENTRANCES = new Set<string>((audit as any).entrances ?? []);
const TYPE_NAMES: Record<string, string> = {
  chest: 'Chests', npc: 'NPCs', gs: 'Skulltulas', sf: 'Stray fairies', cow: 'Cows', shop: 'Shops', scrub: 'Scrubs', sr: 'Silver rupees',
  collectible: 'Freestanding', pot: 'Pots', crate: 'Crates', barrel: 'Barrels', grass: 'Grass', tree: 'Trees', bush: 'Bushes', rock: 'Rocks',
  soil: 'Soil', wonder: 'Wonder spots', fish: 'Fish', fairy: 'Fairy fountains', snowball: 'Snowballs', hive: 'Hives', rupee: 'Rupees', heart: 'Hearts',
  'fairy-spot': 'Fairy spots', butterfly: 'Butterflies', boulder: 'Boulders', 'boulder-red': 'Red boulders', 'boulder-silver': 'Silver boulders',
  icicle: 'Icicles', redice: 'Red ice', gossip: 'Gossip stones', 'gossip-big': 'Big gossip fairies', custom: 'Your checks',
};
const TYPE_ONE: Record<string, string> = {
  chest: 'Chest', npc: 'NPC', gs: 'Skulltula', sf: 'Stray fairy', cow: 'Cow', shop: 'Shop', scrub: 'Scrub', sr: 'Silver rupee', collectible: 'Freestanding',
  pot: 'Pot', crate: 'Crate', barrel: 'Barrel', grass: 'Grass', tree: 'Tree', bush: 'Bush', rock: 'Rock', soil: 'Soil', wonder: 'Wonder', fish: 'Fish',
  fairy: 'Fountain', snowball: 'Snowball', hive: 'Hive', rupee: 'Rupee', heart: 'Heart', 'fairy-spot': 'Fairy spot', butterfly: 'Butterfly', boulder: 'Boulder',
  'boulder-red': 'Red boulder', 'boulder-silver': 'Silver boulder', icicle: 'Icicle', redice: 'Red ice', gossip: 'Gossip', 'gossip-big': 'Big gossip', custom: 'Yours',
};
const CATEGORY_NAMES: Record<string, string> = {
  main: 'Main', 'main.shuffle': 'What gets shuffled', 'main.prices': 'Prices', 'main.events': 'Events', 'main.cross': 'Cross-game', 'main.world': 'World layout',
  'main.camc': 'Chest appearance', 'main.qol': 'Quality of life', 'main.misc': 'Miscellaneous', 'main.nologic': 'No effect on logic', entrances: 'Entrances', hints: 'Hints',
  'items.progressive': 'Progressive items', 'items.ageless': 'Ageless items', 'items.mmAgeRequirements': 'MM age requirements', 'items.extensions.general': 'Item extensions',
  'items.extensions.oot': 'OoT extensions', 'items.extensions.mm': 'MM extensions', 'items.extensions.shared': 'Shared items', 'items.extensions.systems': 'Item systems',
  'items.extensions.coins': 'Coins', 'items.extensions.traps': 'Traps', 'items.extensions.crossGame.items': 'Cross-game items', 'items.extensions.crossGame.songs': 'Cross-game songs',
  'items.extensions.crossGame.masks': 'Cross-game masks', 'cutscenes.main': 'Cutscenes', 'cutscenes.bosses.oot': 'OoT boss cutscenes', 'cutscenes.bosses.mm': 'MM boss cutscenes',
  'cutscenes.minibosses.mm': 'MM miniboss cutscenes', 'cutscenes.glitches': 'Glitch-aiding cutscenes',
};
const catName = (c: string) => CATEGORY_NAMES[c] ?? c.split('.').pop()!.replace(/([A-Z])/g, ' $1').replace(/^./, m => m.toUpperCase());

const STORAGE_KEY = 'ootmm-checklist-v1';
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const uid = () => Math.random().toString(36).slice(2, 10);
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

let saved: Saved;
let seed: Seed;
let S: any;
let checks: CheckEntry[] = [];
let lastResult: ComputeResult | null = null;
let doneSet = new Set<string>();
let skipSet = new Set<string>();
let tab: 'list' | 'entrances' | 'notes' | 'items' | 'settings' | 'seeds' | 'coop' = 'list';
let region: string | null = null;
let phoneView: 'rail' | 'pane' = 'rail';
let query = '';
let gameFilter: 'all' | 'oot' | 'mm' = 'all';
const typeFilter = new Set<string>();
const openCats = new Set<string>(['main.shuffle']);
let settingsQuery = '';
let entrRegion: string | null = null;
let entrQuery = '';
let entrGame: 'all' | 'oot' | 'mm' = 'all';
let entrDir: 'all' | 'in' | 'out' = 'all';
const entrKinds = new Set<string>();
let picking: string | null = null;
let pickQuery = '';
let computing = false;
let editMode = false;
let settingsView: 'game' | 'look' | 'edits' = 'game';
let entr: EntranceData = { list: [], dests: [], sets: [], rev: {} };
let pickAll = false;
let remoteSave: ((s: string) => void) | null = null;
let logicOut: LogicOutput | null = null;
let reachSet = new Set<string>();
let stoneSet = new Set<string>();
/** For each check out of logic: the missing items that would each put it in logic on their own. */
let opensWith = new Map<string, string[]>();
let logicBusy = false;
let logicError = '';
let itemQuery = '';
let itemGame: 'all' | 'oot' | 'mm' = 'all';
let pickingItemFor: string | null = null;
let itemPickQuery = '';

/* ---------- Saving ---------- */

function newSeed(name: string, settings?: string): Seed {
  return { id: uid(), name, settings: settings ?? exportSettings(DEFAULT_SETTINGS), done: [], skipped: [], skippedRegions: [], rolled: {}, entrances: {}, notes: {}, pad: '', doc: '', found: {}, have: {}, hints: {}, updated: Date.now() };
}

function load(raw?: string | null): Saved {
  if (raw === undefined) {
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { raw = null; }
  }
  if (raw) {
    try {
      const v = JSON.parse(raw) as Saved;
      if (v.seeds?.length) {
        const ui = v.ui ?? {};
        ui.skin ??= ui.theme === 'dark' ? 'termina' : ui.theme === 'light' ? 'day' : 'hero';
        ui.names ??= 'custom'; ui.nameBase ??= 'original';
        ui.savePins ??= true;
        for (const s of v.seeds) { s.done ??= []; s.skipped ??= []; s.skippedRegions ??= []; s.rolled ??= {}; s.preCompleted ??= []; s.entrances ??= {}; s.notes ??= {}; s.pad ??= ''; s.doc ??= textToNotes(s.pad); s.found ??= {}; s.have ??= {}; s.hints ??= {}; }
        const edits = { ...blankEdits(), ...v.edits };
        edits.tabs = edits.tabs.filter(t => t !== 'hints');
        return { ...v, custom: v.custom ?? [], edits, ui };
      }
    } catch { /* falls through to a fresh start */ }
  }
  const first = newSeed('My seed');
  return { v: 1, seeds: [first], current: first.id, custom: [], edits: blankEdits(), ui: { skin: 'hero', hideDone: false, changesOnly: true, names: 'custom', nameBase: 'original' } };
}

let saveTimer = 0;
function save() {
  seed.done = [...doneSet];
  seed.skipped = [...skipSet];
  seed.updated = Date.now();
  if (seed.live) liveStamp();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(writeSave, 250);
}
let warnedFull = false;
function writeSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const json = JSON.stringify(saved);
  try { localStorage.setItem(STORAGE_KEY, json); } catch {
    /* The hosted copy below still keeps it. Elsewhere, say so once rather than lose changes quietly. */
    if (!remoteSave && !warnedFull) { warnedFull = true; toast("This device wouldn't save your changes. Save a backup from the Seeds page so nothing is lost."); }
  }
  remoteSave?.(json);
}
/** Writes any change still waiting, for when the page closes or goes to the background. */
const flushSave = () => { if (saveTimer) writeSave(); };

/** Two edit sets put together. Anything in the incoming set wins; anything only on this device stays. */
function mergeEdits(mine: Edits, incoming: Partial<Edits>): Edits {
  const out: any = { ...blankEdits(), ...mine };
  for (const [k, v] of Object.entries(incoming ?? {}) as [keyof Edits, any][]) {
    if (k === 'customEntrances' && Array.isArray(v)) out[k] = [...out[k].filter((x: any) => !v.some((y: any) => y.id === x.id)), ...v];
    else if (Array.isArray(v)) { if (v.length) out[k] = v; }
    else if (v && typeof v === 'object') out[k] = { ...out[k], ...v };
  }
  return out;
}

/* Undo covers the open seed and every edit. */
const undoStack: string[] = [];
function snap() {
  seed.done = [...doneSet];
  seed.skipped = [...skipSet];
  undoStack.push(JSON.stringify({ id: seed.id, seed, edits: saved.edits, custom: saved.custom }));
  if (undoStack.length > 40) undoStack.shift();
}
function undo() {
  const raw = undoStack.pop();
  if (!raw) return toast('Nothing to undo.');
  const u = JSON.parse(raw);
  const target = saved.seeds.find(x => x.id === u.id);
  if (target) Object.assign(target, u.seed);
  saved.edits = u.edits;
  saved.custom = u.custom;
  if (seed.id === u.id) { doneSet = new Set(seed.done); skipSet = new Set(seed.skipped); }
  save(); applyTheme(); rebuild(); renderAll();
  toast('Undone.');
}

/* On the hosted version, keep progress on the account as well as in the browser. */
async function connectHostedStore() {
  const c = (window as any).claude;
  if (!c?.use) return;
  try {
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    const doc = db.collection(`data/users/${id}`).doc('state');
    const snap = await doc.get();
    const local = saved.seeds.reduce((m, s) => Math.max(m, s.updated), 0);
    const remote = snap.exists ? snap.data() : null;
    if (remote?.blob && (remote.updated ?? 0) > local) {
      saved = load(new TextDecoder().decode(inflateRaw(base64ToUint8Array(remote.blob))));
      applyTheme();
      openSeed(saved.current);
    }
    liveDb = db;
    liveWhere = 'claude';
    liveFollow();
    remoteSave = json => {
      const blob = uint8ArrayToBase64(deflateRaw(new TextEncoder().encode(json), { level: 9 }), { urlSafe: true });
      doc.set({ blob, updated: Date.now() }).catch(() => {});
    };
  } catch { /* stays on browser storage */ }
}

/* ---------- Live play (hosted page) ---------- */

let liveDb: any = null;
/** Where live rooms are kept: the Claude hosted page's own db, or the owner's Firebase project everywhere else. */
let liveWhere: '' | 'claude' | 'firebase' = '';
let fireState: 'idle' | 'connecting' | 'failed' = 'idle';
/** Outside the hosted page, connects to Firebase the first time Coop is needed. */
async function useFirebase() {
  if (liveDb || __TARGET__ === 'artifact' || !firebaseReady() || fireState === 'connecting') return;
  fireState = 'connecting';
  const db: LiveDb | null = await connectFirebase();
  if (liveDb) return;
  if (db) { liveDb = db; liveWhere = 'firebase'; fireState = 'idle'; liveFollow(); }
  else fireState = 'failed';
  if (tab === 'coop') renderPane();
}
let liveUnsub: (() => void) | null = null;
let liveRoom = '';
let liveRemote: LiveState | null = null;
let livePushTimer = 0, livePushing = false, livePushAgain = false;
let liveStatus = '';
const liveBase = new Map<string, Record<string, string>>();
const liveDoc = (room: string) => liveDb.doc('live/' + room);
const liveLocal = (): LiveState => ({ flat: flatten(seed), clock: seed.liveClock ??= {} });
const encodeLive = (st: LiveState) => ({ v: 1, updated: Date.now(), blob: uint8ArrayToBase64(deflateRaw(new TextEncoder().encode(JSON.stringify(st)), { level: 6 }), { urlSafe: true }) });
function decodeLive(data: any): LiveState | null {
  try {
    const st = JSON.parse(new TextDecoder().decode(inflateRaw(base64ToUint8Array(data.blob))));
    return st && typeof st.flat === 'object' && typeof st.clock === 'object' ? st : null;
  } catch { return null; }
}
function setLiveStatus(text: string) {
  liveStatus = text;
  const el = document.getElementById('liveStatus');
  if (el) el.textContent = text;
}
/** Times the keys that changed since the last look, then sends them. */
function liveStamp() {
  const now = flatten(seed);
  const before = liveBase.get(seed.id);
  if (before) stamp(before, now, seed.liveClock ??= {}, Date.now());
  liveBase.set(seed.id, now);
  queueLivePush();
}
function queueLivePush() {
  if (!liveDb || !seed.live) return;
  clearTimeout(livePushTimer);
  livePushTimer = window.setTimeout(livePush, 300);
}
/** One write at a time: this device's state merged with the latest from the room. */
async function livePush() {
  if (!liveDb || !seed.live) return;
  if (livePushing) { livePushAgain = true; return; }
  livePushing = true;
  const room = seed.live;
  try {
    const mine = liveLocal();
    const state = liveRemote ? merge(mine, liveRemote) : mine;
    if (liveRemote && sameState(state, liveRemote)) return;
    await liveDoc(room).set(encodeLive(state));
    if (seed.live === room) liveRemote = state;
    setLiveStatus('Synced');
  } catch (e: any) {
    if (e?.code === 'permission-denied') setLiveStatus("The coop server turned this change away. Stop and share the seed again.");
    else if (e?.code === 'invalid_argument') setLiveStatus("Your changes can't be shared from here. The page's owner needs to invite you as an Editor.");
    else { setLiveStatus('Not synced yet. Trying again.'); window.setTimeout(queueLivePush, 1500 + Math.random() * 1500); }
  } finally {
    livePushing = false;
    if (livePushAgain) { livePushAgain = false; queueLivePush(); }
  }
}
/** Follows the open seed's live room, if it has one. */
function liveFollow() {
  const room = liveDb && seed?.live ? seed.live : '';
  if (room === liveRoom) return;
  liveUnsub?.(); liveUnsub = null; liveRemote = null; liveRoom = room;
  if (!room) { setLiveStatus(''); return; }
  liveBase.set(seed.id, flatten(seed));
  setLiveStatus('Connecting');
  const seedId = seed.id;
  try {
    liveUnsub = liveDoc(room).onSnapshot((snap: any) => {
      if (seed.id !== seedId) return;
      if (!snap.exists) { liveRemote = null; if (!snap.metadata?.fromCache) queueLivePush(); return; }
      const remote = decodeLive(snap.data());
      if (!remote) return;
      liveRemote = remote;
      applyLive(merge(liveLocal(), remote));
      if (!sameState(liveLocal(), remote)) queueLivePush();
      if (!snap.metadata?.fromCache) setLiveStatus('Synced');
    }, (e: any) => setLiveStatus(e?.code === 'revoked' ? 'Live play stopped because access to the page changed.' : 'Lost the connection. Reopen the page to reconnect.'));
  } catch { setLiveStatus("Live play isn't available here."); }
}
/** Puts merged live state on the open seed and refreshes what changed. */
function applyLive(st: LiveState) {
  seed.liveClock = st.clock;
  const before = flatten(seed);
  const keys = new Set([...Object.keys(before), ...Object.keys(st.flat)]);
  if ([...keys].every(k => before[k] === st.flat[k])) return;
  const settingsBefore = seed.settings;
  const docBefore = seed.doc;
  unflatten(st.flat, seed);
  liveBase.set(seed.id, flatten(seed));
  doneSet = new Set(seed.done);
  skipSet = new Set(seed.skipped);
  save();
  if (seed.settings !== settingsBefore) {
    try { S = importSettings(seed.settings); } catch { /* keeps the last good settings */ }
    recompute();
    return;
  }
  const typing = document.activeElement?.id === 'docPage';
  if (tab === 'notes' && typing) { renderDial(); renderRail(); renderCount(); }
  else if (tab === 'notes' && seed.doc === docBefore) { renderDial(); renderRail(); renderCount(); }
  else renderAll();
  scheduleLogic();
}
function startLive() {
  if (!liveDb) return;
  seed.live = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => (b % 36).toString(36)).join('');
  const now = Date.now();
  seed.liveClock = {};
  for (const k of Object.keys(flatten(seed))) seed.liveClock[k] = now;
  save();
  liveFollow();
  livePush();
  renderPane();
}
async function joinLive(code: string) {
  const room = roomFromCode(code);
  if (!liveDb || !room) { toast('Type the LIVE- code your partner sent.'); return; }
  let remote: LiveState | null = null;
  try {
    const snap = await liveDoc(room).get();
    remote = snap.exists ? decodeLive(snap.data()) : null;
  } catch { /* handled below */ }
  if (!remote) { toast("There's no live seed with that code yet. Check it with your partner."); return; }
  let target = saved.seeds.find(s => s.live === room);
  if (!target) {
    target = newSeed('Live seed');
    target.live = room;
    unflatten(remote.flat, target);
    target.liveClock = { ...remote.clock };
    saved.seeds.push(target);
  }
  save();
  openSeed(target.id);
  save();
  renderAll();
  toast(`Joined ${target.name}. You'll see each other's changes as they happen.`);
}
function stopLive() {
  seed.live = undefined;
  seed.liveClock = undefined;
  save();
  liveFollow();
  renderPane();
  toast('This seed is no longer live on this device. Your progress stays here.');
}
function liveBoxHtml() {
  if (!liveDb) return '';
  if (seed.live) return `<div class="box live-box"><h3>Playing live</h3>
      <p>This seed is shared live.</p>
      <p>Your partner joins with this code: <b class="live-code">${esc(liveCode(seed.live))}</b></p>
      <p class="fine">Status: <span id="liveStatus">${esc(liveStatus || 'Connecting')}</span></p>
      <div class="btns"><button class="btn alt keep" data-live-copy>Copy code</button><button class="btn danger keep" data-live-stop>Stop playing live on this device</button></div>
    </div>`;
  return `<div class="box live-box"><h3>Play together live</h3>
      <p>Share this seed with a partner. Ticks, found items, entrances and notes show up for both of you as they happen.</p>
      <div class="btns"><button class="btn keep" data-live-start>Share this seed live</button></div>
      <p class="fine">Or join your partner's seed with their code:</p>
      <div class="live-join"><input type="text" id="liveJoin" class="keep" placeholder="LIVE-..." aria-label="Live code"><button class="btn alt keep" data-live-join>Join</button></div>
    </div>`;
}

/* ---------- Engine calls ---------- */

/* Two background workers: one keeps the checklist quick, the other reads the full logic,
   so a slow logic run never holds up a settings change. */
type JobKind = 'checks' | 'logic';
const workers: Record<JobKind, Worker | null> = { checks: null, logic: null };
let job = 0;
type Pending = { kind: JobKind; payload: any; res: (r: any) => void; rej: (e: Error) => void; timer: number };
const pending = new Map<number, Pending>();

/* If a background worker can't run here, the page does the work itself. */
function dropWorker(kind: JobKind) {
  workers[kind]?.terminate();
  workers[kind] = null;
  for (const [id, p] of pending) {
    if (p.kind !== kind) continue;
    clearTimeout(p.timer);
    pending.delete(id);
    runJobHere(p.kind, p.payload).then(p.res, p.rej);
  }
}

function startWorker(source: string, kind: JobKind) {
  try {
    const w = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    workers[kind] = w;
    w.onerror = () => dropWorker(kind);
    w.onmessage = e => {
      const p = pending.get(e.data.job);
      if (!p) return;
      pending.delete(e.data.job);
      clearTimeout(p.timer);
      if (e.data.result) p.res(e.data.result); else p.rej(new Error(e.data.error));
    };
  } catch { workers[kind] = null; }
}

/* The first logic run on a slow phone reads every access rule, so it gets longer before the page takes over. */
function runJob<T>(kind: JobKind, payload: any): Promise<T> {
  const w = workers[kind];
  if (!w) return runJobHere(kind, payload);
  const id = ++job;
  const copy = JSON.parse(JSON.stringify(payload));
  return new Promise((res, rej) => {
    pending.set(id, { kind, payload: copy, res, rej, timer: window.setTimeout(() => dropWorker(kind), kind === 'logic' ? 120000 : 15000) });
    w.postMessage({ job: id, kind, payload: copy });
  });
}
const runEngine = (settings: any) => runJob<ComputeResult>('checks', settings);

/** Random rolls can't be known ahead of time, so the player's answers stand in for them. */
function settingsForEngine() {
  const out = { ...S };
  for (const key of ROLLABLE) {
    const v = S[key];
    if (v?.type === 'random' || v?.type === 'random-mixed') {
      const fixedOn: string[] = v.type === 'random-mixed' ? v.set ?? [] : [];
      const fixedOff: string[] = v.type === 'random-mixed' ? v.unset ?? [] : [];
      const known = seed.rolled[key] ?? (UNKNOWN_MEANS_ALL.has(key) ? settingDef(key).values.map((x: any) => x.value).filter((x: string) => !fixedOff.includes(x)) : []);
      out[key] = { type: 'specific', values: [...new Set([...fixedOn, ...known])] };
    }
  }
  /* A one-of choice like starting age. Left on Random until the player sets it; logic then only counts checks open either way. */
  for (const key of ROLLED_CHOICES) if (S[key] === 'random' && seed.rolled[key]?.length) out[key] = seed.rolled[key][0];
  return out;
}

const settingDef = (key: string) => (SETTINGS as readonly any[]).find(s => s.key === key);
const rolling = () => [
  ...ROLLABLE.filter(k => ['random', 'random-mixed'].includes(S[k]?.type)),
  ...ROLLED_CHOICES.filter(k => S[k] === 'random'),
].filter(k => settingDef(k)?.cond?.(S) !== false);
/** A rolled setting the player still has to answer. An empty answer only counts for sets, where it means none came up. */
const unanswered = (k: string) => ROLLED_CHOICES.includes(k) ? !seed.rolled[k]?.length : !seed.rolled[k];

let computeSeq = 0;
async function recompute() {
  const mine = ++computeSeq;
  computing = true;
  renderCount();
  try {
    const result = await runEngine(settingsForEngine());
    if (mine !== computeSeq) return;
    lastResult = result;
    rebuild();
    scheduleLogic();
  } catch (e: any) {
    if (mine !== computeSeq) return;
    toast(`These settings can't be combined: ${e?.message ?? e}`);
  }
  computing = false;
  rebuild();
  renderAll();
}

/* ---------- Reachable checks ---------- */

const catalog = (): CatalogItem[] => logicOut?.catalog ?? [];
const catalogById = () => new Map(catalog().map(i => [i.id, i]));
const itemLabel = (id: string) => id.startsWith('text:') ? id.slice(5) : saved.edits.items[id]?.name ?? catalogById().get(id)?.name ?? id;

/** How many of each item the player has: what they logged at checks, plus their own changes. Starting items come from the settings. */
function owned(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of Object.values(seed.found)) if (!v.startsWith('text:')) out[v] = (out[v] ?? 0) + 1;
  for (const [k, n] of Object.entries(seed.have)) out[k] = Math.max(0, (out[k] ?? 0) + n);
  return out;
}
const countOf = (i: CatalogItem, have = owned()) => Math.min(i.max, i.start + (have[i.id] ?? 0));
const logicOn = () => !saved.ui.logicOff;
const logicReady = () => logicOn() && !!logicOut && !logicError;
const inLogic = (c: CheckEntry) => reachSet.has(c.id);

let logicTimer = 0;
let logicSeq = 0;
function scheduleLogic() {
  clearTimeout(logicTimer);
  if (!logicOn() || !lastResult) return;
  logicTimer = window.setTimeout(async () => {
    const mine = ++logicSeq;
    logicBusy = true;
    renderLogicStatus();
    try {
      const input = { settings: settingsForEngine(), entrances: seed.entrances, items: owned(), preCompleted: S.preCompletedDungeons ? seed.preCompleted ?? [] : [] };
      const out = await runJob<LogicOutput>('logic', input);
      if (mine !== logicSeq) return;
      logicOut = out;
      logicError = '';
      reachSet = new Set(out.reach);
      stoneSet = new Set(out.stones);
      opensWith = new Map();
      logicBusy = false;
      renderLogicStatus();
      renderRail();
      renderPane();
      /* Then try each missing item on its own. It takes longer, so it waits until the player pauses. */
      await new Promise(r => setTimeout(r, 700));
      if (mine !== logicSeq) return;
      const more = await runJob<LogicOutput>('logic', { ...input, next: true }).catch(() => null);
      if (mine !== logicSeq || !more) return;
      logicOut = more;
      for (const n of more.next ?? []) for (const id of n.opens) (opensWith.get(id) ?? opensWith.set(id, []).get(id)!).push(n.id);
    } catch (e: any) {
      if (mine !== logicSeq) return;
      logicError = String(e?.message ?? e);
    }
    logicBusy = false;
    renderRail();
    renderPane();
  }, 150);
}
function renderLogicStatus() {
  const el = document.getElementById('logicPill');
  if (el) el.textContent = logicBusy ? 'Working out logic' : '';
}

function customEntries(): CheckEntry[] {
  const all = [...(shippedCustom.checks as CustomCheck[]), ...saved.custom];
  const out: CheckEntry[] = [];
  for (const c of all) {
    const ok = !c.when || Object.entries(c.when).every(([k, v]) => Array.isArray(v) ? v.includes(S[k]) : S[k] === v);
    if (!ok) continue;
    const known = regionList().find(r => r.name.toLowerCase() === c.region.toLowerCase());
    out.push({ id: 'custom:' + c.id, name: c.name, game: c.game, type: c.type ?? 'custom', region: known?.id ?? 'custom:' + c.region, regionName: known?.name ?? c.region, dungeon: false, fixed: false, junk: false });
  }
  return out;
}

const regionList = () => {
  const seen = new Map<string, string>();
  for (const c of lastResult?.checks ?? []) seen.set(c.region, areaName(c.region, c.regionName));
  for (const e of lastResult?.entrances.list ?? []) seen.set(e.group, areaName(e.group, e.groupName));
  return [...seen].map(([id, name]) => ({ id, name }));
};
const areaName = (id: string, fallback: string) => saved.edits.areas[id]?.name ?? fallback;
function resolveArea(name: string) {
  const known = regionList().find(r => r.name.toLowerCase() === name.toLowerCase());
  return known ?? { id: 'custom:' + name, name };
}

/* ---------- Check names ---------- */

/** Every name a check goes by, so search finds it by any of them. */
const otherNames = new Map<string, string>();
const nameStyle = (): NameStyle => saved.ui.names ?? 'custom';
const useRenames = () => nameStyle() === 'custom';
/** The name a check has before the player's own renames: OoTMM's, or the player-style one. */
function baseName(c: { id: string; name: string }) {
  if (c.id.startsWith('custom:')) return c.name;
  const style = nameStyle() === 'custom' ? saved.ui.nameBase ?? 'original' : nameStyle();
  return style === 'player' ? playerName(c.id, c.name) : c.name;
}
/** The engine's own entry for a check, before any edits. */
const engineCheck = (id: string) => [...(lastResult?.checks ?? []), ...customEntries()].find(x => x.id === id);
function setNameStyle(style: NameStyle) {
  if (style !== 'custom') saved.ui.nameBase = style;
  saved.ui.names = style;
  save(); rebuild(); renderAll();
}
/** Saves a player's name for a check. Blank or the same as the base name clears it. Switches to Your names so it shows. */
function renameCheck(id: string, name: string) {
  const c = engineCheck(id);
  if (!c) return;
  const E = saved.edits;
  const keep = name.trim() && name.trim() !== baseName(c) ? name.trim() : undefined;
  E.checks[id] = { ...E.checks[id], name: keep };
  if (!Object.values(E.checks[id]).some(v => v !== undefined)) delete E.checks[id];
  if (keep && !useRenames()) {
    saved.ui.nameBase = nameStyle() as 'original' | 'player';
    saved.ui.names = 'custom';
    toast('Switched check names to Your names so your rename shows.');
  }
}

/* Applies the player's edits on top of what the engine worked out. */
function rebuild() {
  const E = saved.edits;
  otherNames.clear();
  checks = [...(lastResult?.checks ?? []), ...customEntries()].map(c => {
    const o = E.checks[c.id];
    const base = baseName(c);
    const name = (useRenames() || c.id.startsWith('custom:')) && o?.name ? o.name : base;
    otherNames.set(c.id, `${c.name} ${playerName(c.id, c.name)} ${o?.name ?? ''}`);
    if (!o) return name === c.name ? c : { ...c, name };
    const a = o.area ? resolveArea(o.area) : null;
    return { ...c, name, region: a?.id ?? c.region, regionName: a?.name ?? c.regionName, game: o.game ?? c.game };
  });
  const base = lastResult?.entrances ?? NO_ENTRANCES;
  const dests = base.dests.map(d => { const o = E.dests[d.id]; return o ? { ...d, title: o.name ?? d.title, sub: o.sub ?? d.sub } : d; });
  const everywhere = base.dests.map((_, i) => i);
  const customs: EntranceEntry[] = E.customEntrances.map(c => {
    const a = resolveArea(c.area);
    return { id: c.id, game: c.game, kind: 'Your entrances', title: c.title, sub: c.sub, group: a.id, groupName: a.name, dungeon: false, allowed: base.sets.length, reusable: true, dir: 'other' as const };
  });
  const list = [...base.list, ...customs].map(e => {
    e = e.dir ? e : { ...e, dir: guessDir(e.title) };
    const o = E.entrances[e.id];
    if (!o) return e;
    const a = o.area ? resolveArea(o.area) : null;
    return { ...e, title: o.name ?? e.title, sub: o.sub ?? e.sub, group: a?.id ?? e.group, groupName: a?.name ?? e.groupName };
  });
  entr = { ...base, list, dests, sets: [...base.sets, everywhere] };
}

/* ---------- Derived lists ---------- */

const REGION_ORDER = new Map(Object.keys(REGIONS).map((k, i) => [k, i]));
const regionLabel = (c: CheckEntry) => areaName(c.region, c.region === 'NONE' ? 'Anywhere' : c.region === 'POCKET' ? 'Starting items' : c.regionName);
const checkHidden = (c: CheckEntry) => !!(saved.edits.checks[c.id]?.hidden || saved.edits.areas[c.region]?.hidden);
/* Entrances gathered into their own sections at the top of the Entrances tab instead of under their areas:
   spawns decide where the seed starts, and songs warp from anywhere. */
const ENTR_PINNED = [
  { id: '@spawns', name: 'Where you start', kinds: ['Spawns'], order: (e: EntranceEntry) => Number(/adult/i.test(e.title)) },
  { id: '@songs', name: 'Songs', kinds: ['Warp songs', 'Soaring'], order: (e: EntranceEntry) => Number(e.kind === 'Soaring') },
];
const entrPin = (id: string) => ENTR_PINNED.find(p => p.id === id);
const entrGroup = (e: EntranceEntry) => ENTR_PINNED.find(p => p.kinds.includes(e.kind))?.id ?? e.group;
/* Older results have no direction, so read it from OoTMM's own titles. */
const guessDir = (title: string): EntranceEntry['dir'] =>
  /^Exit of /.test(title) ? 'out' : /^Entrance to /.test(title) ? 'in' : /^Way to /.test(title) ? 'path' : 'other';
/* Each area splits its entrances by direction, so going in and coming out never mix. */
const ENTR_DIRS = [
  { dir: 'in', name: 'Going in', hint: 'Doors from here into houses, grottos and dungeons', arrow: '↘', cut: /^Entrance to /, lead: 'Into ' },
  { dir: 'out', name: 'Coming out', hint: 'Leaving those places, back out to here', arrow: '↖', cut: /^Exit of /, lead: 'Out of ' },
  { dir: 'path', name: 'Roads to other areas', hint: '', arrow: '→', cut: null, lead: '' },
  { dir: 'other', name: 'Other', hint: '', arrow: '•', cut: null, lead: '' },
] as const;
const entranceHidden = (e: EntranceEntry) => !!(saved.edits.entrances[e.id]?.hidden || saved.edits.areas[e.group]?.hidden);
const counted = (c: CheckEntry) => !c.fixed && !c.junk && !skipSet.has(c.id) && !seed.skippedRegions.includes(c.region) && !checkHidden(c);
const shown = (c: CheckEntry) => (saved.ui.showLocked || (!c.fixed && !c.junk)) && (editMode || !checkHidden(c));

const regionRank = (id: string, game: string, dungeon: boolean) =>
  (id === 'NONE' || id === 'POCKET' ? 4e5 : game === 'oot' ? 0 : 2e5) + (dungeon ? 1e5 : 0) + (saved.edits.areas[id]?.order ?? REGION_ORDER.get(id) ?? 5e4);

function regionStats() {
  const map = new Map<string, { id: string; name: string; game: string; dungeon: boolean; total: number; done: number; reach: number; skipped: boolean }>();
  const logic = logicReady();
  for (const c of checks) {
    if (!shown(c)) continue;
    let r = map.get(c.region);
    if (!r) { r = { id: c.region, name: regionLabel(c), game: c.game, dungeon: c.dungeon, total: 0, done: 0, reach: 0, skipped: seed.skippedRegions.includes(c.region) }; map.set(c.region, r); }
    r.dungeon ||= c.dungeon;
    if (counted(c)) { r.total++; if (doneSet.has(c.id)) r.done++; else if (logic && inLogic(c)) r.reach++; }
  }
  return [...map.values()].sort((a, b) => regionRank(a.id, a.game, a.dungeon) - regionRank(b.id, b.game, b.dungeon));
}

function totals() {
  const t = { all: 0, done: 0, oot: 0, ootDone: 0, mm: 0, mmDone: 0, reach: 0 };
  const logic = logicReady();
  for (const c of checks) {
    if (!counted(c)) continue;
    const d = doneSet.has(c.id);
    t.all++; if (d) t.done++; else if (logic && inLogic(c)) t.reach++;
    if (c.game === 'oot') { t.oot++; if (d) t.ootDone++; } else { t.mm++; if (d) t.mmDone++; }
  }
  return t;
}

function filtered() {
  const q = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return checks.filter(c => {
    if (!shown(c)) return false;
    if (gameFilter !== 'all' && c.game !== gameFilter) return false;
    if (typeFilter.size && !typeFilter.has(c.type)) return false;
    if (saved.ui.hideDone && doneSet.has(c.id)) return false;
    if (saved.ui.logicOnly && logicReady() && !doneSet.has(c.id) && !inLogic(c)) return false;
    if (region && !q.length && c.region !== region) return false;
    if (q.length) {
      const hay = `${c.id} ${c.name} ${otherNames.get(c.id) ?? ''} ${regionLabel(c)} ${seed.notes[c.id] ?? ''}`.toLowerCase();
      if (!q.every(w => hay.includes(w))) return false;
    }
    return true;
  });
}

/* ---------- Shell ---------- */

const ICON = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z"/><path d="M12 14v7"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 6.5l1.5 1.5L9 5.5M5 12.5l1.5 1.5L9 11.5M5 18.5l1.5 1.5L9 17.5M12.5 7h7M12.5 13h7M12.5 19h7"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  coop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.5-5.5 5.5-5.5S14 16.7 14 20M14.5 14.6c.6-.2 1.3-.3 2-.3 2.6 0 4.5 1.9 4.5 4.7"/></svg>',
  seeds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"/><path d="M9 4v5h6V4M9 20v-6h6v6"/></svg>',
  entrances: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v15M3 21h18"/><circle cx="14.5" cy="12.5" r=".9" fill="currentColor" stroke="none"/></svg>',
  items: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9h14l-1.2 11H6.2z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 15.5h7M9 19h4"/></svg>',
  hints: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 21V9a5 5 0 0 1 10 0v12M4.5 21h15"/><path d="M10 11.5h4M10 15h4"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9h14l-1.2 11H6.2z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/></svg>',
  tick: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>',
};

const TAB_LABELS: Record<string, string> = { list: 'Checks', entrances: 'Entrances', notes: 'Notes', items: 'Items', settings: 'Settings', seeds: 'Seeds', coop: 'Coop' };
const pen = (edit: string) => `<span class="pen" data-edit="${esc(edit)}" role="button" aria-label="Edit">${ICON.pen}</span>`;
function tabs() {
  return Object.entries(TAB_LABELS).map(([k, label]) =>
    `<button class="tab keep" data-tab="${k}"><span class="tab-ic">${ICON[k === 'list' ? 'list' : k as keyof typeof ICON]}</span><span class="tab-t">${label}</span>${pen('tab:' + k)}</button>`).join('');
}
const editToggle = () => `<button class="edit-toggle" data-locked data-editmode aria-pressed="false">${ICON.pen}<span>Edit mode</span></button>`;

function shell() {
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
    const day = i % 12 === 0;
    const r1 = 58, r2 = day ? 52 : 55;
    return `<line class="tick${day ? ' day' : ''}" x1="${60 + r1 * Math.cos(a)}" y1="${60 + r1 * Math.sin(a)}" x2="${60 + r2 * Math.cos(a)}" y2="${60 + r2 * Math.sin(a)}"/>`;
  }).join('');
  $('#app').innerHTML = `
    <aside class="rail">
      <div class="brand">
        <svg class="dial" data-edit="meter" viewBox="0 0 120 120" role="img" aria-label="Checks finished">
          ${ticks}
          <circle class="well" cx="60" cy="60" r="47" stroke-width="6"/>
          <circle class="well" cx="60" cy="60" r="39.5" stroke-width="6"/>
          <circle class="oot" id="ringOot" cx="60" cy="60" r="47" stroke-width="6" transform="rotate(-90 60 60)"/>
          <circle class="mm" id="ringMm" cx="60" cy="60" r="39.5" stroke-width="6" transform="rotate(-90 60 60)"/>
          <circle class="face" cx="60" cy="60" r="33"/>
          <text class="pct" id="dialPct" x="60" y="66">0%</text>
          <text class="sym" x="60" y="80">of checks</text>
        </svg>
        <div class="brand-text">
          <button class="seed-btn" data-tab="seeds"><h1 id="seedName"></h1></button>
          <div class="day" id="dayLine"></div>
          <div class="remain" id="remain"></div>
          <div class="legend" id="legend"></div>
        </div>
        <div class="hearts" id="hearts" data-edit="meter"></div>
      </div>
      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
        <clipPath id="hq1"><rect width="12" height="12"/></clipPath>
        <clipPath id="hq2"><rect width="24" height="12"/></clipPath>
        <clipPath id="hq3"><path d="M0 0h24v24H12V12H0z"/></clipPath>
      </defs></svg>
      <nav class="tabs" aria-label="Main">${tabs()}</nav>
      <div class="edit-slot">${editToggle()}</div>
      <div class="regions" id="regions"></div>
    </aside>
    <main class="pane" id="pane"></main>
    <nav class="bottom" aria-label="Main">${tabs()}${editToggle()}</nav>
    <div class="editbar" id="editBar" hidden>
      <span>Tap anything to change it.</span>
      <button class="btn alt keep" data-undo>Undo</button>
      <button class="btn alt keep" data-open-colors>Colors</button>
      <button class="btn alt keep" data-add-check="">Add a check</button>
    </div>
    <div id="sheetHost"></div>
    <div class="toast" id="toast" role="status" hidden></div>`;
}

function renderTabs() {
  const order = [...saved.edits.tabs, ...Object.keys(TAB_LABELS)].filter((k, i, a) => a.indexOf(k) === i && TAB_LABELS[k]);
  document.querySelectorAll<HTMLElement>('.tabs, .bottom').forEach(nav => {
    const lock = nav.querySelector('[data-locked]');
    for (const k of order) { const b = nav.querySelector(`[data-tab="${k}"]`); if (b) nav.insertBefore(b, lock); }
  });
  document.querySelectorAll<HTMLElement>('.tab').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    const k = b.dataset.tab!;
    const custom = saved.edits.icons[k];
    b.querySelector('.tab-ic')!.innerHTML = custom ? `<span class="tab-glyph">${esc(custom)}</span>` : ICON[k as keyof typeof ICON];
  });
  document.querySelectorAll('[data-editmode]').forEach(b => b.setAttribute('aria-pressed', String(editMode)));
  document.querySelectorAll('[data-editmode] span').forEach(b => { b.textContent = editMode ? 'Edit mode on' : 'Edit mode'; });
  $('#editBar').hidden = !editMode;
  document.body.classList.toggle('editing', editMode);
  const listTab = tab === 'list' || (tab === 'entrances' && entranceData().list.length > 0);
  $('#app').dataset.phone = listTab ? phoneView : 'pane';
}

const HEART = 'M12 21.300C5.600 16.500 1.500 12.800 1.500 8.200 1.500 5 4 2.800 6.900 2.800c2 0 3.900 1 5.100 2.800 1.200-1.800 3.100-2.800 5.100-2.800 2.900 0 5.400 2.200 5.400 5.400 0 4.600-4.100 8.300-10.500 13.100z';
function heartRow(fraction: number, cls: string) {
  const pieces = Math.floor(fraction * 40 + 1e-9);
  return `<div class="heart-row ${cls}">${Array.from({ length: 10 }, (_, i) => {
    const q = Math.max(0, Math.min(4, pieces - i * 4));
    const fill = q === 0 ? '' : `<path class="hf" d="${HEART}"${q < 4 ? ` clip-path="url(#hq${q})"` : ''}/>`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="he" d="${HEART}"/>${fill}</svg>`;
  }).join('')}</div>`;
}

function renderDial() {
  const t = totals();
  const pct = t.all ? t.done / t.all : 0;
  const ring = (el: HTMLElement, r: number, f: number) => {
    const len = 2 * Math.PI * r;
    el.setAttribute('stroke-dasharray', String(len));
    el.setAttribute('stroke-dashoffset', String(len * (1 - f)));
    el.style.opacity = f > 0 ? '1' : '0';
  };
  ring($('#ringOot'), 47, t.oot ? t.ootDone / t.oot : 0);
  ring($('#ringMm'), 39.5, t.mm ? t.mmDone / t.mm : 0);
  const meter = saved.ui.meter || skinById(saved.ui.skin).meter;
  $('.brand').dataset.meter = meter;
  $('#hearts').innerHTML = meter === 'hearts' ? (t.oot ? heartRow(t.ootDone / t.oot, 'oot') : '') + (t.mm ? heartRow(t.mmDone / t.mm, 'mm') : '') : '';
  $('#dialPct').textContent = `${Math.floor(pct * 100)}%`;
  $('#seedName').textContent = seed.name;
  $('.seed-btn').dataset.edit = 'seed:' + seed.id;
  const finished = t.all > 0 && t.done === t.all;
  $('#dayLine').textContent = meter === 'clock'
    ? (finished ? 'Dawn of a new day' : pct >= 2 / 3 ? 'Dawn of the final day' : pct >= 1 / 3 ? 'Dawn of the second day' : 'Dawn of the first day')
    : (finished ? 'Hero of Time' : pct >= .75 ? 'Champion of the Sages' : pct >= .5 ? "Ruto's fiancé" : pct >= .25 ? 'Sworn Brother of the Gorons' : 'Kokiri outsider');
  $('#remain').textContent = `${(t.all - t.done).toLocaleString()} of ${t.all.toLocaleString()} left`;
  $('#legend').innerHTML = [t.oot ? `<b class="o">Hyrule ${t.ootDone}/${t.oot}</b>` : '', t.mm ? `<b class="m">Termina ${t.mmDone}/${t.mm}</b>` : ''].join('');
}

function renderRail() {
  if (tab === 'entrances') return renderEntranceRail();
  const stats = regionStats();
  const groups: [string, string, typeof stats][] = [
    ['Hyrule', 'oot', stats.filter(r => r.game === 'oot' && !r.dungeon && !['NONE', 'POCKET'].includes(r.id))],
    ['Hyrule dungeons', 'oot', stats.filter(r => r.game === 'oot' && r.dungeon)],
    ['Termina', 'mm', stats.filter(r => r.game === 'mm' && !r.dungeon && !['NONE', 'POCKET'].includes(r.id))],
    ['Termina dungeons', 'mm', stats.filter(r => r.game === 'mm' && r.dungeon)],
    ['Other', '', stats.filter(r => !r.dungeon && ['NONE', 'POCKET'].includes(r.id))],
  ];
  const t = totals();
  const hinted = areaHints();
  const row = (id: string, name: string, done: number, total: number, cur: boolean, skipped = false, reach = 0) =>
    `<button class="reg keep${total && done === total ? ' complete' : ''}${saved.edits.areas[id]?.hidden ? ' ghost' : ''}" data-region="${esc(id)}" aria-current="${cur}">
      <span class="n">${esc(name)}${areaTags(hinted.get(id))}${reach && !skipped ? `<i class="lg" title="Checks you can get now">${reach}</i>` : ''}</span><span class="c">${skipped ? 'Skipped' : `${done}/${total}`}</span>${id ? pen('area:' + id) : ''}
      <span class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></span></button>`;
  let html = row('', 'All areas', t.done, t.all, region === null, false, t.reach);
  for (const [name, cls, rows] of groups) {
    if (!rows.length) continue;
    html += `<div class="group ${cls}">${name}</div>` + rows.map(r => row(r.id, r.name, r.done, r.total, region === r.id, r.skipped, r.reach)).join('');
  }
  html += '<button class="linkish edit-only keep add-area" data-add-check="">Add an area</button>';
  const box = $('#regions');
  const top = box.scrollTop;
  box.innerHTML = html;
  box.scrollTop = top;
}

/* ---------- Checks page ---------- */

const noteHtml = (id: string) => seed.notes[id] ? `<span class="note">${esc(seed.notes[id])}</span>` : '';
const rowHtml = (c: CheckEntry) => {
  const isDone = doneSet.has(c.id);
  const isSkip = skipSet.has(c.id) || seed.skippedRegions.includes(c.region);
  const hid = !!saved.edits.checks[c.id]?.hidden;
  const tag = hid ? '<span class="tag" data-text>Hidden</span>' : c.fixed ? '<span class="tag" data-text>Vanilla</span>' : c.junk ? '<span class="tag" data-text>Junk</span>' : isSkip ? '<span class="tag" data-text>Skipped</span>' : '';
  const logic = logicReady() && !isDone && !isSkip && !c.fixed && !c.junk && !c.id.startsWith('custom:') ? (inLogic(c) ? ' inlogic' : ' outlogic') : '';
  const found = seed.found[c.id];
  const hint = !found ? itemHintFor(c.id) : undefined;
  const itemLine = (found ? `<span class="found"><span>Found:</span> <b>${esc(itemLabel(found))}</b></span>` : hint ? `<span class="hinted"><span>Hint:</span> <b>${esc(itemLabel(hint))}</b></span>` : '')
    + (logic === ' outlogic' ? opensHtml(c.id) : '');
  const age = logic === ' inlogic' ? logicOut?.ages[c.id] : undefined;
  return `<div class="row ${c.game}${isDone ? ' done' : ''}${hid ? ' ghost' : ''}${logic}" data-id="${esc(c.id)}">
    <button class="tick-btn" aria-pressed="${isDone}" data-edit="check:${esc(c.id)}"><span class="seal">${ICON.tick}</span><span class="nm"><span class="t">${esc(c.name)}</span>${itemLine}${noteHtml(c.id)}</span>${tag}${age ? `<span class="tag age" data-text>${age === 'child' ? 'Child' : 'Adult'}</span>` : ''}${logic === ' inlogic' ? '<span class="lgdot" title="In logic now" aria-label="In logic now"></span>' : ''}<span class="ty" data-text>${esc(TYPE_ONE[c.type] ?? c.type)}</span></button>
    <button class="bag${found ? ' has' : ''}" data-found="${esc(c.id)}" aria-label="What was here" title="Log the item you found here">${ICON.bag}</button>
    <button class="skip" aria-label="${isSkip ? 'Restore' : 'Skip'} ${esc(c.name)}" title="${isSkip ? 'Put back on the list' : 'Not on this seed: skip it'}">${isSkip ? '+' : '×'}</button>
  </div>`;
};
/** Up to two items that would each open this check on their own. */
function opensHtml(id: string) {
  const items = opensWith.get(id);
  if (!items?.length) return '';
  const names = items.slice(0, 2).map(i => `<b>${esc(itemLabel(i))}</b>`).join(' or ');
  return `<span class="opens"><span>Opens with:</span> ${names}${items.length > 2 ? ` <span>or ${items.length - 2} more</span>` : ''}</span>`;
}

/** Missing items that open the most checks still on the list, each on its own. */
function nextItemsHtml() {
  const next = logicOut?.next;
  if (!next) return '';
  const byId = new Map(checks.map(c => [c.id, c]));
  const rows = next.map(n => {
    const open = n.opens.map(id => byId.get(id)).filter((c): c is CheckEntry => !!c && counted(c) && !doneSet.has(c.id));
    return { id: n.id, open };
  }).filter(r => r.open.length).sort((a, b) => b.open.length - a.open.length).slice(0, 8);
  if (!rows.length) return '<div class="box"><h3>Best items to find next</h3><p>No single item opens more checks right now. You may need two items together, or to log more entrances.</p></div>';
  const li = rows.map(r => {
    const areas = [...new Set(r.open.map(regionLabel))];
    return `<li><b>${esc(itemLabel(r.id))}</b> opens ${r.open.length} ${r.open.length === 1 ? 'check' : 'checks'} <span class="fine">in ${esc(areas.slice(0, 3).join(', '))}${areas.length > 3 ? ` and ${areas.length - 3} more ${areas.length - 3 === 1 ? 'area' : 'areas'}` : ''}</span></li>`;
  }).join('');
  return `<div class="box"><h3>Best items to find next</h3><p>Each of these would put more checks in logic on its own.</p><ol class="next-items">${li}</ol></div>`;
}

const sortIn = <T,>(key: string, rows: T[], idOf: (x: T) => string) => {
  const order = saved.edits.order[key];
  if (!order) return rows;
  const at = new Map(order.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (at.get(idOf(a)) ?? 1e6) - (at.get(idOf(b)) ?? 1e6));
};
const collapsed = (id: string) => (saved.ui.collapsed ?? []).includes(id);

function renderChecks() {
  if (saved.ui.checksView === 'map') return renderMap();
  const pane = $('#pane');
  const hinted = areaHints();
  const had = $('#search', pane) as HTMLInputElement | null;
  const hadFocus = had && document.activeElement === had;
  const caret = had?.selectionStart ?? null;
  const scrollTop = $('#listScroll', pane)?.scrollTop ?? 0;

  const typeCounts = new Map<string, number>();
  for (const c of checks) {
    if (!shown(c)) continue;
    if (region && c.region !== region) continue;
    typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + (doneSet.has(c.id) ? 0 : 1));
  }
  const chips = [...typeCounts].sort((a, b) => b[1] - a[1]).map(([t, n]) =>
    `<button class="chip" data-type="${esc(t)}" aria-pressed="${typeFilter.has(t)}">${esc(TYPE_NAMES[t] ?? t)} ${n}</button>`).join('');

  const list = filtered();
  const byRegion = new Map<string, CheckEntry[]>();
  for (const c of list) { (byRegion.get(c.region) ?? byRegion.set(c.region, []).get(c.region)!).push(c); }
  const ordered = [...byRegion].sort((a, b) => regionRank(a[0], a[1][0].game, a[1][0].dungeon) - regionRank(b[0], b[1][0].game, b[1][0].dungeon));
  let body = '';
  for (const [id, rows] of ordered) {
    const isSkipped = seed.skippedRegions.includes(id);
    const inRegion = checks.filter(c => c.region === id && counted(c));
    const doneHere = inRegion.filter(c => doneSet.has(c.id)).length;
    const allDone = inRegion.length > 0 && doneHere === inRegion.length;
    const shut = collapsed(id);
    body += `<section><div class="section-head">
      <button class="caret keep" data-collapse="${esc(id)}" aria-expanded="${!shut}" aria-label="Show or hide this area"></button>
      <h2 data-edit="area:${esc(id)}">${esc(regionLabel(rows[0]))}</h2>${areaTags(hinted.get(id))}<span class="c" data-count="${esc(id)}">${doneHere}/${inRegion.length}</span>
      <span class="head-acts">
        <button class="linkish" data-mark-area="${esc(id)}">${allDone ? 'Clear this area' : 'Mark all done'}</button>
        <button class="linkish" data-skip-region="${esc(id)}">${isSkipped ? 'Bring this area back' : 'Skip this area'}</button>
        <button class="linkish edit-only keep" data-add-check="${esc(id)}">Add a check</button>
      </span></div>
      ${shut ? '' : `<div class="rows">${sortIn('c:' + id, rows, c => c.id).map(rowHtml).join('')}</div>`}</section>`;
  }

  const rolls = rolling().filter(unanswered);
  const banner = rolls.length ? `<div class="banner"><div><strong>This seed rolls some settings at random.</strong> Tell the checklist what came up so its list and logic match your seed. Opening your spoiler log fills this in.</div>
    <div class="btns"><button class="btn alt" data-goto="settings">Set what this seed rolled</button>${rolls.some(k => !ROLLED_CHOICES.includes(k)) ? '<button class="btn alt" data-roll-none>All stayed normal</button>' : ''}</div></div>` : '';

  const empty = !checks.length ? `<div class="empty"><h3>${computing ? 'Reading your settings' : 'No checks yet'}</h3></div>`
    : !body ? `<div class="empty"><h3>Nothing matches</h3>Clear the search or filters to see more checks.${saved.ui.hideDone ? ' Finished checks are hidden too.' : ''}</div>` : '';

  pane.innerHTML = `<div class="toolbar">
      <div class="toolrow">
        <button class="back" data-back>Areas</button>
        <input class="search" id="search" type="search" placeholder="Search checks" aria-label="Search checks" value="${esc(query)}">
        <div class="seg" role="group" aria-label="Game">
          ${(['all', 'oot', 'mm'] as const).map(g => `<button data-game="${g}" aria-pressed="${gameFilter === g}">${{ all: 'Both', oot: 'OoT', mm: 'MM' }[g]}</button>`).join('')}
        </div>
        <div class="seg"><button data-hidedone aria-pressed="${!!saved.ui.hideDone}">Hide done</button>${logicOn() ? `<button data-logiconly aria-pressed="${!!saved.ui.logicOnly}">In logic</button>` : ''}</div>
        ${viewSeg()}
        ${logicPill()}
      </div>
      <div class="chips" role="group" aria-label="Filter by type">${chips}</div>
    </div>
    <div class="scroll" id="listScroll">${banner}${logicBanner()}${body}${empty}</div>`;
  $('#listScroll').scrollTop = scrollTop;
  if (hadFocus) {
    const s = $('#search', pane) as HTMLInputElement;
    s.focus();
    if (caret !== null) s.setSelectionRange(caret, caret);
  }
}

/* ---------- Logic, hints and the map, shared by several pages ---------- */

/* The Hints tab is gone. Saved hints stay in the seed data, but no longer tag areas or checks. */
function areaHints() {
  return new Map<string, Set<'woth' | 'foolish'>>();
}
const areaTags = (set?: Set<string>) => !set ? '' : [...set].map(k => k === 'woth' ? '<span class="htag woth" data-text>Path</span>' : '<span class="htag foolish" data-text>Foolish</span>').join('');
function itemHintFor(_checkId: string): string | undefined {
  return undefined;
}
const viewSeg = () => `<div class="seg" role="group" aria-label="View">
  <button class="keep" data-checks-view="list" aria-pressed="${saved.ui.checksView !== 'map'}">List</button><button class="keep" data-checks-view="map" aria-pressed="${saved.ui.checksView === 'map'}">Map</button></div>`;
function logicPill() {
  if (!logicOn()) return '';
  if (logicError) return '<span class="pill" id="logicPill">Logic unavailable</span>';
  if (!logicOut || logicBusy) return '<span class="pill" id="logicPill">Working out logic</span>';
  return `<span class="pill" id="logicPill"><b>${totals().reach.toLocaleString()}</b> in logic now</span>`;
}
function logicBanner() {
  if (!logicReady() || !logicOut) return '';
  const notes: string[] = [];
  if (!logicOut.spawnsOpen) notes.push('Your spawn is shuffled. Log where you start on the Entrances tab and the rest opens up from there.');
  else if (logicOut.shuffled && logicOut.logged < logicOut.shuffled) notes.push(`Shuffled entrances count once you log them. ${logicOut.logged} of ${logicOut.shuffled} logged so far.`);
  if (!Object.keys(owned()).length && !catalog().some(i => i.start)) notes.push('Add the items you have on the Items tab, or log them at checks with the bag button, and more checks open up.');
  if (!notes.length) return '';
  return `<div class="banner logic-note"><div>${notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>
    <div class="btns">${!logicOut.spawnsOpen || logicOut.logged < logicOut.shuffled ? '<button class="btn alt" data-goto="entrances">Open Entrances</button>' : ''}<button class="btn alt" data-goto="items">Open Items</button></div></div>`;
}

/* ---------- Map view ---------- */

/** Where an area sits on the map. The player can move it in Edit mode; -1 takes it off the map. */
function mapSpot(id: string): [number, number] | undefined {
  const at = saved.edits.areas[id]?.map ?? MAP_SPOTS[id];
  return at && at[0] >= 0 ? [at[0], at[1]] : undefined;
}

function renderMap() {
  const pane = $('#pane');
  const scrollTop = $('#mapScroll', pane)?.scrollTop ?? 0;
  const stats = regionStats();
  const hinted = areaHints();
  const spot = mapSpot;
  const tile = (r: typeof stats[number], style = '') => {
    const pct = r.total ? r.done / r.total : 0;
    const state = r.skipped ? ' skipped' : r.total && r.done === r.total ? ' complete' : r.reach ? ' open' : '';
    return `<button class="tile ${r.game}${state}${saved.edits.areas[r.id]?.hidden ? ' ghost' : ''}" data-region="${esc(r.id)}" data-edit="area:${esc(r.id)}"${style ? ` style="${style}"` : ''}>
      <span class="tn">${esc(r.name)}</span>
      <span class="tc">${r.skipped ? '<span>Skipped</span>' : `${r.done}/${r.total}`}${r.reach && !r.skipped ? ` <i class="lg">${r.reach}</i>` : ''}</span>${areaTags(hinted.get(r.id))}
      <span class="bar"><i style="width:${pct * 100}%"></i></span></button>`;
  };
  const board = (title: string, cls: string, game: string) => {
    const over = stats.filter(r => r.game === game && !r.dungeon && !['NONE', 'POCKET'].includes(r.id));
    const placed = over.filter(r => spot(r.id));
    const loose = over.filter(r => !spot(r.id));
    const dungeons = stats.filter(r => r.game === game && r.dungeon);
    if (!over.length && !dungeons.length) return '';
    const width = (id: string) => saved.edits.areas[id]?.map ? 1 : MAP_SPOTS[id]?.[2] ?? 1;
    const cols = Math.max(4, ...placed.map(r => spot(r.id)![0] + width(r.id)));
    const grid = placed.map(r => {
      const [x, y] = spot(r.id)!;
      return tile(r, `grid-column:${x + 1} / span ${width(r.id)};grid-row:${y + 1}`);
    }).join('');
    return `<section class="board ${cls}"><div class="section-head"><h2>${title}</h2></div>
      ${placed.length ? `<div class="map-grid" style="--cols:${cols}">${grid}</div>` : ''}
      ${loose.length ? `<div class="group">Not placed on the map</div><div class="tile-row">${loose.map(r => tile(r)).join('')}</div>` : ''}
      ${dungeons.length ? `<div class="group">Dungeons</div><div class="tile-row">${dungeons.map(r => tile(r)).join('')}</div>` : ''}</section>`;
  };
  const other = stats.filter(r => ['NONE', 'POCKET'].includes(r.id) || (r.game !== 'oot' && r.game !== 'mm'));
  const t = totals();
  pane.innerHTML = `<div class="toolbar"><div class="toolrow">
      <button class="back" data-back>Areas</button>
      <h2 style="font-size:1.42rem">Map</h2>
      ${viewSeg()}
      <span class="pill"><b>${(t.all - t.done).toLocaleString()}</b> left</span>
      ${logicPill()}
    </div></div>
    <div class="scroll" id="mapScroll">${logicBanner()}
      <p class="fine map-help">Tap an area to see its checks. Gold areas have checks you can get now. In Edit mode, tap an area to move it on the map.</p>
      ${board('Hyrule', 'oot', 'oot')}${board('Termina', 'mm', 'mm')}
      ${other.length ? `<section class="board"><div class="section-head"><h2>Other</h2></div><div class="tile-row">${other.map(r => tile(r)).join('')}</div></section>` : ''}
      ${!stats.length ? `<div class="empty"><h3>${computing ? 'Reading your settings' : 'No checks yet'}</h3></div>` : ''}
    </div>`;
  $('#mapScroll').scrollTop = scrollTop;
}

/* ---------- Items page ----------
   The player's own item tracker. Logging an item at a check counts it here too. */

const ITEM_GROUP_ORDER = ['Equipment', 'Ammo and shields', 'Songs', 'Masks', 'Medallions, stones and remains', 'Trade and quest items', 'Bottles and their contents', 'Owls and maps', 'Skulltula tokens', 'Keys and dungeon items'];

function foundAt(itemId: string) {
  return Object.entries(seed.found).filter(([, v]) => v === itemId).map(([k]) => k);
}
const checkLabel = (id: string) => {
  const c = checks.find(x => x.id === id);
  return c ? `${regionLabel(c)}: ${c.name}` : id.replace(/^(OOT|MM) /, '');
};

/* Item pins. With Save pins on they live in saved.ui and come back on every visit; with it off they last until the page closes. */
let sessionPins: string[] = [];
const savingPins = () => saved.ui.savePins !== false;
const pinList = () => savingPins() ? (saved.ui.pins ??= []) : sessionPins;
function togglePin(id: string) {
  const list = pinList();
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1); else list.push(id);
  if (savingPins()) save();
  renderItems();
}
function setSavePins(on: boolean) {
  if (on === savingPins()) return;
  if (on) { saved.ui.pins = [...sessionPins]; saved.ui.savePins = true; }
  else { sessionPins = [...(saved.ui.pins ?? [])]; delete saved.ui.pins; saved.ui.savePins = false; }
  save();
}
function clearPins() {
  if (savingPins()) saved.ui.pins = []; else sessionPins = [];
  save();
}

function renderItems() {
  const pane = $('#pane');
  const had = $('#itemSearch', pane) as HTMLInputElement | null;
  const hadFocus = had && document.activeElement === had;
  const caret = had?.selectionStart ?? null;
  const scrollTop = $('#itemScroll', pane)?.scrollTop ?? 0;
  const have = owned();
  const words = itemQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = catalog().filter(i => {
    const hid = !!saved.edits.items[i.id]?.hidden;
    if (hid && !editMode) return false;
    if (itemGame !== 'all' && i.game !== itemGame && i.game !== 'shared') return false;
    if (saved.ui.haveOnly && !countOf(i, have)) return false;
    if (words.length && !words.every(w => `${itemLabel(i.id)} ${i.group}`.toLowerCase().includes(w))) return false;
    return true;
  });
  const sections: string[] = [];
  const pins = pinList();
  const pinned = list.filter(i => pins.includes(i.id)).sort((a, b) => pins.indexOf(a.id) - pins.indexOf(b.id));
  if (pinned.length) {
    const shut = collapsed('i:pinned');
    sections.push(`<section class="items pinned"><div class="section-head"><button class="caret keep" data-collapse="i:pinned" aria-expanded="${!shut}" aria-label="Show or hide pinned items"></button><h2>Pinned</h2></div>
      ${shut ? '' : `<div class="item-grid">${pinned.map(i => itemTile(i, have)).join('')}</div>`}</section>`);
  }
  for (const game of ['oot', 'mm', 'shared'] as const) {
    const mine = list.filter(i => i.game === game && !pins.includes(i.id));
    if (!mine.length) continue;
    const groups = new Map<string, CatalogItem[]>();
    for (const i of mine) (groups.get(i.group) ?? groups.set(i.group, []).get(i.group)!).push(i);
    const body = [...groups].sort((a, b) => ITEM_GROUP_ORDER.indexOf(a[0]) - ITEM_GROUP_ORDER.indexOf(b[0])).map(([g, rows]) => {
      const shut = collapsed(`i:${game}:${g}`);
      return `<div class="item-group"><div class="section-head"><button class="caret keep" data-collapse="i:${esc(game)}:${esc(g)}" aria-expanded="${!shut}" aria-label="Show or hide these items"></button><h3>${esc(g)}</h3></div>
        ${shut ? '' : `<div class="item-grid">${sortIn(`i:${game}:${g}`, rows, i => i.id).map(i => itemTile(i, have)).join('')}</div>`}</div>`;
    }).join('');
    sections.push(`<section class="items ${game}"><div class="section-head"><h2>${{ oot: 'Hyrule', mm: 'Termina', shared: 'Shared' }[game]}</h2></div>${body}</section>`);
  }
  const loggedCount = Object.keys(seed.found).length;
  const status = !logicOn() ? '' : logicError ? `<p>OoTMM couldn't work out logic for these settings: ${esc(logicError)}</p>`
    : !logicOut ? '<p>Working out logic for these settings. The first time takes a few seconds.</p>'
    : `<p><b>${totals().reach.toLocaleString()}</b> checks are in logic with what you have.${logicOut.shuffled ? ` Shuffled entrances count once you log them: ${logicOut.logged} of ${logicOut.shuffled} logged.` : ''}</p>${logicOut.pricesShuffled ? '<p class="fine">Prices are random on this seed, so shops are treated as their normal price.</p>' : ''}`;
  pane.innerHTML = `<div class="toolbar">
      <div class="toolrow">
        <input class="search" id="itemSearch" type="search" placeholder="Search items" aria-label="Search items" value="${esc(itemQuery)}">
        <div class="seg" role="group" aria-label="Game">
          ${(['all', 'oot', 'mm'] as const).map(g => `<button data-item-game="${g}" aria-pressed="${itemGame === g}">${{ all: 'Both', oot: 'OoT', mm: 'MM' }[g]}</button>`).join('')}
        </div>
        <div class="seg"><button data-haveonly aria-pressed="${!!saved.ui.haveOnly}">Have only</button></div>
      </div>
    </div>
    <div class="scroll" id="itemScroll"><div class="page wide">
      <div class="box">
        <div class="set" style="border:0;padding:0"><div class="lab"><b>Show what's in logic</b></div>
        <div class="ctl"><button class="switch" role="switch" aria-checked="${logicOn()}" aria-label="Show what's in logic" data-logic-toggle></button></div>
        <div class="desc">Uses OoTMM's own logic to mark the checks you can get with the items below. Tap an item to add one. Logging what you find at a check with the bag button counts it here too.${loggedCount ? ` You've logged ${loggedCount} at checks.` : ''}</div></div>
        ${status}
        ${Object.keys(seed.have).length || loggedCount ? '<div class="btns"><button class="btn danger" data-clear-items>Clear items on this seed</button></div>' : ''}
      </div>
      ${logicReady() ? nextItemsHtml() : ''}
      ${sections.join('') || `<div class="empty"><h3>${!logicOn() ? 'Turn on logic to load the item list' : !logicOut ? 'Loading items' : 'No items match'}</h3></div>`}
    </div></div>`;
  $('#itemScroll').scrollTop = scrollTop;
  if (hadFocus) {
    const i = $('#itemSearch', pane) as HTMLInputElement;
    i.focus();
    if (caret !== null) i.setSelectionRange(caret, caret);
  }
}

function itemTile(i: CatalogItem, have: Record<string, number>) {
  const n = countOf(i, have);
  const at = foundAt(i.id);
  const hid = !!saved.edits.items[i.id]?.hidden;
  const counter = i.max > 4
    ? `<input type="number" class="item-num" min="0" max="${i.max}" value="${n}" data-item-num="${esc(i.id)}" aria-label="How many ${esc(itemLabel(i.id))}">`
    : i.max > 1 ? `<span class="item-n">${n}/${i.max}</span>` : '';
  const pin = pinList().includes(i.id);
  return `<div class="item ${i.game}${n ? ' on' : ''}${hid ? ' ghost' : ''}${pin ? ' is-pinned' : ''}">
    <button class="item-pin keep" data-pin="${esc(i.id)}" aria-pressed="${pin}" aria-label="${pin ? 'Unpin' : 'Pin'} ${esc(itemLabel(i.id))}" title="${pin ? 'Unpin' : 'Pin to the top'}">${ICON.pin}</button>
    <button class="item-btn" data-item="${esc(i.id)}" data-edit="item:${esc(i.id)}" aria-pressed="${n > 0}">
      <span class="seal">${ICON.tick}</span>
      <span class="nm"><span class="t">${esc(itemLabel(i.id))}</span>${at.length ? `<span class="s"><span>at</span> ${esc(at.map(checkLabel).join(', '))}</span>` : i.start ? '<span class="s">Starting item</span>' : ''}</span>
    </button>${counter}${n > i.start && i.max <= 4 ? `<button class="item-minus" data-item-minus="${esc(i.id)}" aria-label="Take one away">−</button>` : ''}</div>`;
}

function setItemCount(id: string, n: number) {
  const i = catalogById().get(id);
  if (!i) return;
  const target = Math.max(0, Math.min(i.max, n));
  const fromChecks = foundAt(id).length;
  const delta = target - i.start - fromChecks;
  if (delta) seed.have[id] = delta; else delete seed.have[id];
}
function afterItemChange() {
  save();
  if (tab === 'items') renderItems(); else renderPane();
  scheduleLogic();
}

/* The bag button on a check: what was there. */
function openItemPicker(checkId: string) {
  pickingItemFor = checkId;
  itemPickQuery = '';
  const cur = seed.found[checkId];
  openSheet('What was here?', checkLabel(checkId), `
    <input class="search" id="itemPickSearch" type="search" placeholder="Search items" aria-label="Search items">
    <div class="pick-list" id="itemPickList"></div>
    <div class="free-row"><input type="text" id="itemPickFree" aria-label="Type what you found" placeholder="Not listed? Type what you found"${cur?.startsWith('text:') ? ` value="${esc(cur.slice(5))}"` : ''}><button class="btn alt" data-act="free">Save</button></div>
    <div class="btns">${cur ? '<button class="btn danger" data-act="clear">Clear this item</button>' : ''}</div>`, {
    clear() { snap(); delete seed.found[pickingItemFor!]; closeSheet(); afterItemChange(); },
    free() {
      const v = ($('#itemPickFree') as HTMLInputElement).value.trim();
      if (!v) return toast('Type what you found first.');
      logFound(pickingItemFor!, 'text:' + v);
    },
  }, () => { pickingItemFor = null; });
  renderItemPickList();
  if (!matchMedia('(max-width: 760px)').matches) $('#itemPickSearch').focus();
}
function renderItemPickList() {
  const box = document.getElementById('itemPickList');
  if (!box || !pickingItemFor) return;
  const c = checks.find(x => x.id === pickingItemFor);
  const words = itemPickQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const have = owned();
  const rows = catalog()
    .filter(i => !saved.edits.items[i.id]?.hidden)
    .filter(i => words.every(w => `${itemLabel(i.id)} ${i.group}`.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.game === c?.game) - Number(a.game === c?.game) || ITEM_GROUP_ORDER.indexOf(a.group) - ITEM_GROUP_ORDER.indexOf(b.group) || itemLabel(a.id).localeCompare(itemLabel(b.id)));
  const groups = new Map<string, CatalogItem[]>();
  for (const i of rows) {
    const g = `${{ oot: 'Hyrule', mm: 'Termina', shared: 'Shared' }[i.game]}: ${i.group}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(i);
  }
  box.innerHTML = [...groups].map(([g, list]) => `<div class="group">${esc(g)}</div>${list.map(i =>
    `<button class="pick ${i.game === 'shared' ? '' : i.game}" data-pick-item="${esc(i.id)}" aria-pressed="${seed.found[pickingItemFor!] === i.id}"><span class="t">${esc(itemLabel(i.id))}</span>${i.max > 1 ? `<span class="s">You have ${countOf(i, have)} of ${i.max}</span>` : ''}</button>`).join('')}`).join('')
    || `<div class="empty">${logicOut ? 'No items match. Type your own below.' : 'The item list loads with logic. Type what you found below.'}</div>`;
}
function logFound(checkId: string, itemId: string) {
  snap();
  seed.found[checkId] = itemId;
  doneSet.add(checkId);
  closeSheet();
  save();
  renderDial();
  renderRail();
  renderPane();
  scheduleLogic();
  toast(`Logged ${itemLabel(itemId)}. The check is marked done.`, true);
}

function editItem(id: string) {
  const i = catalogById().get(id);
  if (!i) return;
  const E = saved.edits;
  const o = E.items[id] ?? {};
  const peers = catalog().filter(x => x.game === i.game && x.group === i.group).map(x => x.id);
  openSheet('Edit this item', id, `
    ${field('edName', 'Name', itemLabel(id))}
    <div class="btns">
      <button class="btn" data-act="save">Save</button>
      <button class="btn alt" data-act="up">Move up</button><button class="btn alt" data-act="down">Move down</button>
      <button class="btn alt" data-act="hide">${o.hidden ? 'Show on every seed' : 'Hide on every seed'}</button>
      ${Object.keys(o).length ? '<button class="btn danger" data-act="reset">Put back original</button>' : ''}
    </div>`, {
    save() { snap(); const v = inputValue('edName'); E.items[id] = { ...E.items[id], name: v && v !== i.name ? v : undefined }; commit(); },
    up() { snap(); moveInList(`i:${i.game}:${i.group}`, peers, id, -1); commit(); },
    down() { snap(); moveInList(`i:${i.game}:${i.group}`, peers, id, 1); commit(); },
    hide() { snap(); E.items[id] = { ...o, hidden: !o.hidden }; commit(); },
    reset() { snap(); delete E.items[id]; commit(); },
  });
}

/* ---------- Hints page ----------
   The player types in what each gossip stone says. Nothing is read from a spoiler log. */

const stoneList = (): GossipEntry[] => lastResult?.gossips ?? [];
const stoneName = (g: GossipEntry) => saved.edits.stones[g.id]?.name ?? g.name;
const hintKindLabel: Record<string, string> = { woth: 'Path', foolish: 'Foolish', item: 'Item', other: 'Other' };

function editStone(id: string) {
  const g = stoneList().find(x => x.id === id);
  if (!g) return;
  const E = saved.edits;
  const o = E.stones[id] ?? {};
  const peers = stoneList().filter(x => x.region === g.region).map(x => x.id);
  openSheet('Edit this stone', id, `
    ${field('edName', 'Name', stoneName(g))}
    <div class="btns">
      <button class="btn" data-act="save">Save</button>
      <button class="btn alt" data-act="up">Move up</button><button class="btn alt" data-act="down">Move down</button>
      <button class="btn alt" data-act="hide">${o.hidden ? 'Show on every seed' : 'Hide on every seed'}</button>
      ${Object.keys(o).length ? '<button class="btn danger" data-act="reset">Put back original</button>' : ''}
    </div>`, {
    save() { snap(); const v = inputValue('edName'); E.stones[id] = { ...E.stones[id], name: v && v !== g.name ? v : undefined }; commit(); },
    up() { snap(); moveInList('h:' + g.region, peers, id, -1); commit(); },
    down() { snap(); moveInList('h:' + g.region, peers, id, 1); commit(); },
    hide() { snap(); E.stones[id] = { ...o, hidden: !o.hidden }; commit(); },
    reset() { snap(); delete E.stones[id]; commit(); },
  });
}

/* ---------- Entrances page ----------
   A log the player fills in. Nothing here knows a seed's real connections: the list
   comes from the settings, and every destination shown was typed in by the player. */

const NO_ENTRANCES: EntranceData = { list: [], dests: [], sets: [], rev: {} };
const entranceData = () => entr;
const destById = () => new Map(entranceData().dests.map(d => [d.id, d]));
const destText = (d?: { title: string; sub: string }) => !d ? '' : d.sub ? `${d.title}, ${d.sub}` : d.title;
const destLabel = (id: string, dests: ReturnType<typeof destById>) => id.startsWith('text:') ? id.slice(5) : destText(dests.get(id)) || "A place not on this seed's list";
const visibleEntrances = () => entranceData().list.filter(e => editMode || !entranceHidden(e));

function entranceStats() {
  const map = new Map<string, { id: string; name: string; game: string; dungeon: boolean; total: number; found: number }>();
  let found = 0;
  const data = entranceData();
  for (const e of data.list.filter(x => !entranceHidden(x))) {
    const gid = entrGroup(e);
    const r = map.get(gid) ?? { id: gid, name: entrPin(gid)?.name ?? areaName(e.group, e.groupName), game: e.game, dungeon: e.dungeon, total: 0, found: 0 };
    map.set(gid, r);
    r.total++;
    if (seed.entrances[e.id]) { r.found++; found++; }
  }
  const groups = [...map.values()].sort((a, b) => regionRank(a.id, a.game, a.dungeon) - regionRank(b.id, b.game, b.dungeon));
  return { groups, found, total: groups.reduce((n, g) => n + g.total, 0) };
}

function renderEntranceRail() {
  const { groups, found, total } = entranceStats();
  const row = (id: string, name: string, done: number, all: number, cur: boolean) =>
    `<button class="reg keep${all && done === all ? ' complete' : ''}" data-entr-region="${esc(id)}" aria-current="${cur}">
      <span class="n">${esc(name)}</span><span class="c">${done}/${all}</span>${id && !entrPin(id) ? pen('area:' + id) : ''}
      <span class="bar"><i style="width:${all ? (done / all) * 100 : 0}%"></i></span></button>`;
  const pinned = ENTR_PINNED.map(p => groups.find(g => g.id === p.id)).filter(g => !!g);
  groups.splice(0, groups.length, ...groups.filter(g => !entrPin(g.id)));
  const sets: [string, string, typeof groups][] = [
    ['Start and songs', '', pinned],
    ['Hyrule', 'oot', groups.filter(g => g.game === 'oot' && !g.dungeon && g.id !== 'NONE')],
    ['Hyrule dungeons', 'oot', groups.filter(g => g.game === 'oot' && g.dungeon)],
    ['Termina', 'mm', groups.filter(g => g.game === 'mm' && !g.dungeon && g.id !== 'NONE')],
    ['Termina dungeons', 'mm', groups.filter(g => g.game === 'mm' && g.dungeon)],
    ['Other', '', groups.filter(g => g.id === 'NONE')],
  ];
  let html = total ? row('', 'All entrances', found, total, entrRegion === null) : '';
  for (const [name, cls, rows] of sets) {
    if (!rows.length) continue;
    html += `<div class="group ${cls}">${name}</div>` + rows.map(r => row(r.id, r.name, r.found, r.total, entrRegion === r.id)).join('');
  }
  html += '<button class="linkish edit-only keep add-area" data-add-entrance="">Add an entrance</button>';
  const box = $('#regions');
  const top = box.scrollTop;
  box.innerHTML = html;
  box.scrollTop = top;
}

/* An area's rows under "Going in", "Coming out" and the rest. Each part says its direction once, so its rows drop the
   repeated "Entrance to" or "Exit of" and show just the place. */
/* "from Kokiri Forest" says nothing new under Kokiri Forest's own heading. */
const plainSub = (e: EntranceEntry) => {
  const here = areaName(e.group, e.groupName).toLowerCase();
  return e.sub.replace(/^(from|normally leads to) /, '').toLowerCase() === here ? { ...e, sub: '' } : e;
};

function dirGroups(rows: EntranceEntry[], dests: ReturnType<typeof destById>) {
  return ENTR_DIRS.map(d => {
    const part = rows.filter(e => (e.dir ?? 'other') === d.dir);
    if (!part.length) return '';
    return `<div class="dir-part dir-${d.dir}">
      <div class="dir-head"><span class="dir-arrow" aria-hidden="true">${d.arrow}</span><span class="dir-name">${d.name}</span>${d.hint ? `<span class="dir-hint">${d.hint}</span>` : ''}</div>
      <div class="rows">${part.map(e => entranceRow(plainSub(e), dests, d.cut ?? undefined)).join('')}</div></div>`;
  }).join('');
}

function entranceRow(e: EntranceEntry, dests: ReturnType<typeof destById>, cut?: RegExp) {
  const to = seed.entrances[e.id];
  const shown = cut ? e.title.replace(cut, '') : e.title;
  const dest = to ? destLabel(to, dests) : '';
  const hid = !!saved.edits.entrances[e.id]?.hidden;
  return `<div class="row entr ${e.game}${to ? ' done' : ''}${hid ? ' ghost' : ''}">
    <button class="entr-btn" data-entr="${esc(e.id)}" data-edit="entr:${esc(e.id)}" aria-label="${esc(e.title)}: ${to ? `leads to ${esc(dest)}` : 'not logged yet'}">
      <span class="seal">${ICON.tick}</span>
      <span class="nm"><span class="t">${esc(shown)}</span>${e.sub ? `<span class="s">${esc(e.sub)}</span>` : ''}
        ${to ? `<span class="leads"${to.startsWith('text:') ? '' : ` data-edit="dest:${esc(to)}"`}>Leads to ${esc(dest)}</span>` : ''}${noteHtml(e.id)}</span>
      ${hid ? '<span class="tag" data-text>Hidden</span>' : to ? '' : '<span class="ty" data-text>Add</span>'}
    </button></div>`;
}

function renderEntrances() {
  const pane = $('#pane');
  const data = entranceData();
  if (!data.list.length) {
    pane.innerHTML = `<div class="toolbar"><div class="toolrow"><h2 style="font-size:1.42rem">Entrances</h2><button class="btn alt edit-only keep" data-add-entrance="">Add an entrance</button></div></div>
      <div class="scroll"><div class="empty">${computing ? '<h3>Reading your settings</h3>' : data.error
        ? `<h3>OoTMM can't build these entrance settings</h3>${esc(data.error)}<div class="btns" style="margin-top:12px"><button class="btn" data-open-entr-settings>Open entrance settings</button></div>`
        : `<h3>No entrances are shuffled on this seed</h3>Turn on an entrance shuffle in Settings and those entrances show up here, ready for you to log as you find them.
        <div class="btns" style="margin-top:12px"><button class="btn" data-open-entr-settings>Open entrance settings</button></div>`}</div></div>`;
    return;
  }
  const had = $('#entrSearch', pane) as HTMLInputElement | null;
  const hadFocus = had && document.activeElement === had;
  const caret = had?.selectionStart ?? null;
  const scrollTop = $('#entrScroll', pane)?.scrollTop ?? 0;

  const dests = destById();
  const words = entrQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const kinds = new Map<string, number>();
  const vis = visibleEntrances();
  for (const e of vis) if (words.length || !entrRegion || entrGroup(e) === entrRegion) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + (seed.entrances[e.id] ? 0 : 1));
  const chips = [...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    `<button class="chip" data-kind="${esc(k)}" aria-pressed="${entrKinds.has(k)}">${esc(k)} ${n}</button>`).join('');

  const list = vis.filter(e => {
    if (entrGame !== 'all' && e.game !== entrGame) return false;
    if (entrDir !== 'all' && e.dir !== entrDir) return false;
    if (entrKinds.size && !entrKinds.has(e.kind)) return false;
    if (saved.ui.hideFound && seed.entrances[e.id]) return false;
    if (entrRegion && !words.length && entrGroup(e) !== entrRegion) return false;
    if (words.length) {
      const to = seed.entrances[e.id];
      const hay = `${e.title} ${e.sub} ${areaName(e.group, e.groupName)} ${to ? destLabel(to, dests) : ''} ${seed.notes[e.id] ?? ''}`.toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
  const byGroup = new Map<string, EntranceEntry[]>();
  for (const e of list) { const g = entrGroup(e); (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(e); }
  const rank = (e: EntranceEntry) => { const i = ENTR_PINNED.findIndex(p => p.id === entrGroup(e)); return i >= 0 ? i - 100 : regionRank(e.group, e.game, e.dungeon); };
  const body = [...byGroup.values()].sort((a, b) => rank(a[0]) - rank(b[0])).map(rows => {
    const gid = entrGroup(rows[0]);
    const pin = entrPin(gid);
    const all = vis.filter(e => entrGroup(e) === gid && !entranceHidden(e));
    const shut = collapsed('e:' + gid);
    if (pin) return `<section class="pinned-sec"><div class="section-head">
      <button class="caret keep" data-collapse="e:${esc(gid)}" aria-expanded="${!shut}" aria-label="Show or hide this section"></button>
      <h2>${esc(pin.name)}</h2><span class="c">${all.filter(e => seed.entrances[e.id]).length}/${all.length}</span></div>
      ${shut ? '' : `<div class="rows">${[...rows].sort((a, b) => pin.order(a) - pin.order(b)).map(e => entranceRow(e, dests)).join('')}</div>`}</section>`;
    return `<section><div class="section-head">
      <button class="caret keep" data-collapse="e:${esc(gid)}" aria-expanded="${!shut}" aria-label="Show or hide this area"></button>
      <h2 data-edit="area:${esc(gid)}">${esc(areaName(gid, rows[0].groupName))}</h2><span class="c">${all.filter(e => seed.entrances[e.id]).length}/${all.length}</span>
      <span class="head-acts"><button class="linkish edit-only keep" data-add-entrance="${esc(gid)}">Add an entrance</button></span></div>
      ${shut ? '' : dirGroups(sortIn('e:' + gid, rows, e => e.id), dests)}</section>`;
  }).join('');

  const { found, total } = entranceStats();
  pane.innerHTML = `<div class="toolbar">
      <div class="toolrow">
        <button class="back" data-back>Areas</button>
        <input class="search" id="entrSearch" type="search" placeholder="Search entrances or where they lead" aria-label="Search entrances" value="${esc(entrQuery)}">
        <div class="seg" role="group" aria-label="Game">
          ${(['all', 'oot', 'mm'] as const).map(g => `<button data-entr-game="${g}" aria-pressed="${entrGame === g}">${{ all: 'Both', oot: 'OoT', mm: 'MM' }[g]}</button>`).join('')}
        </div>
        <div class="seg" role="group" aria-label="Direction">
          ${(['all', 'in', 'out'] as const).map(g => `<button data-entr-dir="${g}" aria-pressed="${entrDir === g}">${{ all: 'All', in: '↘ Going in', out: '↖ Coming out' }[g]}</button>`).join('')}
        </div>
        <div class="seg"><button data-hidefound aria-pressed="${!!saved.ui.hideFound}">Hide logged</button></div>
        <span class="pill"><b>${found}</b> of ${total} logged</span>
      </div>
      <div class="chips" role="group" aria-label="Filter by kind of entrance">${chips}</div>
    </div>
    <div class="scroll" id="entrScroll">${body || `<div class="empty"><h3>Nothing matches</h3>Clear the search or filters to see more entrances.${saved.ui.hideFound ? ' Logged entrances are hidden too.' : ''}</div>`}</div>`;
  $('#entrScroll').scrollTop = scrollTop;
  if (hadFocus) {
    const i = $('#entrSearch', pane) as HTMLInputElement;
    i.focus();
    if (caret !== null) i.setSelectionRange(caret, caret);
  }
}

/* The way back is only filled in when OoTMM keeps both directions together. */
function clearEntrance(src: string) {
  const dst = seed.entrances[src];
  if (!dst) return;
  delete seed.entrances[src];
  const { rev } = entranceData();
  const back = rev[dst], home = rev[src];
  if (back && home && seed.entrances[back] === home) delete seed.entrances[back];
}

function setEntrance(src: string, dst: string) {
  snap();
  if (dst.startsWith('text:')) { clearEntrance(src); seed.entrances[src] = dst; return; }
  const data = entranceData();
  const reusable = new Set(data.list.filter(e => e.reusable).map(e => e.id));
  const releaseDest = (id: string) => {
    for (const [k, v] of Object.entries(seed.entrances)) if (v === id && !reusable.has(k)) clearEntrance(k);
  };
  clearEntrance(src);
  if (!reusable.has(src)) releaseDest(dst);
  seed.entrances[src] = dst;
  const back = data.rev[dst], home = data.rev[src];
  if (back && home && data.list.some(e => e.id === back)) {
    clearEntrance(back);
    releaseDest(home);
    seed.entrances[back] = home;
    toast('Logged. The way back is filled in too.', true);
  }
}

function afterEntranceChange() {
  save();
  scheduleLogic();
  renderEntranceRail();
  renderEntrances();
  renderTabs();
}

function pickDest(id: string) {
  setEntrance(picking!, id);
  closeSheet();
  afterEntranceChange();
}

function renderPickList() {
  const box = document.getElementById('pickList');
  if (!box || !picking) return;
  const data = entranceData();
  const entry = data.list.find(e => e.id === picking)!;
  const reusable = new Set(data.list.filter(e => e.reusable).map(e => e.id));
  const taken = new Set(Object.entries(seed.entrances).filter(([k]) => k !== picking && !reusable.has(k)).map(([, v]) => v));
  const words = pickQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const base = pickAll ? data.dests : data.sets[entry.allowed].map(i => data.dests[i]);
  const options = base
    .filter(d => words.every(w => `${d.title} ${d.sub} ${d.groupName}`.toLowerCase().includes(w)))
    .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.title.localeCompare(b.title) || a.sub.localeCompare(b.sub));
  const item = (d: typeof options[number]) => `<button class="pick ${d.game}" data-pick="${esc(d.id)}" aria-pressed="${seed.entrances[picking!] === d.id}">
    <span class="t">${esc(d.title)}</span>${d.sub ? `<span class="s">${esc(d.sub)}</span>` : ''}</button>`;
  const groupUp = (rows: typeof options) => {
    const out = new Map<string, typeof options>();
    for (const d of rows) (out.get(d.groupName) ?? out.set(d.groupName, []).get(d.groupName)!).push(d);
    return [...out].map(([g, r]) => `<div class="group">${esc(g)}</div>${r.map(item).join('')}`).join('');
  };
  const open = options.filter(d => !taken.has(d.id) || entry.reusable);
  const used = options.filter(d => taken.has(d.id) && !entry.reusable);
  box.innerHTML = (groupUp(open) || '<div class="empty">No open places match. Try another word, or type your own below.</div>')
    + (used.length ? `<div class="group used">Already logged elsewhere. Picking one moves it here.</div>${used.map(item).join('')}` : '');
}

function openPicker(id: string) {
  picking = id;
  pickQuery = '';
  pickAll = false;
  const e = entranceData().list.find(x => x.id === id)!;
  const cur = seed.entrances[id];
  openSheet('Where did this lead?', `${e.title}${e.sub ? `, ${e.sub}` : ''}`, `
    <input class="search" id="pickSearch" type="search" placeholder="Search places" aria-label="Search places">
    <div class="pick-list" id="pickList"></div>
    <div class="free-row"><input type="text" id="pickFree" aria-label="Type your own place" placeholder="Not listed? Type the place"${cur?.startsWith('text:') ? ` value="${esc(cur.slice(5))}"` : ''}><button class="btn alt" data-act="free">Save</button></div>
    <div class="btns"><button class="btn alt" data-act="all">Show every place</button>${cur ? '<button class="btn danger" data-act="clear">Clear this entrance</button>' : ''}</div>`, {
    all() { pickAll = !pickAll; renderPickList(); },
    clear() { snap(); clearEntrance(picking!); closeSheet(); afterEntranceChange(); },
    free() {
      const v = ($('#pickFree') as HTMLInputElement).value.trim();
      if (!v) return toast('Type a place first.');
      setEntrance(picking!, 'text:' + v);
      closeSheet();
      afterEntranceChange();
    },
  }, () => { picking = null; });
  renderPickList();
  if (!matchMedia('(max-width: 760px)').matches) $('#pickSearch').focus();
}

/* ---------- Settings page ---------- */

const descText = (d?: string) => (d ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');

function controlHtml(s: any) {
  const v = S[s.key];
  if (s.type === 'boolean') return `<button class="switch" role="switch" aria-checked="${!!v}" aria-label="${esc(s.name)}" data-bool="${esc(s.key)}"></button>`;
  if (s.type === 'number') {
    const min = typeof s.min === 'function' ? s.min(S) : s.min, max = typeof s.max === 'function' ? s.max(S) : s.max;
    return `<input type="number" id="set-${esc(s.key)}" aria-label="${esc(s.name)}" data-num="${esc(s.key)}" value="${esc(v)}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}>`;
  }
  if (s.type === 'enum') {
    const vals = s.values.filter((x: any) => !x.cond || x.cond(S));
    return `<select id="set-${esc(s.key)}" aria-label="${esc(s.name)}" data-enum="${esc(s.key)}">${vals.map((x: any) => `<option value="${esc(x.value)}"${x.value === v ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
  }
  const mode = v?.type === 'random-mixed' ? 'random' : v?.type ?? 'none';
  const seg = (['none', 'all', 'random', 'specific'] as const).map(m => `<button data-setmode="${esc(s.key)}" data-mode="${m}" aria-pressed="${mode === m}">${{ none: 'None', all: 'All', random: 'Random', specific: 'Choose' }[m]}</button>`).join('');
  const picks = mode === 'specific' ? `<div class="setvals">${s.values.map((x: any) => `<button class="chip" data-setval="${esc(s.key)}" data-val="${esc(x.value)}" aria-pressed="${(v.values ?? []).includes(x.value)}">${esc(x.name)}</button>`).join('')}</div>` : '';
  return `<div class="seg" role="group" aria-label="${esc(s.name)}">${seg}</div>${picks}`;
}

function settingHtml(s: any) {
  const changes = AFFECTS.has(s.key);
  return `<div class="set${s.type === 'set' ? ' wide' : ''}">
    <div class="lab"><b>${esc(s.name)}</b>${changes && !saved.ui.changesOnly ? '<span class="why">changes checks</span>' : (s.category === 'entrances' || AFFECTS_ENTRANCES.has(s.key)) && !saved.ui.changesOnly ? '<span class="why">changes entrances</span>' : ''}</div>
    <div class="ctl">${controlHtml(s)}</div>
    ${s.description ? `<div class="desc">${esc(descText(s.description))}</div>` : ''}</div>`;
}

function rolledHtml() {
  return rolling().map(key => {
    const def = (SETTINGS as readonly any[]).find(s => s.key === key);
    const v = S[key];
    if (ROLLED_CHOICES.includes(key)) {
      const chips = def.values.filter((x: any) => x.value !== 'random').map((x: any) =>
        `<button class="chip" data-rolled="${esc(key)}" data-val="${esc(x.value)}" aria-pressed="${seed.rolled[key]?.[0] === x.value}">${esc(x.name)}</button>`).join('');
      const note = seed.rolled[key]?.length ? '' : ' Until you set this, logic only counts checks you can reach whichever one it was.';
      return `<div class="box"><h3>What this seed rolled: ${esc(def.name)}</h3><p>Pick the one this seed came up with.${note}</p><div class="setvals">${chips}</div></div>`;
    }
    const fixedOn: string[] = v.type === 'random-mixed' ? v.set ?? [] : [];
    const fixedOff: string[] = v.type === 'random-mixed' ? v.unset ?? [] : [];
    const chips = def.values.filter((x: any) => !fixedOn.includes(x.value) && !fixedOff.includes(x.value)).map((x: any) =>
      `<button class="chip" data-rolled="${esc(key)}" data-val="${esc(x.value)}" aria-pressed="${(seed.rolled[key] ?? []).includes(x.value)}">${esc(x.name)}</button>`).join('');
    const note = seed.rolled[key] === undefined && UNKNOWN_MEANS_ALL.has(key) ? ' Until you set this, logic counts every one as on.' : '';
    return `<div class="box"><h3>What this seed rolled: ${esc(def.name)}</h3><p>Turn on each one that came up on this seed. The rest are off.${note}</p><div class="setvals">${chips}</div></div>`;
  }).join('');
}

/** The dungeons OoTMM could pre-complete on these settings, named after their area in the list. */
function preCompletable(): { key: string; name: string }[] {
  if (!S.preCompletedDungeons || !lastResult) return [];
  const regions = new Map<string, Map<string, number>>();
  for (const c of lastResult.checks) {
    if (!c.dungeonKey) continue;
    const m = regions.get(c.dungeonKey) ?? regions.set(c.dungeonKey, new Map()).get(c.dungeonKey)!;
    m.set(c.region, (m.get(c.region) ?? 0) + 1);
  }
  return (checklistNormalDungeons(S) as string[]).filter(k => regions.has(k)).map(key => {
    const [region] = [...regions.get(key)!].sort((a, b) => b[1] - a[1])[0];
    const c = lastResult!.checks.find(x => x.region === region)!;
    return { key, name: regionLabel(c) };
  });
}

function preCompletedHtml() {
  const list = preCompletable();
  if (!list.length) return '';
  const mine = seed.preCompleted ?? [];
  const chips = list.map(d => `<button class="chip" data-precomplete="${esc(d.key)}" aria-pressed="${mine.includes(d.key)}">${esc(d.name)}</button>`).join('');
  return `<div class="box"><h3>Pre-completed dungeons</h3><p>Turn on each dungeon this seed started as beaten. Logic then counts what that gives you, like the region staying cleared, and the dungeon's area is skipped. Add the rewards you started with, like stones or medallions, on the Items tab. Opening your spoiler log fills this in.</p><div class="setvals">${chips}</div></div>`;
}

/*
 * The rest of OoTMM's settings, which live outside its main settings list: tricks, glitches,
 * special conditions, starting items and junk locations. All of them come from OoTMM's own
 * tables, and all of them change logic, so they show under "Changes your lists" too.
 */
function extraSettingsHtml(q: string) {
  const hit = (text: string) => !q || text.toLowerCase().includes(q);
  const section = (id: string, title: string, rows: string[], intro = '') => !rows.length ? '' : `<details class="cat" data-cat="${id}"${openCats.has(id) || q ? ' open' : ''}>
    <summary class="keep"><span class="sum-t">${esc(title)}</span> <span>${rows.length}</span></summary>${intro}${rows.join('')}</details>`;
  const games = S.games === 'oot' ? ['oot'] : S.games === 'mm' ? ['mm'] : ['oot', 'mm'];
  const trickRows = (glitch: boolean) => Object.entries(TRICKS as Record<string, any>)
    .filter(([k, x]) => !!x.glitch === glitch && games.includes(x.game) && hit(`${x.name} ${k} ${x.tooltip ?? ''}`))
    .map(([k, x]) => `<div class="set"><div class="lab"><b>${esc(x.name)}</b></div>
      <div class="ctl"><button class="switch" role="switch" aria-checked="${S.tricks.includes(k)}" aria-label="${esc(x.name)}" data-trick="${esc(k)}"></button></div>
      ${x.tooltip ? `<div class="desc">${esc(x.tooltip)}</div>` : ''}</div>`);

  const condRows = Object.entries(SPECIAL_CONDS as Record<string, any>).filter(([, c]) => c.cond(S) && hit(`${c.name} special conditions`)).map(([key, c]) => {
    const cur = S.specialConds[key];
    const fields = Object.entries(SPECIAL_CONDS_FIELDS as Record<string, any>).filter(([, f]) => !f.cond || f.cond(S));
    const max = condMax(key);
    const chips = fields.map(([k, f]) => `<button class="chip" data-cond="${esc(key)}" data-val="${esc(k)}" aria-pressed="${!!cur[k]}">${esc(f.name)}</button>`).join('');
    return `<div class="set wide"><div class="lab"><b>${esc(c.name)}</b></div>
      <div class="ctl"><input type="number" aria-label="${esc(c.name)} amount" data-cond-count="${esc(key)}" value="${esc(cur.count)}" min="0" max="${max}"></div>
      <div class="desc">How many of the items picked below are needed. Out of ${max}.</div>
      <div class="setvals">${chips}</div></div>`;
  });

  const nameOf = (id: string) => catalogById().get(id)?.name ?? (() => { try { return itemName(id); } catch { return id; } })();
  const startRows = Object.entries(S.startingItems as Record<string, number>).filter(([id]) => hit(`${nameOf(id)} starting items`)).sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))
    .map(([id, n]) => `<div class="set"><div class="lab"><b>${esc(nameOf(id))}</b></div>
      <div class="ctl"><input type="number" aria-label="${esc(nameOf(id))} at start" data-start-num="${esc(id)}" value="${esc(n)}" min="0"${catalogById().get(id) ? ` max="${catalogById().get(id)!.max}"` : ''}></div></div>`);
  const addable = catalog().filter(i => !S.startingItems[i.id]).sort((a, b) => a.name.localeCompare(b.name));
  const startAdd = !hit('starting items') && !startRows.length ? '' : `<div class="set"><div class="lab"><b>Add a starting item</b></div>
    <div class="ctl"><select aria-label="Add a starting item" data-start-add><option value="">${logicOut ? 'Pick an item' : 'Items show once logic has run'}</option>${addable.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></div>
    <div class="desc">Items Link starts the seed with. Logic counts them as yours.</div></div>`;

  const checkName = (id: string) => { const c = lastResult?.checks.find(x => x.id === id); return c ? `${c.regionName}: ${c.name}` : id.replace(/^(OOT|MM) /, ''); };
  const junkRows = (S.junkLocations as string[]).filter(id => hit(`${checkName(id)} junk locations`)).map(id => `<div class="set"><div class="lab"><b>${esc(checkName(id))}</b></div>
    <div class="ctl"><button class="btn alt" data-junk-del="${esc(id)}">Remove</button></div></div>`);
  const junkAdd = !hit('junk locations') && !junkRows.length ? '' : `<div class="set wide"><div class="lab"><b>Add a junk location</b></div>
    <div class="ctl"><input type="text" list="junkChecks" id="junkAdd" aria-label="Check to mark as junk" placeholder="Start typing a check"><button class="btn alt" data-junk-add>Add</button></div>
    <div class="desc">Checks that always hold junk on this seed.</div>
    <datalist id="junkChecks">${(lastResult?.checks ?? []).filter(c => !c.fixed && !S.junkLocations.includes(c.id)).map(c => `<option value="${esc(`${c.regionName}: ${c.name}`)}"></option>`).join('')}</datalist></div>`;

  return section('x.tricks', 'Tricks', trickRows(false))
    + section('x.glitches', 'Glitches', trickRows(true))
    + section('x.specialConds', 'Special conditions', condRows)
    + section('x.startingItems', 'Starting items', [...(startAdd ? [startAdd] : []), ...startRows])
    + section('x.junk', 'Junk locations', [...(junkAdd ? [junkAdd] : []), ...junkRows]);
}

/** The most a special condition can ask for, worked out the way OoTMM's generator page does (shared masks count once). */
function condMax(key: string, s: any = S) {
  const cur = s.specialConds[key];
  let max = Object.entries(SPECIAL_CONDS_FIELDS as Record<string, any>).filter(([k]) => cur[k]).reduce((n, [, f]) => n + (typeof f.max === 'function' ? f.max(s) : f.max), 0);
  if (cur.masksOot && cur.masksRegular) max -= Object.keys(s).filter(k => k.includes('sharedMask') && s[k]).length;
  return Math.max(0, max);
}

function setSettingsRaw(change: (s: any) => void) {
  const next = JSON.parse(JSON.stringify(S));
  change(next);
  S = makeSettings(next);
  seed.settings = exportSettings(S);
  save();
  renderSettings();
  recompute();
}

const settingsNav = () => `<div class="seg subnav" role="group" aria-label="Settings sections">
  ${([['game', 'Randomizer'], ['look', 'Appearance'], ['edits', 'Your edits']] as const).map(([k, l]) => `<button class="keep" data-setview="${k}" aria-pressed="${settingsView === k}">${l}</button>`).join('')}</div>`;

function renderSettings() {
  if (settingsView === 'look') return renderLook();
  if (settingsView === 'edits') return renderYourEdits();
  const pane = $('#pane');
  const q = settingsQuery.trim().toLowerCase();
  const list = (SETTINGS as readonly any[]).filter(s => {
    if (s.cond && !s.cond(S)) return false;
    if (q) return `${s.name} ${s.key} ${descText(s.description)}`.toLowerCase().includes(q);
    return !saved.ui.changesOnly || AFFECTS.has(s.key) || AFFECTS_ENTRANCES.has(s.key) || s.category === 'entrances';
  });
  const cats = new Map<string, any[]>();
  for (const s of list) (cats.get(s.category) ?? cats.set(s.category, []).get(s.category)!).push(s);
  const body = [...cats].map(([c, rows]) => `<details class="cat" data-cat="${esc(c)}"${openCats.has(c) || q ? ' open' : ''}>
    <summary class="keep"><span class="sum-t">${esc(catName(c))}</span> <span>${rows.length}</span></summary>${rows.map(settingHtml).join('')}</details>`).join('');
  const scrollTop = $('#setScroll')?.scrollTop ?? 0;
  const searchFocus = document.activeElement?.id === 'setSearch';
  pane.innerHTML = `<div class="toolbar">${settingsNav()}<div class="toolrow">
      <input class="search" id="setSearch" type="search" placeholder="Search all ${SETTINGS.length} settings" aria-label="Search settings" value="${esc(settingsQuery)}">
      <div class="seg" role="group" aria-label="Which settings to show">
        <button data-changes="1" aria-pressed="${!!saved.ui.changesOnly}">Changes your lists</button>
        <button data-changes="0" aria-pressed="${!saved.ui.changesOnly}">All settings</button>
      </div>
      <span class="pill" id="countPill"></span>
    </div></div>
    <div class="scroll" id="setScroll"><div class="page">
      <details class="box"${exportSettings(makeSettings({})) === seed.settings ? ' open' : ''}>
        <summary style="cursor:pointer"><h3 style="display:inline">Load a seed's settings</h3></summary>
        <p>Paste the settings string from the OoTMM generator, or open your spoiler log. Only the settings at the top of the log are read, so nothing gets spoiled.</p>
        <textarea id="importText" aria-label="Settings string or spoiler log" placeholder="Paste a settings string starting with v2."></textarea>
        <div class="btns">
          <button class="btn" data-import>Load settings</button>
          <label class="btn alt file">Open spoiler log<input id="importFile" type="file" accept=".txt,.log,text/plain"></label>
          <button class="btn alt" data-copy-settings>Copy settings string</button>
          <button class="btn alt" data-defaults>Back to defaults</button>
        </div>
      </details>
      ${rolledHtml()}
      ${preCompletedHtml()}
      <div class="box">
        <div class="set" style="border:0;padding:0"><div class="lab"><b>Show vanilla spots too</b></div>
        <div class="ctl"><button class="switch" role="switch" aria-checked="${!!saved.ui.showLocked}" aria-label="Show vanilla spots too" data-showlocked></button></div>
        <div class="desc">Lists places your settings leave unshuffled, tagged Vanilla. They never count toward your total.</div></div>
      </div>
      <div>${body + extraSettingsHtml(q) || '<div class="empty"><h3>No settings match</h3>Try another word, or switch to All settings.</div>'}</div>
    </div></div>`;
  $('#setScroll').scrollTop = scrollTop;
  if (searchFocus) { const i = $('#setSearch') as HTMLInputElement; i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  renderCount();
}

function renderLook() {
  const cur = skinById(saved.ui.skin);
  const cards = SKINS.map(s => `<button class="skin-card" data-skin-set="${s.id}" aria-pressed="${s.id === cur.id}" style="background:${s.tokens.bg};color:${s.tokens.ink};border-color:${s.id === cur.id ? s.tokens.gold : s.tokens.faint}">
    <span class="skin-swatches">${['gold', 'oot', 'mm', 'heart'].map(t => `<i style="background:${s.tokens[t]}"></i>`).join('')}</span>
    <strong style="font-family:${esc(s.tokens.display)}">${esc(s.name)}</strong><small style="color:${s.tokens.muted}">${esc(s.blurb)}</small></button>`).join('');
  const seg = (attr: string, value: string, opts: [string, string][]) => opts.map(([v, l]) => `<button data-${attr}="${v}" aria-pressed="${value === v}">${l}</button>`).join('');
  $('#pane').innerHTML = `<div class="toolbar">${settingsNav()}</div>
    <div class="scroll"><div class="page">
      <div class="box"><h3>Theme</h3><div class="skin-grid">${cards}</div></div>
      <div class="box"><h3>Check names</h3>${namesSliderHtml()}<div class="btns"><button class="btn alt keep" data-setview="edits">Rename checks</button></div></div>
      <div class="box"><h3>Progress display</h3>
        <div class="seg" role="group" aria-label="Progress display">${seg('meter-set', saved.ui.meter ?? '', [['', 'Theme default'], ['hearts', 'Heart containers'], ['clock', 'Three-day clock'], ['none', 'Numbers only']])}</div></div>
      <div class="box"><h3>Text size</h3>
        <div class="seg" role="group" aria-label="Text size">${seg('scale-set', String(saved.ui.scale ?? 1), [['0.9', 'Small'], ['1', 'Normal'], ['1.12', 'Large'], ['1.25', 'Extra large']])}</div></div>
      <div class="box"><h3>List spacing</h3>
        <div class="seg" role="group" aria-label="List spacing">${seg('compact-set', saved.ui.compact ? '1' : '0', [['0', 'Comfortable'], ['1', 'Compact']])}</div></div>
      <div class="box"><h3>Item pins</h3>
        <div class="set" style="border:0;padding:0"><div class="lab"><b>Save pins</b></div>
        <div class="ctl"><button class="switch keep" role="switch" aria-checked="${savingPins()}" aria-label="Save pins" data-save-pins></button></div>
        <div class="desc">Keeps the items you pin on the Items tab between visits. Turn it off and pins last until you close the app.</div></div>
        <div class="btns"><button class="btn alt keep" data-clear-pins${pinList().length ? '' : ' disabled'}>Unpin all</button></div></div>
      <div class="box"><h3>Colors and fonts</h3><p>Change any color or the heading font on the current theme.</p>
        <div class="btns"><button class="btn keep" data-open-colors>Edit colors and fonts</button></div></div>
      <div class="box"><h3>OoTMM Checklist</h3><p>In Edit mode, tap the name above to rename the app. It shows in the window title.</p>
        <p class="fine">Built from OoTMM ${esc(__OOTMM__)}. Fan-made tool, not affiliated with Nintendo.</p></div>
    </div></div>`;
}

function renderCount() {
  const el = document.getElementById('countPill');
  if (el) el.innerHTML = computing ? 'Updating' : `<b>${totals().all.toLocaleString()}</b> checks`;
}

function setSetting(key: string, value: unknown) {
  S = makeSettings({ ...S, [key]: value } as any);
  seed.settings = exportSettings(S);
  save();
  renderSettings();
  recompute();
}

/* ---------- Spoiler log and settings string import ---------- */

function applyImport(text: string) {
  const t = text.trim();
  if (!t) return toast('Paste a settings string or open a spoiler log first.');
  try {
    const parsed = t.includes('SettingsString:') ? parseSpoilerHeader(t) : { settings: t, rolled: {}, preCompleted: [] as string[] };
    if (!parsed.settings) throw new Error('no settings');
    S = importSettings(parsed.settings);
    seed.settings = exportSettings(S);
    seed.rolled = { ...seed.rolled, ...parsed.rolled };
    seed.preCompleted = parsed.preCompleted;
    pendingPreCompleted = parsed.preCompleted;
    save();
    toast(parsed.preCompleted.length ? `Settings loaded. ${parsed.preCompleted.length} pre-completed dungeons skipped.` : 'Settings loaded.');
    renderSettings();
    recompute();
  } catch {
    toast("That isn't a settings string this version can read. Check it starts with v2. and came from OoTMM.");
  }
}
let pendingPreCompleted: string[] = [];

/* ---------- Transfer codes ---------- */

const ALL_IDS = CHECKS.map(c => c.location);
const ID_INDEX = new Map(ALL_IDS.map((l, i) => [l, i]));
const dataHash = (() => { let h = 5381; for (const l of ALL_IDS) for (let i = 0; i < l.length; ++i) h = (h * 33 + l.charCodeAt(i)) >>> 0; return h.toString(36); })();

function packIds(ids: string[]) {
  const bits = new Uint8Array(Math.ceil(ALL_IDS.length / 8));
  const extra: string[] = [];
  for (const id of ids) {
    const i = ID_INDEX.get(id);
    if (i === undefined) extra.push(id); else bits[i >> 3] |= 1 << (i & 7);
  }
  return { b: uint8ArrayToBase64(deflateRaw(bits), { urlSafe: true }), x: extra };
}
function unpackIds(p: { b: string; x: string[] }) {
  const bits = inflateRaw(base64ToUint8Array(p.b));
  const out: string[] = [...p.x];
  ALL_IDS.forEach((id, i) => { if (bits[i >> 3] & (1 << (i & 7))) out.push(id); });
  return out;
}

export function makeTransferCode(s: Seed) {
  const body = JSON.stringify({ h: dataHash, o: s.origin ?? s.id, n: s.name, s: s.settings, d: packIds(s.done), k: packIds(s.skipped), r: s.rolled, q: s.preCompleted ?? [], g: s.skippedRegions, c: saved.custom, e: s.entrances, t: s.notes, p: s.pad, w: s.doc ?? '', f: s.found, v: s.have, i: s.hints, x: saved.edits });
  return 'OOTMM1.' + uint8ArrayToBase64(deflateRaw(new TextEncoder().encode(body), { level: 9 }), { urlSafe: true });
}
export function readTransferCode(code: string): Seed {
  const t = code.replace(/\s+/g, '');
  if (!t.startsWith('OOTMM1.')) throw new Error("That isn't a transfer code. Codes start with OOTMM1.");
  const body = JSON.parse(new TextDecoder().decode(inflateRaw(base64ToUint8Array(t.slice(7)))));
  if (body.h !== dataHash) throw new Error('This code came from a different build of the checklist. Use the same version on both devices.');
  for (const c of (body.c ?? []) as CustomCheck[]) if (!saved.custom.some(x => x.id === c.id)) saved.custom.push(c);
  if (body.x) saved.edits = mergeEdits(saved.edits, body.x);
  return { id: uid(), origin: body.o, name: body.n, settings: body.s, done: unpackIds(body.d), skipped: unpackIds(body.k), skippedRegions: body.g ?? [], rolled: body.r ?? {}, preCompleted: body.q ?? [], entrances: body.e ?? {}, notes: body.t ?? {}, pad: body.p ?? '', doc: cleanNotes(body.w ?? textToNotes(body.p ?? '')), found: body.f ?? {}, have: body.v ?? {}, hints: body.i ?? {}, updated: Date.now() };
}

/* ---------- Seeds page ---------- */

/* ---------- Coop page ----------
   Everything about playing a seed live with a partner. Live play needs the hosted page's shared database. */
function renderCoop() {
  const head = `<div class="toolbar"><div class="toolrow"><h2 style="font-size:1.42rem">Coop</h2></div></div>`;
  if (!liveDb && __TARGET__ !== 'artifact' && firebaseReady()) {
    if (fireState === 'idle') useFirebase();
    $('#pane').innerHTML = `${head}<div class="scroll"><div class="page">
      ${fireState === 'failed'
        ? `<div class="box"><h3>Can't reach the coop server</h3><p>Coop needs an internet connection. Check yours, then try again.</p>
          <div class="btns"><button class="btn keep" data-coop-retry>Try again</button></div></div>`
        : '<div class="box"><h3>Connecting to coop</h3><p>Getting the coop server ready. This takes a moment the first time.</p></div>'}
    </div></div>`;
    return;
  }
  if (!liveDb) {
    $('#pane').innerHTML = `${head}<div class="scroll"><div class="page">
      <div class="box"><h3>Coop isn't set up in this version</h3>
        <p>Playing a seed live needs a shared server. This build doesn't have one connected. The hosted page on Claude, and builds made with a Firebase project, do.</p>
        <p class="fine">This app can still move a seed between devices with a transfer code on the Seeds tab, but changes don't sync on their own.</p>
        <div class="btns"><button class="btn alt keep" data-tab="seeds">Go to Seeds</button></div></div>
    </div></div>`;
    return;
  }
  const liveSeeds = saved.seeds.filter(s => s.live);
  const list = liveSeeds.map(s => `<div class="seed${s.id === seed.id ? ' on' : ''}">
      <button class="nmz" data-open-coop="${s.id}" data-edit="seed:${s.id}">${esc(s.name)}</button>
      <div class="meta">${s.id === seed.id ? 'Open now, ' : ''}code <span class="live-code">${esc(liveCode(s.live!))}</span>, ${s.done.length.toLocaleString()} ${s.done.length === 1 ? 'check' : 'checks'} done</div></div>`).join('');
  $('#pane').innerHTML = `${head}<div class="scroll"><div class="page">
    ${liveBoxHtml()}
    ${liveSeeds.length ? `<div class="box"><h3>Your live seeds</h3><p>Seeds on this device that are shared live. Open one to play it together.</p><div id="coopList">${list}</div></div>` : ''}
  </div></div>`;
}

function renderSeeds() {
  const seedsHtml = [...saved.seeds].sort((a, b) => b.updated - a.updated).map(s => {
    const on = s.id === seed.id;
    return `<div class="seed${on ? ' on' : ''}">
      <button class="nmz" data-open="${s.id}" data-edit="seed:${s.id}">${esc(s.name)}</button>
      <div class="meta">${on ? 'Open now, ' : ''}${s.done.length.toLocaleString()} ${s.done.length === 1 ? 'check' : 'checks'} done${Object.keys(s.entrances ?? {}).length ? `, ${Object.keys(s.entrances).length} entrances logged` : ''}</div>
      <div class="btns">
        <button class="btn alt" data-rename="${s.id}">Rename</button>
        <button class="btn danger" data-del="${s.id}"${saved.seeds.length < 2 ? ' disabled' : ''}>Delete</button>
      </div></div>`;
  }).join('');
  $('#pane').innerHTML = `<div class="toolbar"><div class="toolrow"><h2 style="font-size:1.42rem">Your seeds</h2></div></div>
  <div class="scroll"><div class="page">
    <div class="box">
      <div class="btns"><button class="btn" data-new>Start a new seed</button><button class="btn alt" data-dupe>Copy settings to a new seed</button><button class="btn danger" data-reset>Clear progress on this seed</button></div>
      <div id="seedList">${seedsHtml}</div>
    </div>
    <div class="box">
      <h3>Move a seed to another device</h3>
      <p>Copy the code here, then paste it on your other device. It picks up your settings and progress. When you switch back, paste a new code and the same seed updates.</p>
      <div class="btns"><button class="btn" data-copycode>Copy transfer code</button></div>
      <textarea id="codeBox" aria-label="Transfer code" placeholder="Paste a transfer code from your other device"></textarea>
      <div class="btns"><button class="btn alt" data-readcode>Load this code</button></div>
    </div>
    <div class="box">
      <h3>Back up everything</h3>
      <p>Saves every seed, your edits and your theme in one file. Load it on any device to restore them all.</p>
      <div class="btns"><button class="btn" data-backup>Save backup file</button><label class="btn alt file">Load backup file<input id="backupFile" type="file" accept=".json,application/json"></label></div>
    </div>
  </div></div>`;
}

/* ---------- Windows ---------- */

type Layer = { el: HTMLElement; actions: Record<string, () => void>; wording: boolean; onClose?: () => void };
const layers: Layer[] = [];

function openSheet(title: string, sub: string, body: string, actions: Record<string, () => void>, onClose?: () => void) {
  const el = document.createElement('div');
  el.className = 'layer';
  el.innerHTML = `<div class="sheet-back" data-sheet-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button class="btn alt" data-sheet-close>Close</button></div>
      ${body}
      ${editMode ? '<button class="linkish wording" data-act="__wording">Change the wording in this window</button>' : ''}
    </div>`;
  const layer: Layer = { el, actions, wording: false, onClose };
  actions.__wording = () => { layer.wording = !layer.wording; el.classList.toggle('wording-on', layer.wording); };
  layers.push(layer);
  $('#sheetHost').append(el);
  el.querySelector<HTMLElement>('input:not([type=color]), textarea')?.focus({ preventScroll: true });
}

function closeSheet() {
  const layer = layers.pop();
  if (!layer) return;
  layer.el.remove();
  layer.onClose?.();
}
const closeAllSheets = () => { while (layers.length) closeSheet(); };

/* ---------- Edit mode ---------- */

function commit() {
  save();
  applyTheme();
  rebuild();
  closeAllSheets();
  renderAll();
  applyText();
}

const field = (id: string, label: string, value = '', extra = '') =>
  `<label class="field"><span>${esc(label)}</span><input type="text" id="${id}" value="${esc(value)}" ${extra}></label>`;
const areaField = (value: string) => `${field('edArea', 'Area', value, 'list="areaNames"')}<datalist id="areaNames">${regionList().map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>`;
const inputValue = (id: string) => ($('#' + id) as HTMLInputElement).value.trim();
function moveInList(key: string, ids: string[], id: string, dir: number) {
  const list = sortIn(key, ids, x => x);
  const i = list.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saved.edits.order[key] = list;
}

function editCheck(id: string) {
  const c = checks.find(x => x.id === id);
  if (!c) return;
  const E = saved.edits;
  const o = E.checks[id] ?? {};
  const custom = id.startsWith('custom:') && saved.custom.some(x => 'custom:' + x.id === id);
  const update = (patch: ItemEdit) => { E.checks[id] = { ...E.checks[id], ...patch }; };
  const peers = checks.filter(x => x.region === c.region).map(x => x.id);
  openSheet('Edit this check', c.id, `
    ${field('edName', 'Name', c.name)}
    ${custom ? '' : `<p class="fine">OoTMM calls it ${esc(engineCheck(id)?.name ?? c.name)}${playerName(id, engineCheck(id)?.name ?? c.name) !== (engineCheck(id)?.name ?? c.name) ? `, players often say ${esc(playerName(id, engineCheck(id)!.name))}` : ''}. Clear the name to go back.</p>`}
    ${areaField(regionLabel(c))}
    <label class="field"><span>Game</span><select id="edGame"><option value="oot"${c.game === 'oot' ? ' selected' : ''}>Ocarina of Time</option><option value="mm"${c.game === 'mm' ? ' selected' : ''}>Majora's Mask</option></select></label>
    <label class="field"><span>Note for this seed</span><textarea id="edNote" placeholder="What you found, or a reminder">${esc(seed.notes[id] ?? '')}</textarea></label>
    <div class="btns">
      <button class="btn" data-act="save">Save</button>
      <button class="btn alt" data-act="up">Move up</button><button class="btn alt" data-act="down">Move down</button>
      <button class="btn alt" data-act="hide">${o.hidden ? 'Show on every seed' : 'Hide on every seed'}</button>
      ${custom ? '<button class="btn danger" data-act="del">Delete this check</button>' : o.name !== undefined || o.area !== undefined || o.game !== undefined || o.hidden ? '<button class="btn danger" data-act="reset">Put back original</button>' : ''}
    </div>`, {
    save() {
      snap();
      const name = inputValue('edName'), area = inputValue('edArea'), game = ($('#edGame') as HTMLSelectElement).value as 'oot' | 'mm';
      const baseC = engineCheck(id)!;
      update({ area: area && area !== areaName(baseC.region, regionLabel(baseC)) ? area : undefined, game: game !== baseC.game ? game : undefined });
      if (name !== c.name) renameCheck(id, name);
      const note = ($('#edNote') as HTMLTextAreaElement).value.trim();
      if (note) seed.notes[id] = note; else delete seed.notes[id];
      commit();
    },
    up() { snap(); moveInList('c:' + c.region, peers, id, -1); commit(); },
    down() { snap(); moveInList('c:' + c.region, peers, id, 1); commit(); },
    hide() { snap(); update({ hidden: !o.hidden }); commit(); toast(o.hidden ? 'Back on the list.' : 'Hidden. Turn on Edit mode to see it again.', true); },
    reset() { snap(); delete E.checks[id]; commit(); },
    del() { snap(); saved.custom = saved.custom.filter(x => 'custom:' + x.id !== id); delete E.checks[id]; commit(); },
  });
}

function editEntrance(id: string) {
  const e = entranceData().list.find(x => x.id === id);
  if (!e) return;
  const E = saved.edits;
  const o = E.entrances[id] ?? {};
  const custom = E.customEntrances.some(x => x.id === id);
  const peers = entranceData().list.filter(x => x.group === e.group).map(x => x.id);
  openSheet('Edit this entrance', custom ? '' : id, `
    ${field('edName', 'Name', e.title)}
    ${field('edSub', 'Second line', e.sub)}
    ${areaField(areaName(e.group, e.groupName))}
    <label class="field"><span>Note for this seed</span><textarea id="edNote" placeholder="A reminder about this entrance">${esc(seed.notes[id] ?? '')}</textarea></label>
    <div class="btns">
      <button class="btn" data-act="save">Save</button>
      <button class="btn alt" data-act="log">${seed.entrances[id] ? 'Change where it leads' : 'Log where it leads'}</button>
      <button class="btn alt" data-act="up">Move up</button><button class="btn alt" data-act="down">Move down</button>
      <button class="btn alt" data-act="hide">${o.hidden ? 'Show on every seed' : 'Hide on every seed'}</button>
      ${custom ? '<button class="btn danger" data-act="del">Delete this entrance</button>' : Object.keys(o).length ? '<button class="btn danger" data-act="reset">Put back original</button>' : ''}
    </div>`, {
    save() {
      snap();
      E.entrances[id] = { ...E.entrances[id], name: inputValue('edName') || undefined, sub: ($('#edSub') as HTMLInputElement).value.trim(), area: inputValue('edArea') || undefined };
      const note = ($('#edNote') as HTMLTextAreaElement).value.trim();
      if (note) seed.notes[id] = note; else delete seed.notes[id];
      commit();
    },
    log() { closeSheet(); openPicker(id); },
    up() { snap(); moveInList('e:' + e.group, peers, id, -1); commit(); },
    down() { snap(); moveInList('e:' + e.group, peers, id, 1); commit(); },
    hide() { snap(); E.entrances[id] = { ...o, hidden: !o.hidden }; commit(); },
    reset() { snap(); delete E.entrances[id]; commit(); },
    del() { snap(); E.customEntrances = E.customEntrances.filter(x => x.id !== id); delete E.entrances[id]; delete seed.entrances[id]; commit(); },
  });
}

function editDest(id: string) {
  const d = entranceData().dests.find(x => x.id === id);
  if (!d) return;
  const E = saved.edits;
  openSheet('Edit this place', 'Changes its name everywhere it appears', `
    ${field('edName', 'Name', d.title)}${field('edSub', 'Second line', d.sub)}
    <div class="btns"><button class="btn" data-act="save">Save</button>${E.dests[id] ? '<button class="btn danger" data-act="reset">Put back original</button>' : ''}</div>`, {
    save() { snap(); E.dests[id] = { name: inputValue('edName') || undefined, sub: ($('#edSub') as HTMLInputElement).value.trim() }; commit(); },
    reset() { snap(); delete E.dests[id]; commit(); },
  });
}

function editArea(id: string) {
  const E = saved.edits;
  const o = E.areas[id] ?? {};
  const stats = tab === 'entrances' ? entranceStats().groups : regionStats();
  const me = stats.find(x => x.id === id);
  const fallback = me?.name ?? id.replace(/^custom:/, '');
  const spotNow = mapSpot(id);
  const onMap = !me?.dungeon && !['NONE', 'POCKET'].includes(id);
  openSheet('Edit this area', '', `
    ${field('edName', 'Name', fallback)}
    ${onMap ? field('edSpot', 'Spot on the map: column, row (counting from 1). Leave empty to keep it off the map.', spotNow ? `${spotNow[0] + 1}, ${spotNow[1] + 1}` : '', 'inputmode="numeric"') : ''}
    <div class="btns">
      <button class="btn" data-act="save">Save</button>
      <button class="btn alt" data-act="up">Move up</button><button class="btn alt" data-act="down">Move down</button>
      <button class="btn alt" data-act="hide">${o.hidden ? 'Show on every seed' : 'Hide on every seed'}</button>
      ${Object.keys(o).length ? '<button class="btn danger" data-act="reset">Put back original</button>' : ''}
    </div>`, {
    save() {
      snap();
      const next: ItemEdit = { ...E.areas[id], name: inputValue('edName') || undefined };
      if (onMap) {
        const nums = inputValue('edSpot').split(/[^\d]+/).filter(Boolean).map(Number);
        const def = MAP_SPOTS[id];
        if (nums.length >= 2 && nums[0] > 0 && nums[1] > 0) {
          const at: [number, number] = [nums[0] - 1, nums[1] - 1];
          next.map = def && def[0] === at[0] && def[1] === at[1] ? undefined : at;
        } else if (!nums.length && def) next.map = [-1, -1];
        else if (!nums.length) next.map = undefined;
      }
      E.areas[id] = next;
      commit();
    },
    up() { moveArea(-1); },
    down() { moveArea(1); },
    hide() { snap(); E.areas[id] = { ...o, hidden: !o.hidden }; commit(); },
    reset() { snap(); delete E.areas[id]; commit(); },
  });
  function moveArea(dir: number) {
    snap();
    const group = stats.filter(x => x.game === me?.game && x.dungeon === me?.dungeon).map(x => x.id);
    const i = group.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= group.length) return closeSheet();
    [group[i], group[j]] = [group[j], group[i]];
    group.forEach((g, n) => { E.areas[g] = { ...E.areas[g], order: n }; });
    commit();
  }
}

function editSeed(id: string) {
  const s = saved.seeds.find(x => x.id === id);
  if (!s) return;
  openSheet('Edit this seed', '', `${field('edName', 'Name', s.name)}
    <div class="btns"><button class="btn" data-act="save">Save</button><button class="btn alt" data-act="open">Open this seed</button></div>`, {
    save() { snap(); s.name = inputValue('edName') || s.name; commit(); },
    open() { closeAllSheets(); save(); openSeed(id); tab = 'list'; phoneView = 'rail'; },
  });
}

function editTab(k: string) {
  const E = saved.edits;
  const key = TAB_LABELS[k];
  const order = [...E.tabs, ...Object.keys(TAB_LABELS)].filter((x, i, a) => a.indexOf(x) === i && TAB_LABELS[x]);
  const move = (dir: number) => {
    snap();
    const i = order.indexOf(k), j = i + dir;
    if (j >= 0 && j < order.length) { [order[i], order[j]] = [order[j], order[i]]; E.tabs = order; }
    commit();
  };
  openSheet('Edit this tab', '', `
    ${field('edName', 'Label', E.text[key] ?? key)}
    ${field('edIcon', 'Icon: type a symbol or emoji, or leave empty for the drawn one', E.icons[k] ?? '', 'maxlength="4"')}
    <div class="btns"><button class="btn" data-act="save">Save</button><button class="btn alt" data-act="left">Move left</button><button class="btn alt" data-act="right">Move right</button>
    <button class="btn alt" data-act="hide">${E.hide[key] ? 'Show this tab' : 'Hide this tab'}</button></div>`, {
    save() {
      snap();
      const v = inputValue('edName');
      if (v && v !== key) E.text[key] = v; else delete E.text[key];
      const ic = inputValue('edIcon');
      if (ic) E.icons[k] = ic; else delete E.icons[k];
      commit();
    },
    left() { move(-1); },
    right() { move(1); },
    hide() { snap(); if (E.hide[key]) delete E.hide[key]; else E.hide[key] = 'self'; commit(); },
  });
}

function editMeter() {
  const set = (v?: string) => { snap(); saved.ui.meter = v; commit(); };
  openSheet('Edit the progress display', '', `<div class="btns">
    <button class="btn alt" data-act="hearts">Heart containers</button><button class="btn alt" data-act="clock">Three-day clock</button><button class="btn alt" data-act="none">Numbers only</button><button class="btn alt" data-act="auto">Theme default</button>
    <button class="btn alt" data-act="colors">Change its colors</button></div>`, {
    hearts() { set('hearts'); }, clock() { set('clock'); }, none() { set('none'); }, auto() { set(undefined); },
    colors() { closeSheet(); openColors(); },
  });
}

function openColors() {
  const skin = skinById(saved.ui.skin);
  const E = saved.edits;
  snap();
  const rows = COLOR_TOKENS.map(([t, label]) => `<label class="color-row"><span>${esc(label)}</span><input type="color" data-color="${t}" value="${esc(E.colors[skin.id]?.[t] ?? skin.tokens[t])}"></label>`).join('');
  openSheet(`Colors for ${skin.name}`, 'Changes show right away', `
    <div class="color-grid">${rows}</div>
    <label class="field"><span>Check mark shape</span><select data-seal>${SEALS.map(([v, l]) => `<option value="${esc(v)}"${(saved.ui.seal ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="field"><span>Background pattern</span><select data-pattern><option value=""${!saved.ui.noPattern ? ' selected' : ''}>Theme pattern</option><option value="none"${saved.ui.noPattern ? ' selected' : ''}>Plain</option></select></label>
    <label class="field"><span>Heading font</span><select id="fontPick" data-font>${FONT_CHOICES.map(([v, l]) => `<option value="${esc(v)}"${(saved.ui.font ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <div class="btns"><button class="btn" data-sheet-close>Done</button><button class="btn danger" data-act="reset">Put back this theme's colors</button></div>`, {
    reset() { snap(); delete E.colors[skin.id]; saved.ui.font = undefined; saved.ui.seal = undefined; saved.ui.noPattern = undefined; applyThemeFontReset(); closeAllSheets(); save(); applyTheme(); renderAll(); },
  });
}

function addCheck(areaId: string) {
  const start = areaId ? areaName(areaId, regionList().find(r => r.id === areaId)?.name ?? areaId.replace(/^custom:/, '')) : '';
  const game = region?.startsWith('MM') || areaId.startsWith('MM') ? 'mm' : 'oot';
  openSheet(areaId ? 'Add a check' : 'Add a check or a new area', 'Type a new area name to create that area', `
    ${field('edName', 'Check name')}
    ${areaField(start)}
    <label class="field"><span>Game</span><select id="edGame"><option value="oot"${game === 'oot' ? ' selected' : ''}>Ocarina of Time</option><option value="mm"${game === 'mm' ? ' selected' : ''}>Majora's Mask</option></select></label>
    ${field('edWhenKey', 'Optional: only show when this setting', '', 'list="settingKeys" placeholder="Leave empty to always show"')}<datalist id="settingKeys">${(SETTINGS as readonly any[]).map(x => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('')}</datalist>
    ${field('edWhenVal', 'is set to', '', 'placeholder="true, false, or a value"')}
    <div class="btns"><button class="btn" data-act="save">Add check</button></div>`, {
    save() {
      const name = inputValue('edName'), reg = inputValue('edArea');
      if (!name || !reg) return toast('Give the check a name and an area.');
      snap();
      const key = inputValue('edWhenKey');
      const raw = inputValue('edWhenVal');
      const value: unknown = raw === 'true' ? true : raw === 'false' ? false : raw;
      saved.custom.push({ id: uid(), name, region: reg, game: ($('#edGame') as HTMLSelectElement).value as 'oot' | 'mm', ...(key ? { when: { [key]: value } } : {}) });
      commit();
    },
  });
}

function addEntrance(areaId: string) {
  const start = areaId ? areaName(areaId, regionList().find(r => r.id === areaId)?.name ?? areaId.replace(/^custom:/, '')) : '';
  openSheet('Add an entrance', 'It joins this list and can lead anywhere', `
    ${field('edName', 'Name')}${field('edSub', 'Second line')}
    ${areaField(start)}
    <label class="field"><span>Game</span><select id="edGame"><option value="oot">Ocarina of Time</option><option value="mm">Majora's Mask</option></select></label>
    <div class="btns"><button class="btn" data-act="save">Add entrance</button></div>`, {
    save() {
      const title = inputValue('edName'), area = inputValue('edArea');
      if (!title || !area) return toast('Give the entrance a name and an area.');
      snap();
      saved.edits.customEntrances.push({ id: 'custom-entrance:' + uid(), title, sub: inputValue('edSub'), area, game: ($('#edGame') as HTMLSelectElement).value as 'oot' | 'mm' });
      commit();
    },
  });
}

function openTextEditor(key: string, el: Element | null) {
  const E = saved.edits;
  const hasNums = /\{\d+\}/.test(key);
  const button = el?.closest<HTMLElement>('button, summary, label');
  openSheet('Change this text', 'Changes it everywhere this wording appears', `
    <label class="field"><span>Text</span><textarea id="edText">${esc(E.text[key] ?? key)}</textarea></label>
    ${hasNums ? '<p class="fine">Keep {1}, {2} and so on where the live numbers belong.</p>' : ''}
    <p class="fine">Original: ${esc(key)}</p>
    <div class="btns"><button class="btn" data-act="save">Save</button>
      ${button ? '<button class="btn alt" data-act="press">Use this button instead</button>' : ''}
      <button class="btn alt" data-act="hide">${E.hide[key] ? 'Show it again' : 'Hide this'}</button>
      ${E.hide[key] ? '' : '<button class="btn alt" data-act="group">Hide its whole block</button>'}
      ${E.text[key] !== undefined ? '<button class="btn danger" data-act="reset">Put back original</button>' : ''}</div>`, {
    save() {
      snap();
      const v = ($('#edText') as HTMLTextAreaElement).value;
      if (v.trim() && v.trim() !== key) E.text[key] = v.trim(); else delete E.text[key];
      commit();
    },
    press() { closeAllSheets(); bypass = true; button!.click(); bypass = false; },
    hide() { snap(); if (E.hide[key]) delete E.hide[key]; else E.hide[key] = 'self'; commit(); },
    group() { snap(); E.hide[key] = 'group'; commit(); },
    reset() { snap(); delete E.text[key]; commit(); },
  });
}

function openOptions(select: HTMLSelectElement) {
  const opts = [...select.options].map(o => templateOf(originalOf(o.firstChild!).trim()));
  openSheet('Change these choices', 'Tap a choice to reword it', `<div class="btns">${opts.map((k, i) => `<button class="btn alt" data-act="o${i}">${esc(saved.edits.text[k] ?? k)}</button>`).join('')}</div>`,
    Object.fromEntries(opts.map((k, i) => [`o${i}`, () => openTextEditor(k, null)])));
}

function openEditor(target: string) {
  const i = target.indexOf(':');
  const kind = i < 0 ? target : target.slice(0, i), id = i < 0 ? '' : target.slice(i + 1);
  if (kind === 'check') editCheck(id);
  else if (kind === 'entr') editEntrance(id);
  else if (kind === 'dest') editDest(id);
  else if (kind === 'area') editArea(id);
  else if (kind === 'seed') editSeed(id);
  else if (kind === 'tab') editTab(id);
  else if (kind === 'meter') editMeter();
  else if (kind === 'item') editItem(id);
  else if (kind === 'stone') editStone(id);
  else if (kind === 'text') openTextEditor(id, null);
}

function editTextAt(e: MouseEvent, t: HTMLElement) {
  /* Dropdowns ignore clicks in Edit mode so they don't open, so they're found by position. */
  const near = t.closest('.ctl, .field, .box, .sheet');
  const select = near && [...near.querySelectorAll('select')].find(x => {
    const r = x.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  });
  if (select) return openOptions(select);
  if (t.matches('input, textarea')) {
    (t as HTMLInputElement).blur();
    if (t.hasAttribute('placeholder')) return openTextEditor(templateOf(originalAttr(t, 'placeholder').trim()), t);
    const label = t.closest('[aria-label]') ?? t.closest('label');
    if (label?.getAttribute('aria-label')) return openTextEditor(templateOf(originalAttr(label, 'aria-label').trim()), label);
    return openTextEditor(templateOf(originalAttr(t, 'aria-label').trim() || 'Text box'), t);
  }
  const node = textAt(e.clientX, e.clientY, t);
  if (node) return openTextEditor(templateOf(originalOf(node).trim()), node.parentElement);
  const named = t.closest('[aria-label]');
  if (named) return openTextEditor(templateOf(originalAttr(named, 'aria-label').trim()), named);
  openColors();
}

let bypass = false;
function editCapture(e: MouseEvent) {
  if (!editMode || bypass) return;
  const t = e.target as HTMLElement;
  if (t.closest('[data-locked]')) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  const top = layers[layers.length - 1];
  if (top && t.closest('.layer')) {
    if (!top.wording || t.closest('[data-act="__wording"], [data-sheet-close]')) return;
    stop();
    editTextAt(e, t);
    return;
  }
  if (top) return;
  const pencil = t.closest<HTMLElement>('.pen');
  if (pencil) { stop(); openEditor(pencil.dataset.edit!); return; }
  if (t.closest('.keep, .switch, input[type=number], .toast button')) {
    return;
  }
  stop();
  if (!t.closest('[data-text]')) {
    const target = t.closest<HTMLElement>('[data-edit]');
    if (target) { openEditor(target.dataset.edit!); return; }
  }
  editTextAt(e, t);
}

function setEditMode(on: boolean) {
  editMode = on;
  closeAllSheets();
  rebuild();
  renderAll();
  if (!on) toast('Edit mode is off. Your changes are saved.');
}

/* ---------- Your edits page ---------- */

function editList() {
  const E = saved.edits;
  const out: { label: string; what: string; undo: () => void }[] = [];
  const rename = (o: ItemEdit) => [o.name && `renamed to ${o.name}`, o.area && `moved to ${o.area}`, o.hidden && 'hidden', o.order !== undefined && 'reordered', o.map && 'moved on the map'].filter(Boolean).join(', ') || 'changed';
  for (const [k, v] of Object.entries(E.text)) out.push({ label: k, what: `reads ${v}`, undo: () => { delete E.text[k]; } });
  for (const k of Object.keys(E.hide)) out.push({ label: k, what: 'hidden', undo: () => { delete E.hide[k]; } });
  for (const [k, o] of Object.entries(E.checks)) out.push({ label: k.replace(/^(OOT|MM) /, ''), what: rename(o), undo: () => { delete E.checks[k]; } });
  for (const [k, o] of Object.entries(E.entrances)) out.push({ label: k, what: rename(o), undo: () => { delete E.entrances[k]; } });
  for (const [k, o] of Object.entries(E.dests)) out.push({ label: k, what: rename(o), undo: () => { delete E.dests[k]; } });
  for (const [k, o] of Object.entries(E.areas)) out.push({ label: `Area ${k.replace(/^custom:/, '')}`, what: rename(o), undo: () => { delete E.areas[k]; } });
  for (const [k, o] of Object.entries(E.items)) out.push({ label: `Item ${k}`, what: rename(o), undo: () => { delete E.items[k]; } });
  for (const [k, o] of Object.entries(E.stones)) out.push({ label: k.replace(/^(OOT|MM) /, ''), what: rename(o), undo: () => { delete E.stones[k]; } });
  for (const c of saved.custom) out.push({ label: c.name, what: `your check in ${c.region}`, undo: () => { saved.custom = saved.custom.filter(x => x.id !== c.id); } });
  for (const c of E.customEntrances) out.push({ label: c.title, what: `your entrance in ${c.area}`, undo: () => { E.customEntrances = E.customEntrances.filter(x => x.id !== c.id); } });
  for (const k of Object.keys(E.order)) out.push({ label: 'Order within an area', what: 'rearranged', undo: () => { delete E.order[k]; } });
  for (const k of Object.keys(E.icons)) out.push({ label: `${TAB_LABELS[k]} tab icon`, what: `is ${E.icons[k]}`, undo: () => { delete E.icons[k]; } });
  if (E.tabs.length) out.push({ label: 'Tab order', what: 'rearranged', undo: () => { E.tabs = []; } });
  for (const k of Object.keys(E.colors)) out.push({ label: `${skinById(k).name} colors`, what: 'changed', undo: () => { delete E.colors[k]; } });
  return out;
}

/* ---------- Check names box ---------- */

let renameQuery = '';
let namesShareOpen = false;
const renamedCount = () => Object.values(saved.edits.checks).filter(o => o.name).length;
function namesSliderHtml() {
  const cur = nameStyle(), i = NAME_STYLES.findIndex(([k]) => k === cur);
  const baseLabel = (saved.ui.nameBase ?? 'original') === 'player' ? 'player names' : "OoTMM's names";
  const n = renamedCount();
  const about = cur === 'original' ? "OoTMM's own names, the same as the spoiler log. Your renames are kept, just not shown."
    : cur === 'player' ? 'Everyday names: Skull for GS, Heart Piece for HP, Sheik in Crater and so on. Your renames are kept, just not shown.'
    : `Your renames on top of ${baseLabel}. ${n ? `${n} ${n === 1 ? 'check' : 'checks'} renamed so far.` : 'Nothing renamed yet.'}`;
  return `<div class="names-ctl"><div class="names-slider">
      <input type="range" class="keep" min="0" max="2" step="1" value="${i}" data-names-range aria-label="Check names" aria-valuetext="${esc(NAME_STYLES[i][1])}">
      <div class="names-stops">${NAME_STYLES.map(([k, l]) => `<button class="keep" data-names-set="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>
    </div>
    <p class="fine">${esc(about)}</p></div>`;
}
const refreshNamesSlider = () => document.querySelectorAll('.names-ctl').forEach(el => { el.outerHTML = namesSliderHtml(); });
let renameSnapFor: EventTarget | null = null;
/** Checks matching the rename search, or with no search, the ones already renamed. */
function renameRowsHtml() {
  const E = saved.edits;
  const q = renameQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const onList = new Map(checks.map(c => [c.id, c]));
  let rows: { id: string; base: string; area: string }[];
  if (q.length) {
    rows = checks.filter(c => {
      const hay = `${c.id} ${c.name} ${otherNames.get(c.id) ?? ''} ${regionLabel(c)}`.toLowerCase();
      return q.every(w => hay.includes(w));
    }).slice(0, 60).map(c => ({ id: c.id, base: baseName(engineCheck(c.id) ?? c), area: regionLabel(c) }));
  } else {
    rows = Object.keys(E.checks).filter(id => E.checks[id].name).map(id => {
      const c = onList.get(id), raw = engineCheck(id);
      return { id, base: raw ? baseName(raw) : id.replace(/^(OOT|MM) /, ''), area: c ? regionLabel(c) : 'Not on this seed' };
    });
  }
  if (!rows.length) return `<p class="fine">${q.length ? 'No checks match that on this seed.' : 'Nothing renamed yet. Search for a check above to give it your own name.'}</p>`;
  return rows.map(r => `<label class="rn-row" data-edit="check:${esc(r.id)}"><span class="rn-was"><b>${esc(r.base)}</b> <span>${esc(r.area)}</span></span>
      <input type="text" class="keep" data-rename="${esc(r.id)}" value="${esc(E.checks[r.id]?.name ?? '')}" placeholder="${esc(r.base)}" aria-label="Your name for ${esc(r.base)}"></label>`).join('');
}
function namesBoxHtml() {
  return `<div class="box" id="namesBox"><h3>Check names</h3>
      ${namesSliderHtml()}
      <p>Give any check the name you call it. Search below, or long-press a check on the list (right-click on a computer). Names save as you type them and apply to every seed.</p>
      <input type="search" id="renameSearch" class="keep" placeholder="Find a check to rename" value="${esc(renameQuery)}">
      <div class="rn-list" id="renameList">${renameRowsHtml()}</div>
      <details class="rn-share" id="namesShare"${namesShareOpen ? ' open' : ''}><summary class="keep">Share or move your names</summary>
        <p class="fine">Copy your names to send to a friend or keep somewhere safe. Paste a list here to add those names; your other names stay.</p>
        <textarea id="namesText" class="keep" rows="5" placeholder="OOT Kokiri Forest Mido Top Left = Mido 1"></textarea>
        <div class="btns"><button class="btn alt keep" data-names-copy>Copy my names</button><button class="btn keep" data-names-add>Add these names</button></div>
      </details>
    </div>`;
}
function namesText() {
  return Object.entries(saved.edits.checks).filter(([, o]) => o.name).map(([id, o]) => `${id} = ${o.name}`).join('\n');
}
/** Adds names from a pasted list. Lines that name an unknown check are skipped. */
function addNames(text: string) {
  const known = new Set([...ALL_IDS, ...saved.custom.map(c => 'custom:' + c.id)]);
  let added = 0, skipped = 0;
  snap();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    if (!known.has(m[1])) { skipped++; continue; }
    saved.edits.checks[m[1]] = { ...saved.edits.checks[m[1]], name: m[2] };
    added++;
  }
  if (added && !useRenames()) { saved.ui.nameBase = nameStyle() as 'original' | 'player'; saved.ui.names = 'custom'; }
  save(); rebuild(); renderAll();
  toast(added ? `Added ${added} ${added === 1 ? 'name' : 'names'}${skipped ? `. ${skipped} didn't match a check and were left out` : ''}.` : "No names found. Each line should read: check = your name.");
}

function renderYourEdits() {
  const list = editList();
  const rows = list.map((x, i) => `<div class="seed"><div class="edit-label">${esc(x.label)}</div><div class="meta">${esc(x.what)}</div><div class="btns"><button class="btn alt" data-undo-edit="${i}">Put back</button></div></div>`).join('');
  $('#pane').innerHTML = `<div class="toolbar">${settingsNav()}</div>
    <div class="scroll"><div class="page">
      ${namesBoxHtml()}
      <div class="box"><h3>Your edits</h3>
        <p>Everything you've changed in Edit mode, on every seed. Put back any one of them, or all of them.</p>
        ${list.length ? `<div class="btns"><button class="btn danger" data-reset-edits>Put everything back</button></div>${rows}` : '<p>No edits yet. Press Edit mode, then tap anything to change it.</p>'}
      </div></div></div>`;
}

async function saveBackup() {
  save();
  const data = JSON.stringify(saved);
  const filename = `ootmm-checklist-backup-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const dl = await (window as any).claude?.use?.('downloads');
    if (dl) { await dl.save({ filename, data }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = filename;
    a.click();
    toast('Backup saved.');
  } catch { toast("The backup wasn't saved. Try again, or use a transfer code."); }
}

function loadBackup(text: string) {
  try {
    const v = JSON.parse(text);
    if (!v.seeds?.length) throw new Error('empty');
    snap();
    saved = load(text);
    applyTheme();
    openSeed(saved.current);
    save();
    toast(`Backup loaded: ${saved.seeds.length} ${saved.seeds.length === 1 ? 'seed' : 'seeds'}.`);
  } catch { toast("That file isn't a checklist backup."); }
}

/* ---------- Rendering and events ---------- */

/* ---------- Notes tab ---------- */

const notesView = (): Required<NotesView> => ({ size: 'letter', zoom: 1, paper: false, ...saved.ui.notes });
const docBtn = (cmd: string, label: string, inner: string, arg = '') =>
  `<button class="keep" data-doc="${cmd}"${arg ? ` data-arg="${esc(arg)}"` : ''} title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`;
function renderNotes() {
  const v = notesView();
  const sel = (attr: string, label: string, opts: [string, string][], cur = '') =>
    `<select class="keep" data-${attr} aria-label="${esc(label)}" title="${esc(label)}">${opts.map(([val, l]) => `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const sep = '<span class="doc-sep" aria-hidden="true"></span>';
  $('#pane').innerHTML = `<div class="toolbar"><div class="toolrow"><h2 style="font-size:1.42rem">Notes</h2><span class="doc-for">${esc(seed.name)}</span></div>
    <div class="doc-tools" role="toolbar" aria-label="Formatting">
      ${docBtn('undo', 'Undo', '↶')}${docBtn('redo', 'Redo', '↷')}${sep}
      ${sel('doc-block', 'Text style', [['p', 'Normal text'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['blockquote', 'Quote']])}
      ${sel('doc-font', 'Font', [['', 'Font'], ['inherit', 'Theme font'], ['Georgia, serif', 'Serif'], ['Arial, sans-serif', 'Sans'], ["'Courier New', monospace", 'Typewriter']])}
      ${sel('doc-size', 'Text size', [['', 'Size'], ['2', 'Small'], ['3', 'Normal'], ['4', 'Large'], ['5', 'Larger'], ['6', 'Huge']])}${sep}
      ${docBtn('bold', 'Bold (Ctrl+B)', '<b>B</b>')}${docBtn('italic', 'Italic (Ctrl+I)', '<i>I</i>')}${docBtn('underline', 'Underline (Ctrl+U)', '<u>U</u>')}${docBtn('strikeThrough', 'Strikethrough', '<s>S</s>')}
      <label class="doc-color keep" title="Text color"><span style="border-bottom:3px solid #e05050">A</span><input type="color" class="keep" data-doc-color="foreColor" value="#e05050" aria-label="Text color"></label>
      <label class="doc-color keep" title="Highlight"><span class="hl">ab</span><input type="color" class="keep" data-doc-color="hiliteColor" value="#f2d24b" aria-label="Highlight color"></label>${sep}
      ${docBtn('insertUnorderedList', 'Bulleted list', '•≡')}${docBtn('insertOrderedList', 'Numbered list', '1≡')}${docBtn('checklist', 'Checklist', '☑')}
      ${docBtn('outdent', 'Decrease indent', '⇤')}${docBtn('indent', 'Increase indent', '⇥')}${sep}
      ${docBtn('justifyLeft', 'Align left', '⫷')}${docBtn('justifyCenter', 'Center', '≡')}${docBtn('justifyRight', 'Align right', '⫸')}${sep}
      ${docBtn('insertHorizontalRule', 'Line', '―')}${docBtn('stamp', 'Insert date and time', '🕒')}${docBtn('removeFormat', 'Clear formatting', '⌫')}
    </div>
    <div class="doc-tools doc-view" aria-label="Page">
      ${sel('doc-page', 'Page size', PAGE_SIZES, v.size)}
      ${sel('doc-zoom', 'Zoom', ZOOMS.map(z => [String(z), `${Math.round(z * 100)}%`] as [string, string]), String(v.zoom))}
      <button class="keep" data-doc-paper aria-pressed="${v.paper}" title="White paper with black text">White paper</button>
      <span class="doc-count" id="docCount"></span>
    </div></div>
    <div class="scroll doc-scroll"><div class="doc-desk size-${v.size}${v.paper ? ' paper' : ''}" style="--zoom:${v.zoom}">
      <div class="doc-page keep" id="docPage" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Notes for ${esc(seed.name)}" data-placeholder="Hints, plans, anything you want to remember on this seed.">${cleanNotes(seed.doc ?? '')}</div>
    </div></div>`;
  try { document.execCommand('styleWithCSS', false, 'true'); } catch { /* older browsers use font tags */ }
  updateDocCount();
}
function updateDocCount() {
  const page = $('#docPage'), out = $('#docCount');
  if (!page || !out) return;
  const text = page.innerText.trim();
  const words = text ? text.split(/\s+/).length : 0;
  out.textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
}
/** Keeps the seed's notes in step with the page. */
function saveDoc() {
  const page = $('#docPage');
  if (!page) return;
  seed.doc = page.innerHTML;
  seed.pad = page.innerText;
  save();
  updateDocCount();
}
/** Runs a formatting command on the page, keeping the selection in it. */
function docCommand(cmd: string, arg?: string) {
  const page = $('#docPage');
  if (!page) return;
  page.focus();
  if (cmd === 'stamp') document.execCommand('insertText', false, new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
  else if (cmd === 'checklist') {
    const sel = getSelection();
    let ul = (sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest('ul');
    if (!ul || !page.contains(ul)) { document.execCommand('insertUnorderedList'); ul = (getSelection()?.anchorNode as Node | null)?.parentElement?.closest('ul') ?? null; }
    if (ul && page.contains(ul)) ul.classList.toggle('doc-check');
  } else if (cmd === 'formatBlock') document.execCommand('formatBlock', false, `<${arg}>`);
  else document.execCommand(cmd, false, arg);
  saveDoc();
}
/** Puts pasted or dropped content in as cleaned formatting. */
function docInsert(e: ClipboardEvent | DragEvent) {
  const data = 'clipboardData' in e ? e.clipboardData : (e as DragEvent).dataTransfer;
  if (!data) return;
  e.preventDefault();
  const html = data.getData('text/html');
  if (html) document.execCommand('insertHTML', false, cleanNotes(html));
  else document.execCommand('insertText', false, data.getData('text/plain'));
  saveDoc();
}

function renderPane() {
  if (tab === 'list') renderChecks();
  else if (tab === 'entrances') renderEntrances();
  else if (tab === 'items') renderItems();
  else if (tab === 'notes') renderNotes();
  else if (tab === 'settings') renderSettings();
  else if (tab === 'coop') renderCoop();
  else renderSeeds();
}

function renderAll() {
  if (pendingPreCompleted.length && lastResult) {
    const hits = new Set<string>();
    for (const c of lastResult.checks) if (c.dungeonKey && pendingPreCompleted.includes(c.dungeonKey)) hits.add(c.region);
    seed.skippedRegions = [...new Set([...seed.skippedRegions, ...hits])];
    pendingPreCompleted = [];
  }
  renderDial();
  renderRail();
  renderTabs();
  renderPane();
  renderCount();
}

function openSeed(id: string) {
  seed = saved.seeds.find(s => s.id === id) ?? saved.seeds[0];
  saved.current = seed.id;
  doneSet = new Set(seed.done);
  skipSet = new Set(seed.skipped);
  seed.entrances ??= {};
  entrRegion = null;
  try { S = importSettings(seed.settings); } catch { S = makeSettings({}); }
  checks = [];
  region = null;
  logicOut = null;
  reachSet = new Set();
  stoneSet = new Set();
  if (seed.live) liveBase.set(seed.id, flatten(seed));
  recompute();
  liveFollow();
}

let toastTimer = 0;
function toast(msg: string, canUndo = false) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${canUndo ? ' <button class="toast-undo" data-undo>Undo</button>' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, canUndo ? 6000 : 3800);
}

async function copyText(text: string, ok: string, fallback?: HTMLTextAreaElement) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    if (fallback) { fallback.value = text; fallback.focus(); fallback.select(); toast('Press and hold the code to copy it.'); }
  }
}

function applyTheme() {
  const skin = skinById(saved.ui.skin);
  const root = document.documentElement;
  root.dataset.skin = skin.id;
  root.style.colorScheme = skin.dark ? 'dark' : 'light';
  for (const [k, v] of Object.entries({ ...skin.tokens, ...saved.edits.colors[skin.id] })) root.style.setProperty('--' + k, v);
  if (saved.ui.font) root.style.setProperty('--display', saved.ui.font);
  if (saved.ui.seal) root.style.setProperty('--clip', saved.ui.seal);
  if (saved.ui.noPattern) root.style.setProperty('--pattern', 'none');
  root.style.setProperty('--scale', String(saved.ui.scale ?? 1));
  document.body.classList.toggle('compact', !!saved.ui.compact);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', saved.edits.colors[skin.id]?.bg ?? skin.tokens.bg);
}

let textQueued = false;
function applyText() {
  textQueued = false;
  const { text, hide } = saved.edits;
  applyLayer($('#app'), { text, hide });
  if (editMode) {
    document.querySelectorAll<HTMLElement>('#app .keep').forEach(el => {
      if (el.querySelector('.pen')) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue?.trim()) continue;
        el.insertAdjacentHTML('beforeend', pen('text:' + templateOf(originalOf(n).trim())));
        break;
      }
    });
  }
  document.title = text['OoTMM Checklist'] ?? 'OoTMM Checklist';
}
function queueText() {
  if (textQueued) return;
  textQueued = true;
  queueMicrotask(applyText);
}

const applyThemeFontReset = () => document.documentElement.style.removeProperty('--display');

function events() {
  const app = $('#app');
  let searchTimer = 0;
  new MutationObserver(queueText).observe(app, { childList: true, subtree: true });
  /* Long-press a check (or right-click it) to rename it without turning on Edit mode. */
  let pressTimer = 0, pressedOpen = false, pressAt = [0, 0];
  const checkAt = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.<HTMLElement>('.row[data-id] .tick-btn')?.closest<HTMLElement>('.row')?.dataset.id;
  const cancelPress = () => clearTimeout(pressTimer);
  app.addEventListener('pointerdown', e => {
    pressedOpen = false;
    const id = checkAt(e.target);
    if (!id || editMode || e.pointerType === 'mouse') return;
    pressAt = [e.clientX, e.clientY];
    cancelPress();
    pressTimer = window.setTimeout(() => { pressedOpen = true; editCheck(id); }, 550);
  });
  app.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 10) cancelPress(); });
  app.addEventListener('pointerup', cancelPress);
  app.addEventListener('pointercancel', cancelPress);
  app.addEventListener('contextmenu', e => {
    const id = checkAt(e.target);
    if (!id || layers.length) return;
    e.preventDefault();
    cancelPress();
    if (!pressedOpen) { pressedOpen = true; editCheck(id); }
  });
  /* The tap that ends a long-press doesn't also tick the check. */
  app.addEventListener('click', e => { if (pressedOpen && checkAt(e.target)) { pressedOpen = false; e.preventDefault(); e.stopPropagation(); } }, true);
  app.addEventListener('click', editCapture, true);
  /* Notes page: clean what's pasted or dropped, and tick checklist lines by their box. */
  const inDoc = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('#docPage');
  app.addEventListener('paste', e => { if (inDoc(e.target)) docInsert(e); });
  app.addEventListener('drop', e => { if (inDoc(e.target)) docInsert(e); });
  app.addEventListener('click', e => {
    const li = (e.target as HTMLElement).closest?.<HTMLElement>('#docPage ul.doc-check > li');
    if (!li || e.offsetX > 0) return;
    e.preventDefault();
    li.classList.toggle('done');
    saveDoc();
  });

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable;
    if (e.key === 'Escape' && layers.length) { closeSheet(); return; }
    if (e.key === 'Enter' && layers.length && (e.target as HTMLElement).matches?.('.sheet input[type=text]')) {
      const act = layers[layers.length - 1].actions.save;
      if (act) { e.preventDefault(); act(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
    if (e.key === '/' && !typing && !layers.length) {
      const box = document.querySelector<HTMLInputElement>('#search, #entrSearch, #setSearch, #itemSearch, #hintSearch');
      if (box) { e.preventDefault(); box.focus(); }
    }
  });

  app.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'search') {
      query = t.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderChecks, 120);
    } else if (t.id === 'entrSearch') {
      entrQuery = t.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderEntrances, 120);
    } else if (t.id === 'pickSearch') {
      pickQuery = t.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderPickList, 100);
    } else if (t.id === 'itemSearch') {
      itemQuery = t.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderItems, 120);
    } else if (t.id === 'itemPickSearch') {
      itemPickQuery = t.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderItemPickList, 100);
    } else if (t.id === 'docPage') {
      saveDoc();
    } else if (t.dataset.color) {
      const skin = skinById(saved.ui.skin);
      (saved.edits.colors[skin.id] ??= {})[t.dataset.color] = t.value;
      applyTheme();
      save();
    } else if (t.id === 'renameSearch') {
      renameQuery = t.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => { const box = $('#renameList'); if (box) box.innerHTML = renameRowsHtml(); }, 120);
    } else if (t.dataset.rename) {
      if (renameSnapFor !== t) { snap(); renameSnapFor = t; }
      renameCheck(t.dataset.rename, t.value);
      save(); rebuild(); refreshNamesSlider();
    } else if (t.id === 'setSearch') {
      settingsQuery = t.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderSettings, 150);
    }
  });

  app.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if ('docBlock' in t.dataset) { docCommand('formatBlock', t.value); return; }
    if ('docFont' in t.dataset) { if (t.value) docCommand('fontName', t.value); (t as unknown as HTMLSelectElement).selectedIndex = 0; return; }
    if ('docSize' in t.dataset) { if (t.value) docCommand('fontSize', t.value); (t as unknown as HTMLSelectElement).selectedIndex = 0; return; }
    if (t.dataset.docColor) { docCommand(t.dataset.docColor, t.value); return; }
    if ('docPage' in t.dataset) { saved.ui.notes = { ...saved.ui.notes, size: t.value as NotesView['size'] }; save(); renderNotes(); return; }
    if ('docZoom' in t.dataset) { saved.ui.notes = { ...saved.ui.notes, zoom: Number(t.value) || 1 }; save(); renderNotes(); return; }
    if ('namesRange' in t.dataset) { setNameStyle(NAME_STYLES[Number(t.value)]?.[0] ?? 'custom'); return; }
    if (t.dataset.rename) { renameSnapFor = null; return; }
    if (t.dataset.itemNum) { snap(); setItemCount(t.dataset.itemNum, Number(t.value) || 0); afterItemChange(); return; }
    if (t.dataset.enum) setSetting(t.dataset.enum, t.value);
    else if (t.dataset.num) setSetting(t.dataset.num, Number(t.value));
    else if (t.dataset.condCount) { const k = t.dataset.condCount; setSettingsRaw(s => { s.specialConds[k].count = Math.min(condMax(k, s), Math.max(0, Number(t.value) || 0)); }); }
    else if (t.dataset.startNum) { const k = t.dataset.startNum; setSettingsRaw(s => { s.startingItems[k] = Math.min(catalogById().get(k)?.max ?? Infinity, Math.max(0, Math.floor(Number(t.value)) || 0)); }); }
    else if ('startAdd' in t.dataset && t.value) { const k = t.value; setSettingsRaw(s => { s.startingItems[k] = 1; }); }
    else if (t.id === 'importFile' && t.files?.[0]) t.files[0].text().then(applyImport);
    else if (t.id === 'backupFile' && t.files?.[0]) t.files[0].text().then(loadBackup);
    else if ('seal' in t.dataset) { saved.ui.seal = t.value || undefined; applyTheme(); save(); }
    else if ('pattern' in t.dataset) { saved.ui.noPattern = t.value === 'none' || undefined; applyTheme(); save(); }
    else if ('font' in t.dataset) { saved.ui.font = t.value || undefined; if (!t.value) applyThemeFontReset(); applyTheme(); save(); }
  });

  app.addEventListener('toggle', e => {
    const d = e.target as HTMLDetailsElement;
    if (d.id === 'namesShare') namesShareOpen = d.open;
    if (d.dataset?.cat) { if (d.open) openCats.add(d.dataset.cat); else openCats.delete(d.dataset.cat); }
  }, true);

  app.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button, [data-tab]');
    if (!el) return;
    const d = el.dataset;

    if ('editmode' in d) { setEditMode(!editMode); return; }
    if ('sheetClose' in d) { closeSheet(); return; }
    if (d.act) { layers[layers.length - 1]?.actions[d.act]?.(); return; }
    if ('undo' in d) { undo(); return; }
    if ('openColors' in d) { openColors(); return; }
    if (d.addCheck !== undefined) { addCheck(d.addCheck); return; }
    if (d.addEntrance !== undefined) { addEntrance(d.addEntrance); return; }
    if (d.collapse) {
      const cur = saved.ui.collapsed ?? [];
      saved.ui.collapsed = cur.includes(d.collapse) ? cur.filter(x => x !== d.collapse) : [...cur, d.collapse];
      save(); renderPane();
      return;
    }
    if (d.setview) { settingsView = d.setview as typeof settingsView; renderSettings(); return; }
    if (d.skinSet) { saved.ui.skin = d.skinSet; saved.ui.font = undefined; applyTheme(); save(); renderDial(); renderLook(); return; }
    if (d.meterSet !== undefined) { saved.ui.meter = d.meterSet || undefined; save(); renderDial(); renderLook(); return; }
    if (d.scaleSet) { saved.ui.scale = Number(d.scaleSet); applyTheme(); save(); renderLook(); return; }
    if (d.compactSet) { saved.ui.compact = d.compactSet === '1'; applyTheme(); save(); renderLook(); return; }
    if ('backup' in d) { saveBackup(); return; }
    if (d.doc) { docCommand(d.doc, d.arg); return; }
    if (d.openCoop) { save(); openSeed(d.openCoop); save(); renderAll(); return; }
    if ('coopRetry' in d) { fireState = 'idle'; renderPane(); return; }
    if ('liveStart' in d) { startLive(); return; }
    if ('liveStop' in d) { stopLive(); return; }
    if ('liveJoin' in d) { joinLive(($('#liveJoin') as HTMLInputElement).value); return; }
    if ('liveCopy' in d && seed.live) { copyText(liveCode(seed.live), 'Live code copied.'); return; }
    if ('docPaper' in d) { saved.ui.notes = { ...saved.ui.notes, paper: !notesView().paper }; save(); renderNotes(); return; }
    if (d.namesSet) { setNameStyle(d.namesSet as NameStyle); return; }
    if ('namesCopy' in d) {
      const text = namesText();
      if (!text) { toast('Nothing renamed yet.'); return; }
      const box = $('#namesText') as HTMLTextAreaElement;
      box.value = text;
      copyText(text, 'Your names are copied.', box);
      return;
    }
    if ('namesAdd' in d) { addNames(($('#namesText') as HTMLTextAreaElement).value); return; }
    if (d.undoEdit !== undefined) { snap(); editList()[Number(d.undoEdit)]?.undo(); save(); applyTheme(); rebuild(); renderAll(); return; }
    if ('resetEdits' in d) {
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'Tap again to put everything back'; return; }
      snap(); saved.edits = blankEdits(); saved.custom = []; save(); applyTheme(); rebuild(); renderAll(); toast('Everything is back to the original.', true);
      return;
    }
    if (d.markArea) {
      snap();
      const rows = checks.filter(c => c.region === d.markArea && counted(c));
      const all = rows.every(c => doneSet.has(c.id));
      for (const c of rows) { if (all) doneSet.delete(c.id); else doneSet.add(c.id); }
      save(); renderDial(); renderRail(); renderChecks();
      toast(all ? 'Area cleared.' : 'Area marked done.', true);
      return;
    }

    if (d.tab) { tab = d.tab as typeof tab; phoneView = 'rail'; renderRail(); renderTabs(); renderPane(); return; }
    if ('entrRegion' in d) {
      entrRegion = d.entrRegion || null; entrQuery = ''; phoneView = 'pane';
      renderRail(); renderTabs(); renderEntrances();
      $('#entrScroll')?.scrollTo(0, 0);
      return;
    }
    if (d.entr) { openPicker(d.entr); return; }
    if (d.pick) { pickDest(d.pick); return; }
    if (d.entrGame) { entrGame = d.entrGame as typeof entrGame; renderEntrances(); return; }
    if (d.entrDir) { entrDir = d.entrDir as typeof entrDir; renderEntrances(); return; }
    if ('hidefound' in d) { saved.ui.hideFound = !saved.ui.hideFound; save(); renderEntrances(); return; }
    if (d.kind) { if (entrKinds.has(d.kind)) entrKinds.delete(d.kind); else entrKinds.add(d.kind); renderEntrances(); return; }
    if ('openEntrSettings' in d) { openCats.add('entrances'); saved.ui.changesOnly = true; tab = 'settings'; renderRail(); renderTabs(); renderPane(); return; }
    if ('region' in d) {
      region = d.region || null; query = ''; typeFilter.clear(); phoneView = 'pane'; tab = 'list';
      if (saved.ui.checksView === 'map') { saved.ui.checksView = 'list'; save(); }
      renderRail(); renderTabs(); renderChecks();
      $('#listScroll')?.scrollTo(0, 0);
      return;
    }
    if ('back' in d) { phoneView = 'rail'; renderTabs(); return; }
    if (d.game) { gameFilter = d.game as typeof gameFilter; renderChecks(); return; }
    if ('hidedone' in d) { saved.ui.hideDone = !saved.ui.hideDone; save(); renderChecks(); return; }
    if (d.type) { if (typeFilter.has(d.type)) typeFilter.delete(d.type); else typeFilter.add(d.type); renderChecks(); return; }
    if (d.goto) { tab = d.goto as typeof tab; renderRail(); renderTabs(); renderPane(); return; }
    if (d.checksView) { saved.ui.checksView = d.checksView as 'list' | 'map'; save(); renderChecks(); return; }
    if ('logiconly' in d) { saved.ui.logicOnly = !saved.ui.logicOnly; save(); renderChecks(); return; }
    if ('logicToggle' in d) {
      saved.ui.logicOff = !saved.ui.logicOff;
      if (saved.ui.logicOff) { saved.ui.logicOnly = false; logicSeq++; logicBusy = false; } else scheduleLogic();
      save(); renderAll();
      return;
    }
    if (d.found) { openItemPicker(d.found); return; }
    if (d.pickItem) { logFound(pickingItemFor!, d.pickItem); return; }
    if (d.itemGame) { itemGame = d.itemGame as typeof itemGame; renderItems(); return; }
    if (d.pin) { togglePin(d.pin); return; }
    if ('savePins' in d) { setSavePins(!savingPins()); renderLook(); return; }
    if ('clearPins' in d) { clearPins(); renderLook(); toast('All items unpinned.'); return; }
    if ('haveonly' in d) { saved.ui.haveOnly = !saved.ui.haveOnly; save(); renderItems(); return; }
    if (d.item) {
      const i = catalogById().get(d.item);
      if (!i) return;
      snap();
      const n = countOf(i);
      setItemCount(i.id, n >= i.max ? i.start : n + 1);
      afterItemChange();
      return;
    }
    if (d.itemMinus) { const i = catalogById().get(d.itemMinus); if (i) { snap(); setItemCount(i.id, countOf(i) - 1); afterItemChange(); } return; }
    if ('clearItems' in d) {
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'Tap again to clear'; return; }
      snap(); seed.have = {}; seed.found = {}; afterItemChange(); toast('Items cleared on this seed.', true);
      return;
    }

    if (el.classList.contains('tick-btn')) {
      const row = el.closest<HTMLElement>('.row')!;
      const id = row.dataset.id!;
      snap();
      const nowDone = !doneSet.has(id);
      if (nowDone) doneSet.add(id); else doneSet.delete(id);
      el.setAttribute('aria-pressed', String(nowDone));
      row.classList.toggle('done', nowDone);
      row.classList.toggle('stamp', nowDone);
      save();
      renderDial();
      renderRail();
      const entry = checks.find(c => c.id === id);
      const counter = entry && document.querySelector<HTMLElement>(`[data-count="${CSS.escape(entry.region)}"]`);
      if (counter) {
        const inRegion = checks.filter(c => c.region === entry.region && counted(c));
        counter.textContent = `${inRegion.filter(c => doneSet.has(c.id)).length}/${inRegion.length}`;
      }
      if (saved.ui.hideDone && nowDone) setTimeout(() => { row.remove(); }, 260);
      return;
    }
    if (el.classList.contains('skip')) {
      const id = el.closest<HTMLElement>('.row')!.dataset.id!;
      snap();
      if (skipSet.has(id)) skipSet.delete(id); else { skipSet.add(id); toast('Skipped. It no longer counts toward this seed.', true); }
      save(); renderDial(); renderRail(); renderChecks();
      return;
    }
    if (d.skipRegion !== undefined) {
      const r = d.skipRegion;
      snap();
      seed.skippedRegions = seed.skippedRegions.includes(r) ? seed.skippedRegions.filter(x => x !== r) : [...seed.skippedRegions, r];
      save(); renderAll();
      return;
    }

    /* Settings */
    if (d.bool) return setSetting(d.bool, !S[d.bool]);
    if (d.trick) { const k = d.trick; return setSettingsRaw(s => { s.tricks = s.tricks.includes(k) ? s.tricks.filter((x: string) => x !== k) : [...s.tricks, k]; }); }
    if (d.cond) { const [k, f] = [d.cond, d.val!]; return setSettingsRaw(s => { s.specialConds[k][f] = !s.specialConds[k][f]; s.specialConds[k].count = Math.min(s.specialConds[k].count, condMax(k, s)); }); }
    if (d.junkDel) { const k = d.junkDel; return setSettingsRaw(s => { s.junkLocations = s.junkLocations.filter((x: string) => x !== k); }); }
    if ('junkAdd' in d) {
      const v = ($('#junkAdd') as HTMLInputElement).value.trim();
      const c = lastResult?.checks.find(x => `${x.regionName}: ${x.name}` === v || x.id === v);
      if (!c) return toast('Pick a check from the list.');
      return setSettingsRaw(s => { s.junkLocations = [...s.junkLocations, c.id]; });
    }
    if (d.setmode) {
      const m = d.mode!;
      return setSetting(d.setmode, m === 'specific' ? { type: 'specific', values: S[d.setmode]?.values ?? [] } : { type: m });
    }
    if (d.setval) {
      const cur: string[] = S[d.setval].values ?? [];
      return setSetting(d.setval, { type: 'specific', values: cur.includes(d.val!) ? cur.filter(x => x !== d.val) : [...cur, d.val!] });
    }
    if (d.rolled) {
      const cur = seed.rolled[d.rolled] ?? [];
      if (ROLLED_CHOICES.includes(d.rolled)) seed.rolled[d.rolled] = cur[0] === d.val ? [] : [d.val!];
      else seed.rolled[d.rolled] = cur.includes(d.val!) ? cur.filter(x => x !== d.val) : [...cur, d.val!];
      save(); renderSettings(); recompute();
      return;
    }
    if (d.precomplete) {
      const key = d.precomplete;
      const mine = seed.preCompleted ?? [];
      const on = !mine.includes(key);
      seed.preCompleted = on ? [...mine, key] : mine.filter(x => x !== key);
      const regions = new Set((lastResult?.checks ?? []).filter(c => c.dungeonKey === key).map(c => c.region));
      seed.skippedRegions = on ? [...new Set([...seed.skippedRegions, ...regions])] : seed.skippedRegions.filter(r => !regions.has(r));
      save(); renderSettings(); scheduleLogic();
      return;
    }
    if ('rollNone' in d) { for (const k of rolling()) if (!ROLLED_CHOICES.includes(k)) seed.rolled[k] ??= []; save(); renderChecks(); return; }
    if (d.changes) { saved.ui.changesOnly = d.changes === '1'; save(); renderSettings(); return; }
    if ('showlocked' in d) { saved.ui.showLocked = !saved.ui.showLocked; save(); renderAll(); return; }
    if ('import' in d) return applyImport(($('#importText') as HTMLTextAreaElement).value);
    if ('copySettings' in d) { copyText(seed.settings, 'Settings string copied.', $('#importText') as HTMLTextAreaElement); return; }
    if ('defaults' in d) {
      S = makeSettings({}); seed.settings = exportSettings(S); seed.rolled = {}; seed.preCompleted = [];
      save(); recompute(); toast('Settings are back to OoTMM defaults.');
      return;
    }

    /* Seeds */
    if ('new' in d || 'dupe' in d) {
      const n = newSeed(`Seed ${saved.seeds.length + 1}`, 'dupe' in d ? seed.settings : undefined);
      if ('dupe' in d) { n.rolled = { ...seed.rolled }; n.preCompleted = [...seed.preCompleted ?? []]; }
      save();
      saved.seeds.push(n);
      openSeed(n.id);
      save();
      return;
    }
    if (d.open) { save(); openSeed(d.open); tab = 'list'; phoneView = 'rail'; save(); return; }
    if (d.rename) {
      const s = saved.seeds.find(x => x.id === d.rename)!;
      const row = el.closest('.seed')!;
      row.innerHTML = `<input type="text" id="renameBox" aria-label="Seed name" value="${esc(s.name)}"><div class="btns"><button class="btn" data-rename-save="${s.id}">Save</button></div>`;
      ($('#renameBox') as HTMLInputElement).select();
      return;
    }
    if (d.renameSave) {
      const s = saved.seeds.find(x => x.id === d.renameSave)!;
      s.name = ($('#renameBox') as HTMLInputElement).value.trim() || s.name;
      save(); renderDial(); renderSeeds();
      return;
    }
    if (d.del) {
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'Tap again to delete'; return; }
      saved.seeds = saved.seeds.filter(x => x.id !== d.del);
      if (seed.id === d.del) openSeed(saved.seeds[0].id); else renderSeeds();
      save();
      return;
    }
    if ('reset' in d) {
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'Tap again to clear'; return; }
      snap();
      doneSet.clear(); skipSet.clear(); seed.skippedRegions = []; seed.entrances = {}; seed.notes = {}; seed.found = {}; seed.have = {}; seed.hints = {};
      save(); renderAll(); toast('Progress cleared on this seed.', true);
      return;
    }
    if ('copycode' in d) {
      save();
      copyText(makeTransferCode(seed), 'Transfer code copied.', $('#codeBox') as HTMLTextAreaElement);
      return;
    }
    if ('readcode' in d) {
      try {
        const n = readTransferCode(($('#codeBox') as HTMLTextAreaElement).value);
        const mine = saved.seeds.find(x => (x.origin ?? x.id) === n.origin);
        save();
        if (mine) Object.assign(mine, { settings: n.settings, done: n.done, skipped: n.skipped, skippedRegions: n.skippedRegions, rolled: n.rolled, preCompleted: n.preCompleted ?? [], entrances: n.entrances, notes: n.notes, pad: n.pad, doc: n.doc, found: n.found, have: n.have, hints: n.hints, updated: n.updated });
        else saved.seeds.push(n);
        openSeed((mine ?? n).id);
        save();
        toast(mine ? `Updated ${mine.name} with the newer progress.` : `Added ${n.name}.`);
      } catch (err: any) { toast(err.message ?? "That code couldn't be read."); }
      return;
    }
  });
}

function boot() {
  const source = document.currentScript?.textContent ?? '';
  const start = () => {
    saved = load();
    applyTheme();
    shell();
    applyText();
    events();
    if (source) { startWorker(source, 'checks'); startWorker(source, 'logic'); }
    openSeed(saved.current);
    connectHostedStore();
    if (saved.seeds.some(s => s.live)) useFirebase();
    /* Ask the browser to keep this site's storage instead of clearing it when space runs low. */
    navigator.storage?.persist?.().catch(() => {});
    addEventListener('pagehide', flushSave);
    addEventListener('beforeunload', flushSave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
    if (__TARGET__ === 'web' && 'serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
