/* Directions: routes go only through entrances the player logged (or ones the settings leave alone). */
import { compute, enableFastMode } from '../src/engine/engine';
import { computeLogic } from '../src/engine/logic';
import { findRoute, findRoutes, pickRoute, searchPlaces, areasIn, leadsTo } from '../src/directions';

enableFastMode();
let fail = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const show = (ways: any, steps: any[] | null) => steps ? steps.map((s, i) => `  ${i + 1}. ${s.kind} ${s.door ?? ''} ${s.from ? ways.places[s.from]?.[0] : ''} -> ${ways.places[s.to]?.[0]}`).join('\n') : '  (no route)';

/* No shuffle: every entrance goes where it always does. */
{
  const r = await compute({});
  const ways = r.entrances.ways!;
  console.log('areas', Object.keys(ways.areas).length, 'places', Object.keys(ways.places).length, 'doors', Object.keys(ways.doors).length, 'bytes', JSON.stringify(ways).length);
  const find = (t: string) => searchPlaces(ways, t)[0];
  const kf = find('Kokiri Forest'), lh = find("Link's House"), fire = find('Fire Temple'), ct = find('Clock Town');
  ok(!!kf && !!lh && !!fire, `places found: ${kf} ${lh} ${fire} ${ct}`);
  const shuffled = new Set<string>();
  const route = (from: string, to: string, extra: any = {}) => findRoute(ways, { start: areasIn(ways, from), goal: to, logged: {}, shuffled, ...extra });
  let s = route(lh, fire);
  console.log(show(ways, s));
  ok(!!s && s.length > 3, "Link's House to Fire Temple, vanilla");
  s = route(kf, ct);
  console.log(show(ways, s));
  ok(!!s, 'Kokiri Forest to Clock Town, vanilla (through the link between the games)');
  ok(route(kf, kf)!.length === 0, 'already there');
  const all = findRoutes(ways, { start: areasIn(ways, kf), goal: fire, logged: {}, shuffled })!;
  const keys = all.map(r => r.flatMap((x: any) => x.door ? [x.door] : []).join('|'));
  console.log(all.map(r => show(ways, r)).join('\n  --\n'));
  ok(all.length > 1 && new Set(keys).size === all.length, `other ways to the Fire Temple: ${all.length}, all different`);
  ok(pickRoute(all, keys[1].split('|')) === 1, 'the picked way is kept');
}

/* Interiors shuffled: a closed door stays closed until logged. */
{
  const r = await compute({ erIndoors: 'full', erIndoorsMajor: true });
  const ways = r.entrances.ways!;
  const list = r.entrances.list.filter(e => !e.fixed);
  const shuffled = new Set(list.map(e => e.id));
  const lh = searchPlaces(ways, "Saria's House")[0], kf = searchPlaces(ways, 'Kokiri Forest')[0];
  const mido = searchPlaces(ways, "Mido's House")[0];
  ok(shuffled.has('OOT_HOUSE_SARIA'), "Saria's House door is shuffled");
  ok(findRoute(ways, { start: areasIn(ways, kf), goal: lh, logged: {}, shuffled }) === null, "unlogged: no way into Saria's House");
  /* The player logs that Mido's door leads into Link's House. */
  const logged = { OOT_HOUSE_MIDO: 'OOT_HOUSE_SARIA' };
  const s = findRoute(ways, { start: areasIn(ways, kf), goal: lh, logged, shuffled });
  console.log(show(ways, s));
  ok(!!s && s.length === 1 && s[0].kind === 'door' && (s[0] as any).door === 'OOT_HOUSE_MIDO', "logged Mido's door takes you into Saria's House");
  ok(findRoute(ways, { start: areasIn(ways, kf), goal: mido, logged, shuffled }) === null, "Mido's House itself still closed");
  /* Never through anything unlogged. */
  let bad = 0;
  for (const goal of Object.keys(ways.places).slice(0, 400)) {
    const st = findRoute(ways, { start: areasIn(ways, kf), goal, logged, shuffled });
    for (const x of st ?? []) if (x.kind !== 'walk' && shuffled.has(x.door) && !(x.door in logged)) bad++;
  }
  ok(bad === 0, 'no route uses an unlogged shuffled entrance');
  ok(leadsTo(ways, 'OOT_HOUSE_SARIA', { logged: { OOT_HOUSE_SARIA: 'text:somewhere' }, shuffled }) === null, "the player's own words lead nowhere known");
}

/* Back to the spawn: save and reset from anywhere, as the age Link is. */
{
  const r = await compute({});
  const ways = r.entrances.ways!;
  const spawns = r.entrances.list.filter(e => e.kind === 'Spawns');
  ok(spawns.length === 2 && spawns.every(e => e.fixed), `unshuffled spawns still listed: ${spawns.map(e => e.title + ' / ' + e.sub).join('; ')}`);
  const find = (t: string) => searchPlaces(ways, t)[0];
  const lh = find("Link's House"), tot = find('Temple of Time'), dmc = find('Death Mountain Crater'), zd = find("Zora's Domain");
  const all: Record<string, number> = {};
  const none = await computeLogic({ settings: {}, entrances: {}, items: {} });
  for (const i of none.catalog) all[i.id] = i.max;
  const full = await computeLogic({ settings: {}, entrances: {}, items: all });
  const ask = (goal: string, age: any, start = dmc, rules: any = full.travel) => findRoute(ways, { start: areasIn(ways, start), goal, age, logged: {}, shuffled: new Set<string>(), rules });
  const a = ask(lh, 'child', zd);
  console.log(show(ways, a));
  ok(!!a && a.length === 1 && a[0].kind === 'warp' && (a[0] as any).door === 'OOT_SPAWN_CHILD', "child far away: back to the child spawn at Link's House");
  const b = ask(tot, 'adult');
  ok(!!b && b.length === 1 && (b[0] as any).door === 'OOT_SPAWN_ADULT', 'adult: back to the adult spawn at the Temple of Time');
  const c = ask(lh, 'adult', zd);
  ok(!!c && !c.some(x => (x as any).door === 'OOT_SPAWN_CHILD'), 'adult never uses the child spawn');
  const d = findRoute(ways, { start: areasIn(ways, zd), goal: lh, age: 'child', logged: {}, shuffled: new Set<string>() });
  ok(!!d && d.length === 1, 'without item rules too');
  /* A shuffled spawn leads only where the player logged it. */
  const sh = await compute({ erSpawns: 'both' } as any);
  const w2 = sh.entrances.ways!;
  const shuf = new Set(sh.entrances.list.filter(e => !e.fixed).map(e => e.id));
  const e1 = findRoute(w2, { start: areasIn(w2, zd), goal: lh, age: 'child', logged: {}, shuffled: shuf });
  ok(!e1?.some(x => (x as any).door === 'OOT_SPAWN_CHILD'), 'unlogged shuffled spawn is never used');
}

/* Warp songs only with the song. */
{
  const r = await compute({});
  const ways = r.entrances.ways!;
  const kf = searchPlaces(ways, 'Kokiri Forest')[0], meadow = searchPlaces(ways, 'Sacred Forest Meadow')[0];
  const ask = { start: areasIn(ways, searchPlaces(ways, 'Desert Colossus')[0]), goal: meadow, logged: {}, shuffled: new Set<string>() };
  const a = findRoute(ways, ask), b = findRoute(ways, { ...ask, canWarp: id => id === 'OOT_WARP_SONG_MEADOW' });
  console.log(show(ways, b));
  ok(!!a && !a.some(x => x.kind === 'warp' && /SONG/.test(x.door)), 'no song: no warp song (going back to spawn is fine)');
  ok(!!b && b.length === 1 && b[0].kind === 'warp', 'with Minuet: one warp');
  void kf;
}
/* With OoTMM's rules: items and age. */
{
  const r = await compute({});
  const ways = r.entrances.ways!;
  const find = (t: string) => searchPlaces(ways, t)[0];
  const kf = find('Kokiri Forest'), fire = find('Fire Temple'), ct = find('Clock Town'), dmc = find('Death Mountain Crater');
  const none = await computeLogic({ settings: {}, entrances: {}, items: {} });
  const shuffled = new Set<string>();
  const ask = (rules: any, goal: string, age: any = 'child', start = kf) => findRoute(ways, { start: areasIn(ways, start), goal, age, logged: {}, shuffled, rules });
  ok(!!none.travel && Object.keys(none.travel.pass).length > 100, `rules came back: ${Object.keys(none.travel?.pass ?? {}).length} limited ways`);
  ok(ask(none.travel, fire) === null, 'no items: no way to the Fire Temple');
  /* Every item there is. */
  const all: Record<string, number> = {};
  for (const i of none.catalog) all[i.id] = i.max;
  const full = await computeLogic({ settings: {}, entrances: {}, items: all });
  const s1 = ask(full.travel, fire);
  console.log(show(ways, s1));
  ok(!!s1 && s1.some(x => x.kind === 'age' && x.to === 'adult'), 'as child with everything: becomes adult on the way to the Fire Temple');
  const s2 = ask(full.travel, fire, 'adult');
  console.log(show(ways, s2));
  ok(!!s2 && !s2.some(x => x.kind === 'age'), 'as adult: no age change');
  const s3 = ask(full.travel, ct);
  ok(!!s3, 'to Clock Town with everything');
  const s4 = ask(full.travel, dmc, null);
  ok(!!s4, 'age unknown still finds a way');
  /* A child-only road is never taken as adult, and the reverse. */
  let bad = 0;
  for (const goal of Object.keys(ways.places).slice(0, 150)) for (const age of ['child', 'adult']) {
    const st = ask(full.travel, goal, age);
    if (!st) continue;
    let g = age === 'adult' ? 2 : 1;
    for (const x of st) {
      if (x.kind === 'age') g = x.to === 'adult' ? 2 : 1;
      if (x.kind === 'door') { const [from, to] = ways.doors[x.door]; const m = full.travel!.pass[from + '\n' + to]; if (m !== undefined && !(m & g)) bad++; }
    }
  }
  ok(bad === 0, 'no door taken by an age its rule shuts out');
}
/* Tricks and glitches: directions count every one the game allows, whatever the seed's logic settings say, each only
   with its items. Reachable checks stay on the seed's own logic settings. */
{
  const { TRICKS } = await import('@ootmm/core') as any;
  const r = await compute({});
  const ways = r.entrances.ways!;
  const base = await computeLogic({ settings: {}, entrances: {}, items: {} });
  const all: Record<string, number> = {};
  for (const i of base.catalog) all[i.id] = i.max;
  const plain = await computeLogic({ settings: { tricks: [] }, entrances: {}, items: all });
  const loose = { tricks: Object.keys(TRICKS) };
  const tricky = await computeLogic({ settings: loose as any, entrances: {}, items: all });
  const closed = (t: any) => Object.values(t.pass).reduce((n: number, m: any) => n + (2 - ((m & 1) + ((m >> 1) & 1))), 0);
  console.log('ways closed to an age, no tricks in logic:', closed(plain.travel), 'every trick in logic:', closed(tricky.travel));
  ok(closed(plain.travel) === closed(tricky.travel), 'directions are the same whatever tricks the logic settings turn on');
  const few = Object.fromEntries(Object.entries(all).filter(([id]) => /OCARINA|BOMB_BAG|SHIELD|STICK|NUTS|SLINGSHOT/.test(id)));
  const [fewPlain, fewTricky] = await Promise.all([computeLogic({ settings: { tricks: [] }, entrances: {}, items: few }), computeLogic({ settings: loose as any, entrances: {}, items: few })]);
  ok(fewPlain.reach.length < fewTricky.reach.length, `reachable checks still follow the logic settings (${fewPlain.reach.length} without tricks, ${fewTricky.reach.length} with every trick)`);
  ok(closed(fewPlain.travel) === closed(fewTricky.travel), 'and directions with few items are the same either way');
  const aids = Object.entries(plain.travel!.aids ?? {});
  console.log('ways that need a trick or glitch, with no tricks in the logic settings:', aids.length);
  for (const [k, v] of aids.slice(0, 6)) console.log('  ', k.replace('\n', ' -> '), JSON.stringify(v));
  ok(aids.length > 50, 'tricks and glitches open ways with none in the logic settings');
  ok(aids.some(([, v]) => v.some(a => a?.use.some(u => /glitch/.test(u)))), 'glitches are named as glitches');
  ok(aids.some(([, v]) => v.some(a => a?.use.some(u => /Megaflip/.test(u)) && a.items.some(i => /Bomb/.test(i)))), 'a megaflip names the bombs');
  ok(!aids.some(([, v]) => v.some(a => a?.use.some(u => /^Hookshot Anywhere/.test(u)))), 'Hookshot Anywhere off in the game: never used');
  const hooked = await computeLogic({ settings: { tricks: [], hookshotAnywhereOot: 'enabled' } as any, entrances: {}, items: all });
  ok(Object.values(hooked.travel!.aids ?? {}).some(v => v.some(a => a?.use.includes('Hookshot Anywhere') && a.items.some(i => /Hookshot|Longshot/.test(i)))), 'Hookshot Anywhere on in the game (not in logic): used, naming the Hookshot');
  /* Some place is reached in fewer steps than plain walking. */
  const shuffled = new Set<string>();
  let named = '';
  for (const goal of Object.keys(ways.places)) {
    for (const age of ['child', 'adult'] as const) {
      const st = findRoute(ways, { start: areasIn(ways, 'OOT_KOKIRI_FOREST'), goal, age, logged: {}, shuffled, rules: plain.travel });
      const u = st?.find(x => x.uses?.length);
      if (u) { named = `${ways.places[goal][0]} as ${age}: ${u.uses!.map(a => (a.any ? 'one of ' : '') + a.use.join(', ') + (a.items.length ? ' with ' + a.items.join(', ') : '')).join('; ')}`; break; }
    }
    if (named) break;
  }
  ok(!!named, `a step names what it uses: ${named}`);
  /* Only with what it needs: without Bombs, no bomb hover. */
  const noBombs = Object.fromEntries(Object.entries(all).filter(([id]) => !/BOMB/.test(id)));
  const unbombed = await computeLogic({ settings: {}, entrances: {}, items: noBombs });
  const flips = Object.values(unbombed.travel!.aids ?? {}).filter(v => v.some(a => a?.use.some(u => /Megaflip/.test(u)) && !a.any)).length;
  ok(flips === 0, `no Bombs: no step uses a megaflip (${flips})`);
  ok(closed(unbombed.travel) > closed(plain.travel), 'no Bombs: fewer ways open');
  /* With no items at all, no glitch that needs one. */
  const bare = Object.values(base.travel!.aids ?? {}).flatMap(v => v.filter(Boolean)) as any[];
  ok(bare.every(a => !a.items.some((i: string) => /Bomb|Hookshot|Hover Boots/.test(i))), `no items: no step names an item you don't have (${bare.length} ways with a trick)`);
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
