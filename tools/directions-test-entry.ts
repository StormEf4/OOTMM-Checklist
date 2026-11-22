/* Directions: routes go only through entrances the player logged (or ones the settings leave alone). */
import { compute, enableFastMode } from '../src/engine/engine';
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

/* Warp songs only with the song. */
{
  const r = await compute({});
  const ways = r.entrances.ways!;
  const kf = searchPlaces(ways, 'Kokiri Forest')[0], meadow = searchPlaces(ways, 'Sacred Forest Meadow')[0];
  const ask = { start: areasIn(ways, searchPlaces(ways, 'Desert Colossus')[0]), goal: meadow, logged: {}, shuffled: new Set<string>() };
  const a = findRoute(ways, ask), b = findRoute(ways, { ...ask, canWarp: id => id === 'OOT_WARP_SONG_MEADOW' });
  console.log(show(ways, b));
  ok(!!a && !a.some(x => x.kind === 'warp'), 'no song: walks');
  ok(!!b && b.length === 1 && b[0].kind === 'warp', 'with Minuet: one warp');
  void kf;
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
