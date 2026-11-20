/*
 * Game tracking: listens to the OoTMM Client, OoTMM's own co-op program, which reads the game in Project64-EM.
 *
 * The Client shares what happens in the game on this PC only, at http://127.0.0.1:39278: GET /clients lists the games
 * it's connected to, and /clients/<id>/events is a websocket of JSON messages. INFO_ITEM says which check the player just
 * got and what was there, by OoTMM's own check and item names, read from the seed's patch file. The checklist only
 * listens; it never takes over the emulator's connection, so co-op keeps working alongside it.
 *
 * INFO_ENTRANCE says the player just went through a loading zone: the door they used (original, by OoTMM's name for its
 * normal destination) and where it really took them (entrance). They're passed on only when the player turned on
 * logging entrances as they walk through them (owner's choice, Nov 20 2026). Each message is one door the player has
 * just used, so nothing they haven't been through is ever filled in.
 */

export type GameItem = { location: string; item: string; self: boolean; session: string };
/** original is empty when the game didn't go through a door (a void, a savewarp, Song of Time, Farore's Wind...). */
export type GameEntrance = { original: string; entrance: string; age: string; session: string };
/** none: the OoTMM Client isn't running. client: it is, but no game has reported in yet. game: a game is playing. */
export type GameLink = 'none' | 'client' | 'game';
export type GameFeedHandlers = {
  item(m: GameItem): void;
  /** Only given when the player wants entrances logged. */
  entrance?(m: GameEntrance): void;
  /** A game started: its session id and the save file's name, which the catch-up uses to pick the right save slot. */
  start?(m: { session: string; player: string }): void;
  status(link: GameLink): void;
};

const DEFAULT_URL = 'http://127.0.0.1:39278';
const POLL_MS = 3000;

export function startGameFeed(on: GameFeedHandlers) {
  const base: string = (globalThis as any).__OOTMM_GAME_FEED_URL__ ?? DEFAULT_URL;
  const sockets = new Map<string, WebSocket>();
  const sessions = new Map<string, string>();
  let stopped = false;
  let timer = 0;
  let clientUp = false;
  let lastStatus: GameLink | null = null;
  /* The Client only says GAME_START to listeners already there, so a game that started first shows up with its first item. */
  const status = () => {
    const now: GameLink = sessions.size ? 'game' : clientUp ? 'client' : 'none';
    if (now !== lastStatus) { lastStatus = now; on.status(now); }
  };

  function listen(id: string) {
    if (sockets.has(id)) return;
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/clients/${encodeURIComponent(id)}/events`);
    sockets.set(id, ws);
    ws.onmessage = e => {
      let m: any;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'GAME_START') { sessions.set(id, String(m.sessionId ?? '')); status(); on.start?.({ session: String(m.sessionId ?? ''), player: String(m.playerName ?? '') }); }
      else if (m.type === 'GAME_END') { sessions.delete(id); status(); }
      else if (m.type === 'INFO_ITEM') {
        /* The Client connects to the game a moment before saying GAME_START, so an early item still counts. */
        if (!sessions.has(id)) { sessions.set(id, ''); status(); }
        if (typeof m.location === 'string' && m.location) {
          on.item({ location: m.location, item: typeof m.item === 'string' ? m.item : '', self: m.self !== false, session: sessions.get(id) ?? '' });
        }
      }
      else if (m.type === 'INFO_ENTRANCE' && on.entrance) {
        if (!sessions.has(id)) { sessions.set(id, ''); status(); }
        if (typeof m.entrance === 'string' && m.entrance) {
          on.entrance({ original: typeof m.original === 'string' ? m.original : '', entrance: m.entrance, age: String(m.age ?? ''), session: sessions.get(id) ?? '' });
        }
      }
    };
    ws.onclose = () => { sockets.delete(id); sessions.delete(id); status(); };
    ws.onerror = () => ws.close();
  }

  async function poll() {
    if (stopped) return;
    try {
      const r = await fetch(`${base}/clients`, { cache: 'no-store' });
      const j = await r.json();
      const ids: string[] = (j?.clients ?? []).map((c: any) => String(c?.id ?? '')).filter(Boolean);
      clientUp = true;
      for (const id of ids) listen(id);
      for (const [id, ws] of sockets) if (!ids.includes(id)) ws.close();
    } catch {
      /* The Client isn't running. Nothing to do until it is. */
      clientUp = false;
      for (const ws of sockets.values()) ws.close();
    }
    status();
    if (!stopped) timer = window.setTimeout(poll, POLL_MS);
  }
  poll();

  return function stop() {
    stopped = true;
    clearTimeout(timer);
    for (const ws of sockets.values()) { ws.onclose = null; ws.close(); }
    sockets.clear();
    sessions.clear();
    if (lastStatus && lastStatus !== 'none') on.status('none');
    lastStatus = 'none';
  };
}
