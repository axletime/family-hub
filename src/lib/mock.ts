import 'server-only';
import type { ArrKind } from './config';
import type { LookupItem, LibraryEntry, ArrOptions } from './arr';
import type { CalendarItem, HaEntity, QueueItem, RecentItem } from './types';
import { toEntity } from './ha';

/**
 * Demo mode: realistic mock data so the UI can be previewed without any real
 * services. Enabled with DEMO_MODE=true. Artwork is generated SVG, so no
 * internet access is needed either.
 */

const COLOURS = ['#1B4F8A', '#2E7D5B', '#8A3B1B', '#6B3FA0', '#A0346B', '#B07D1A', '#2B7A8C', '#4A5568'];

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export function demoPoster(title: string, square = false): string {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c1 = COLOURS[h % COLOURS.length];
  const c2 = COLOURS[(h >> 3) % COLOURS.length];
  const w = 300;
  const hgt = square ? 300 : 450;
  const words = title.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w2 of words) {
    if ((line + ' ' + w2).trim().length > 14) {
      if (line) lines.push(line);
      line = w2;
    } else line = (line + ' ' + w2).trim();
  }
  if (line) lines.push(line);
  const text = lines
    .slice(0, 4)
    .map((l, i) => `<text x="150" y="${hgt / 2 - (lines.length - 1) * 18 + i * 36}" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${esc(l)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}" stop-opacity="0.75"/></linearGradient></defs><rect width="100%" height="100%" fill="#0b1220"/><rect width="100%" height="100%" fill="url(#g)"/>${text}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

interface DemoItem {
  externalId: string;
  title: string;
  year: number | null;
  overview: string;
  meta: string;
}

const MOVIES: DemoItem[] = [
  { externalId: '1001', title: 'The Highland Line', year: 2025, overview: 'A retired railway engineer returns to the Scottish Highlands to save the branch line that once connected his village to the world.', meta: '118 min · Drama' },
  { externalId: '1002', title: 'Starfall Protocol', year: 2026, overview: 'When a decommissioned satellite begins broadcasting coordinates, a small crew races to reach it before anyone else.', meta: '134 min · Science Fiction, Thriller' },
  { externalId: '1003', title: 'Paddington in Peru', year: 2024, overview: 'Paddington travels to Peru to visit his beloved Aunt Lucy, but a mystery plunges the Brown family into an unexpected adventure.', meta: '106 min · Family, Comedy' },
  { externalId: '1004', title: 'The Lighthouse Keeper', year: 2023, overview: 'On a remote island off Orkney, a young keeper uncovers letters that rewrite the history of the lighthouse.', meta: '101 min · Mystery' },
  { externalId: '1005', title: 'Glasgow Nights', year: 2025, overview: 'Three friends, one night, and a city that never quite lets them go.', meta: '97 min · Comedy, Drama' },
  { externalId: '1006', title: 'Ocean Deep', year: 2022, overview: 'A documentary journey into the least explored places on Earth, narrated by a beloved naturalist.', meta: '89 min · Documentary' },
  { externalId: '1007', title: 'Dragon Rider Academy', year: 2026, overview: 'A shy apprentice discovers she can talk to the oldest dragon in the kingdom.', meta: '112 min · Animation, Fantasy' },
  { externalId: '1008', title: 'Midnight Express Delivery', year: 2024, overview: 'A courier with a strict no-questions policy finally opens one of his packages.', meta: '104 min · Action' },
  { externalId: '1009', title: 'The Last Ceilidh', year: 2021, overview: 'A small-town dance hall faces closure, and the community rallies for one final night.', meta: '95 min · Comedy, Music' },
  { externalId: '1010', title: 'Quantum Garden', year: 2026, overview: 'A botanist discovers that her greenhouse exists in two timelines at once.', meta: '121 min · Science Fiction' },
  { externalId: '1011', title: 'The Bear Who Came to Tea', year: 2025, overview: 'A family’s quiet Sunday is turned upside down when a very polite bear knocks on the door.', meta: '92 min · Family, Animation' },
  { externalId: '1012', title: 'Coastal Path', year: 2024, overview: 'Two estranged sisters walk the Cornish coast to scatter their mother’s ashes, and discover what she never told them.', meta: '109 min · Drama' },
  { externalId: '1013', title: 'Penguin Patrol', year: 2026, overview: 'A team of Antarctic researchers adopt an orphaned penguin chick in this heartwarming true story.', meta: '98 min · Family, Documentary' },
  { externalId: '1014', title: 'Iron Tide', year: 2025, overview: 'A North Sea oil rig crew fight to survive the storm of the century.', meta: '127 min · Action, Thriller' },
  { externalId: '1015', title: 'The Wizard’s Apprentice', year: 2026, overview: 'A clumsy apprentice must finish her master’s greatest spell before midsummer.', meta: '115 min · Fantasy, Family' },
  { externalId: '1016', title: 'Murder at Ravenscourt', year: 2025, overview: 'A snowbound country house, a family reunion and a body in the library. Classic whodunnit fun.', meta: '106 min · Mystery, Comedy' },
  { externalId: '1017', title: 'Edge of the Map', year: 2024, overview: 'An explorer retraces her grandfather’s doomed Arctic expedition.', meta: '119 min · Adventure' },
  { externalId: '1018', title: 'Robots of Rothesay', year: 2026, overview: 'On the Isle of Bute, a lonely inventor builds a friend, then twelve more.', meta: '94 min · Comedy, Science Fiction' },
];

const SHOWS: DemoItem[] = [
  { externalId: '2001', title: 'Loch Ness Detectives', year: 2024, overview: 'Two mismatched detectives investigate strange happenings around Loch Ness.', meta: 'BBC One · 2 seasons · Continuing' },
  { externalId: '2002', title: 'The Great Bake Off', year: 2010, overview: 'Amateur bakers compete in a series of rounds to be crowned the best amateur baker.', meta: 'Channel 4 · 15 seasons · Continuing' },
  { externalId: '2003', title: 'Orbital', year: 2025, overview: 'Life aboard the first commercial space station is anything but routine.', meta: 'Apple TV+ · 1 season · Continuing' },
  { externalId: '2004', title: 'Bluey', year: 2018, overview: 'An inexhaustible six-year-old Blue Heeler dog loves to turn everyday family life into extraordinary adventures.', meta: 'ABC Kids · 3 seasons · Continuing' },
  { externalId: '2005', title: 'Shetland', year: 2013, overview: 'Detectives solve crimes in the remote and close-knit communities of the Shetland Isles.', meta: 'BBC One · 9 seasons · Continuing' },
  { externalId: '2006', title: 'Northern Lights', year: 2023, overview: 'A family-run hotel in Tromsø hides secrets as dark as the polar night.', meta: 'Netflix · 2 seasons · Ended' },
  { externalId: '2007', title: 'Robot Wars Reloaded', year: 2026, overview: 'Home-built robots fight it out in the arena once more.', meta: 'BBC Two · 1 season · Continuing' },
  { externalId: '2008', title: 'The Crown Estate', year: 2022, overview: 'A sweeping drama about the staff of a grand country house.', meta: 'ITV · 3 seasons · Ended' },
  { externalId: '2009', title: 'Vera', year: 2011, overview: 'DCI Vera Stanhope, a tenacious detective in Northumberland, solves crimes with her own unique style.', meta: 'ITV · 14 seasons · Ended' },
  { externalId: '2010', title: 'Hebridean Hearts', year: 2025, overview: 'A city doctor takes over the only surgery on a tiny Hebridean island.', meta: 'BBC One · 2 seasons · Continuing' },
  { externalId: '2011', title: 'The Repair Shed', year: 2017, overview: 'Expert craftspeople bring treasured family heirlooms back to life.', meta: 'BBC One · 12 seasons · Continuing' },
  { externalId: '2012', title: 'Puffin Rock Adventures', year: 2024, overview: 'Oona the puffin and her little brother Baba explore their island home.', meta: 'CBeebies · 3 seasons · Continuing' },
  { externalId: '2013', title: 'Deep Water Station', year: 2026, overview: 'Mysteries pile up at a remote research base on the seabed of the North Atlantic.', meta: 'Channel 4 · 1 season · Continuing' },
  { externalId: '2014', title: 'Taskmaster Junior', year: 2025, overview: 'Young comedians take on absurd challenges set by a stern judge.', meta: 'Channel 4 · 2 seasons · Continuing' },
  { externalId: '2015', title: 'Line of Inquiry', year: 2023, overview: 'An anti-corruption unit investigates a police force with something to hide.', meta: 'BBC One · 3 seasons · Continuing' },
  { externalId: '2016', title: 'Grand Designs: Scotland', year: 2026, overview: 'Ambitious self-builders take on the Highlands weather.', meta: 'Channel 4 · 1 season · Continuing' },
];

const ARTISTS: DemoItem[] = [
  { externalId: 'a-3001', title: 'Biffy Clyro', year: null, overview: 'Scottish rock band formed in Kilmarnock, East Ayrshire.', meta: 'Group · Alternative Rock' },
  { externalId: 'a-3002', title: 'Lewis Capaldi', year: null, overview: 'Scottish singer-songwriter from Glasgow.', meta: 'Person · Pop' },
  { externalId: 'a-3003', title: 'CHVRCHES', year: null, overview: 'Scottish synth-pop band from Glasgow.', meta: 'Group · Synth-pop' },
  { externalId: 'a-3004', title: 'Paolo Nutini', year: null, overview: 'Scottish singer-songwriter from Paisley.', meta: 'Person · Soul, Pop' },
  { externalId: 'a-3005', title: 'Runrig', year: null, overview: 'Scottish Celtic rock band from the Isle of Skye.', meta: 'Group · Celtic Rock' },
  { externalId: 'a-3006', title: 'The Proclaimers', year: null, overview: 'Scottish duo of twin brothers from Leith.', meta: 'Group · Folk Rock' },
  { externalId: 'a-3007', title: 'Nina Nesbitt', year: null, overview: 'Scottish singer-songwriter from Edinburgh.', meta: 'Person · Pop' },
];

const CATALOGUE: Record<ArrKind, DemoItem[]> = { radarr: MOVIES, sonarr: SHOWS, lidarr: ARTISTS };

// Initial "library" contents and anything added during this demo session.
const g = globalThis as unknown as { __demoLib?: Record<ArrKind, Map<string, { arrId: number; addedAt: number }>> };
function lib() {
  if (!g.__demoLib) {
    const seed = (ids: string[]) => new Map(ids.map((id, i) => [id, { arrId: i + 1, addedAt: 0 }]));
    g.__demoLib = { radarr: seed(['1003', '1006', '1009']), sonarr: seed(['2002', '2004', '2005']), lidarr: seed(['a-3001', 'a-3005']) };
  }
  return g.__demoLib;
}

const DOWNLOAD_MS = 90_000; // demo items "download" for 90 seconds after being added

export function demoLookup(kind: ArrKind, term: string): LookupItem[] {
  const t = term.toLowerCase().trim();
  const exact = t.match(/^(?:tmdb|tvdb|lidarr):(.+)$/);
  if (exact) {
    const hit = CATALOGUE[kind].filter((i) => i.externalId === exact[1]);
    return hit.map((i) => ({ ...i, poster: demoPoster(i.title, kind === 'lidarr'), arrId: lib()[kind].get(i.externalId)?.arrId, raw: i }));
  }
  const items = CATALOGUE[kind].filter((i) => !t || i.title.toLowerCase().includes(t) || i.overview.toLowerCase().includes(t));
  const results = items.length ? items : CATALOGUE[kind].slice(0, 4);
  return results.map((i) => ({
    ...i,
    poster: demoPoster(i.title, kind === 'lidarr'),
    arrId: lib()[kind].get(i.externalId)?.arrId,
    raw: i,
  }));
}

export function demoFind(kind: ArrKind, externalId: string): DemoItem | undefined {
  return CATALOGUE[kind].find((i) => i.externalId === externalId);
}

export function demoLibrary(kind: ArrKind): Map<string, LibraryEntry> {
  const out = new Map<string, LibraryEntry>();
  for (const [id, v] of lib()[kind]) out.set(id, { arrId: v.arrId, available: Date.now() - v.addedAt > DOWNLOAD_MS });
  return out;
}

export function demoQueuedIds(kind: ArrKind): Set<number> {
  const s = new Set<number>();
  for (const v of lib()[kind].values()) if (Date.now() - v.addedAt <= DOWNLOAD_MS) s.add(v.arrId);
  return s;
}

export function demoAdd(kind: ArrKind, externalId: string): number {
  const l = lib()[kind];
  const existing = l.get(externalId);
  if (existing) return existing.arrId;
  const arrId = l.size + 100;
  l.set(externalId, { arrId, addedAt: Date.now() });
  return arrId;
}

export function demoOptions(kind: ArrKind): ArrOptions {
  const base = { radarr: '/media/movies', sonarr: '/media/tv', lidarr: '/media/music' }[kind];
  return {
    rootFolders: [{ path: base, freeSpace: 3.2e12 }, { path: `${base}-4k`, freeSpace: 1.1e12 }],
    qualityProfiles: [
      { id: 1, name: 'Any' },
      { id: 4, name: 'HD-1080p' },
      { id: 5, name: 'Ultra-HD' },
    ],
    metadataProfiles: kind === 'lidarr' ? [{ id: 1, name: 'Standard' }, { id: 2, name: 'Albums only' }] : undefined,
  };
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 3600000).toISOString();
}

export function demoQueue(): QueueItem[] {
  const base: QueueItem[] = [
    { id: 'sonarr-q1', service: 'sonarr', title: 'Shetland', subtitle: 'S09E04 · The Ferry', progress: 62.4, status: 'downloading', timeLeft: '12m', sizeBytes: 2.1e9 },
    { id: 'radarr-q1', service: 'radarr', title: 'Starfall Protocol', subtitle: '2026', progress: 18.9, status: 'downloading', timeLeft: '1h 4m', sizeBytes: 9.8e9 },
    { id: 'lidarr-q1', service: 'lidarr', title: 'CHVRCHES', subtitle: 'Screen Violence', progress: 100, status: 'importPending', sizeBytes: 4.2e8 },
  ];
  for (const kind of ['radarr', 'sonarr', 'lidarr'] as ArrKind[]) {
    for (const [id, v] of lib()[kind]) {
      const elapsed = Date.now() - v.addedAt;
      if (elapsed > DOWNLOAD_MS) continue;
      const item = demoFind(kind, id);
      if (!item) continue;
      base.unshift({
        id: `${kind}-demo-${id}`,
        service: kind,
        title: item.title,
        subtitle: item.year ? String(item.year) : undefined,
        progress: Math.round((elapsed / DOWNLOAD_MS) * 1000) / 10,
        status: 'downloading',
        timeLeft: `${Math.max(1, Math.ceil((DOWNLOAD_MS - elapsed) / 60000))}m`,
        sizeBytes: 4e9,
      });
    }
  }
  return base;
}

export function demoRecent(): RecentItem[] {
  return [
    { id: 'r1', service: 'sonarr', title: 'The Great Bake Off', subtitle: 'S15E08 · Pastry Week', date: hoursFromNow(-3), poster: demoPoster('The Great Bake Off') },
    { id: 'r2', service: 'radarr', title: 'Paddington in Peru', subtitle: '2024', date: hoursFromNow(-9), poster: demoPoster('Paddington in Peru') },
    { id: 'r3', service: 'sonarr', title: 'Bluey', subtitle: 'S03E49 · The Sign', date: hoursFromNow(-20), poster: demoPoster('Bluey') },
    { id: 'r4', service: 'lidarr', title: 'The Myth of the Happily Ever After', subtitle: 'Biffy Clyro', date: hoursFromNow(-30), poster: demoPoster('Biffy Clyro', true) },
    { id: 'r5', service: 'radarr', title: 'Ocean Deep', subtitle: '2022', date: hoursFromNow(-52), poster: demoPoster('Ocean Deep') },
    { id: 'r6', service: 'sonarr', title: 'Shetland', subtitle: 'S09E03 · Fair Isle', date: hoursFromNow(-75), poster: demoPoster('Shetland') },
  ];
}

export function demoCalendarTv(): CalendarItem[] {
  return [
    { id: 'c1', service: 'sonarr', title: 'Shetland', subtitle: 'S09E05 · Up Helly Aa', date: hoursFromNow(20), poster: demoPoster('Shetland'), hasFile: false },
    { id: 'c2', service: 'sonarr', title: 'The Great Bake Off', subtitle: 'S15E09 · Semi-final', date: hoursFromNow(44), poster: demoPoster('The Great Bake Off'), hasFile: false },
    { id: 'c3', service: 'sonarr', title: 'Bluey', subtitle: 'S04E01 · Rain', date: hoursFromNow(70), poster: demoPoster('Bluey'), hasFile: false },
    { id: 'c4', service: 'sonarr', title: 'Loch Ness Detectives', subtitle: 'S02E07 · The Boathouse', date: hoursFromNow(118), poster: demoPoster('Loch Ness Detectives'), hasFile: false },
    { id: 'c5', service: 'sonarr', title: 'Shetland', subtitle: 'S09E06 · Final Light', date: hoursFromNow(188), poster: demoPoster('Shetland'), hasFile: false },
  ];
}

export function demoCalendarMovies(): CalendarItem[] {
  return [
    { id: 'm1', service: 'radarr', title: 'Dragon Rider Academy', subtitle: 'In cinemas · 2026', date: hoursFromNow(96), poster: demoPoster('Dragon Rider Academy'), hasFile: false },
    { id: 'm2', service: 'radarr', title: 'Quantum Garden', subtitle: 'Digital release · 2026', date: hoursFromNow(14 * 24), poster: demoPoster('Quantum Garden'), hasFile: false },
    { id: 'm3', service: 'radarr', title: 'Starfall Protocol', subtitle: 'Physical release · 2026', date: hoursFromNow(31 * 24), poster: demoPoster('Starfall Protocol'), hasFile: false },
  ];
}

/* ---------------- Home Assistant ---------------- */

const haState = globalThis as unknown as { __demoHa?: Map<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

function haStore() {
  if (!haState.__demoHa) {
    const s = (entity_id: string, state: string, attributes: Record<string, unknown>) => [entity_id, { entity_id, state, attributes }] as const;
    haState.__demoHa = new Map([
      s('light.living_room', 'on', { friendly_name: 'Living room lights' }),
      s('light.kitchen', 'off', { friendly_name: 'Kitchen lights' }),
      s('light.garden', 'off', { friendly_name: 'Garden lights' }),
      s('switch.christmas_tree', 'on', { friendly_name: 'Christmas tree' }),
      // Shaped like the Hive integration's entities.
      s('climate.heating', 'auto', {
        friendly_name: 'Heating',
        hvac_modes: ['heat', 'auto', 'off'],
        hvac_action: 'heating',
        current_temperature: 19.5,
        temperature: 20.5,
        min_temp: 5,
        max_temp: 32,
        target_temp_step: 0.5,
        preset_modes: ['none', 'boost'],
        preset_mode: 'none',
      }),
      s('water_heater.hot_water', 'eco', { friendly_name: 'Hot water', operation_list: ['eco', 'on', 'off'], current_operation: 'eco' }),
      s('sensor.outdoor_temperature', '4.2', { friendly_name: 'Outdoor temperature', unit_of_measurement: '°C', device_class: 'temperature' }),
      s('sensor.living_room_humidity', '48', { friendly_name: 'Living room humidity', unit_of_measurement: '%', device_class: 'humidity' }),
      s('binary_sensor.front_door', 'off', { friendly_name: 'Front door', device_class: 'door' }),
      s('person.andrew', 'home', { friendly_name: 'Andrew' }),
      s('person.family_member', 'not_home', { friendly_name: 'Family member' }),
    ]);
  }
  return haState.__demoHa;
}

export const DEMO_HA_ENTITIES = [
  'light.living_room',
  'light.kitchen',
  'light.garden',
  'switch.christmas_tree',
  'climate.heating',
  'water_heater.hot_water',
  'sensor.outdoor_temperature',
  'sensor.living_room_humidity',
  'binary_sensor.front_door',
  'person.andrew',
  'person.family_member',
];

/* eslint-disable @typescript-eslint/no-explicit-any */
// Demo heating: boosts expire, the room warms up while the boiler is on and cools when it isn't.
function tickHeating(e: any) {
  const a = e.attributes;
  const now = Date.now();
  if (e.entity_id.startsWith('climate.')) {
    if (a._boost_until && now >= a._boost_until) {
      a.preset_mode = 'none';
      a.temperature = a._prev_target ?? a.temperature;
      delete a._boost_until;
      delete a._prev_target;
    }
    const last = a._last_tick ?? now;
    const minutes = Math.floor((now - last) / 60000);
    if (minutes > 0) {
      const heating = e.state !== 'off' && a.current_temperature < a.temperature;
      // Warms 0.1° a minute while heating, cools 0.05° a minute (to 15°) when not.
      const next = heating ? Math.min(a.temperature, a.current_temperature + minutes * 0.1) : Math.max(15, a.current_temperature - minutes * 0.05);
      a.current_temperature = Math.round(next * 10) / 10;
      a._last_tick = last + minutes * 60000;
    } else if (!a._last_tick) a._last_tick = now;
    a.hvac_action = e.state === 'off' ? 'off' : a.current_temperature < a.temperature ? 'heating' : 'idle';
  } else if (e.entity_id.startsWith('water_heater.')) {
    if (a._boost_until && now >= a._boost_until) {
      e.state = a.current_operation = a._prev_mode ?? 'eco';
      delete a._boost_until;
      delete a._prev_mode;
    }
  }
}

/** Raw state of a demo entity (null if unknown). */
export function demoHaState(id: string): any | null {
  const e = haStore().get(id);
  if (!e) return null;
  tickHeating(e);
  return e;
}

/** Demo version of an allowlisted Home Assistant service call. */
export function demoHaCall(domain: string, service: string, data: Record<string, any>) {
  const e = haStore().get(String(data.entity_id));
  if (!e) throw new Error('Demo: entity not found');
  const a = e.attributes;
  const minutes = (tp: unknown) => {
    const [h, m] = String(tp ?? '00:30:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  switch (`${domain}.${service}`) {
    case 'climate.set_temperature':
      a.temperature = data.temperature;
      if (a.preset_mode === 'boost') a._prev_target = data.temperature;
      break;
    case 'climate.set_hvac_mode':
      e.state = data.hvac_mode;
      break;
    case 'climate.set_preset_mode':
      if (data.preset_mode === 'boost') return demoHaCall('hive', 'boost_heating_on', { entity_id: e.entity_id, time_period: '00:30:00', temperature: Math.min(a.max_temp, (a.temperature ?? 20) + 0.5) });
      return demoHaCall('hive', 'boost_heating_off', { entity_id: e.entity_id });
    case 'hive.boost_heating_on':
      if (a.preset_mode !== 'boost') a._prev_target = a.temperature;
      a.preset_mode = 'boost';
      a.temperature = data.temperature ?? a.temperature;
      a._boost_until = Date.now() + minutes(data.time_period) * 60000;
      break;
    case 'hive.boost_heating_off':
      if (a.preset_mode === 'boost') {
        a.temperature = a._prev_target ?? a.temperature;
        a.preset_mode = 'none';
        delete a._boost_until;
        delete a._prev_target;
      }
      break;
    case 'water_heater.set_operation_mode':
      e.state = a.current_operation = data.operation_mode;
      delete a._boost_until;
      delete a._prev_mode;
      break;
    case 'hive.boost_hot_water':
      if (data.on_off === 'on') {
        if (!a._boost_until) a._prev_mode = a.current_operation;
        e.state = a.current_operation = 'on';
        a._boost_until = Date.now() + minutes(data.time_period) * 60000;
      } else if (a._boost_until) {
        e.state = a.current_operation = a._prev_mode ?? 'eco';
        delete a._boost_until;
        delete a._prev_mode;
      }
      break;
    default:
      throw new Error(`Demo: ${domain}.${service} is not supported`);
  }
  tickHeating(e);
}

/** Demo entities for the admin picker. */
export function demoHaList(domains: string[]) {
  return [...haStore().values()]
    .filter((e) => domains.includes(e.entity_id.split('.')[0]))
    .map((e) => ({ entityId: e.entity_id as string, name: (e.attributes.friendly_name ?? e.entity_id) as string }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function demoHaEntities(ids: string[]): HaEntity[] {
  const store = haStore();
  for (const e of store.values()) tickHeating(e);
  return (ids.length ? ids : DEMO_HA_ENTITIES).map((id) =>
    store.has(id)
      ? toEntity(store.get(id))
      : { entityId: id, name: id, domain: id.split('.')[0], state: 'not found', kind: 'other', controllable: false, available: false },
  );
}

export function demoHaToggle(id: string) {
  const e = haStore().get(id);
  if (e) e.state = e.state === 'on' ? 'off' : 'on';
}

/* ---------------- Recommendations ---------------- */

const REC_SECTIONS: Record<'radarr' | 'sonarr', { id: string; title: string; ids: string[] }[]> = {
  sonarr: [
    { id: 'because-2005', title: 'Because you have Shetland', ids: ['2009', '2015', '2001', '2013', '2006'] },
    { id: 'because-2004', title: 'Because you have Bluey', ids: ['2012', '2014', '2007', '2011'] },
    { id: 'trending', title: 'Trending this week', ids: ['2010', '2003', '2016', '2008', '2013', '2014', '2002'] },
  ],
  radarr: [
    { id: 'because-1003', title: 'Because you have Paddington in Peru', ids: ['1011', '1013', '1015', '1007', '1018'] },
    { id: 'because-1009', title: 'Because you have The Last Ceilidh', ids: ['1012', '1005', '1016', '1001'] },
    { id: 'trending', title: 'Trending this week', ids: ['1014', '1002', '1017', '1008', '1010', '1004'] },
  ],
};

/** Raw demo recommendation sections (library / request filtering happens in recommend.ts). */
export function demoRecommendations(kind: 'radarr' | 'sonarr') {
  const mediaType = kind === 'radarr' ? ('movie' as const) : ('tv' as const);
  return REC_SECTIONS[kind].map((sec) => ({
    id: sec.id,
    title: sec.title,
    items: sec.ids
      .map((id) => demoFind(kind, id))
      .filter((i): i is DemoItem => Boolean(i))
      .map((i) => ({ mediaType, externalId: i.externalId, title: i.title, year: i.year, overview: i.overview, poster: demoPoster(i.title), rating: null })),
  }));
}
