// Shared, browser-safe types. Never put secrets in here.

export type MediaType = 'movie' | 'tv' | 'music';
export type RequestStatus = 'pending' | 'approved' | 'downloading' | 'available' | 'declined' | 'failed';
export type ServiceId = 'sonarr' | 'radarr' | 'lidarr' | 'plex' | 'homeassistant';

export interface ServiceStatus {
  id: ServiceId;
  name: string;
  online: boolean;
  configured: boolean;
  version?: string;
  message?: string;
  link: string;
}

export interface QueueItem {
  id: string;
  service: 'sonarr' | 'radarr' | 'lidarr';
  title: string;
  subtitle?: string;
  progress: number; // 0-100
  status: string;
  timeLeft?: string;
  sizeBytes?: number;
}

export interface RecentItem {
  id: string;
  service: 'sonarr' | 'radarr' | 'lidarr';
  title: string;
  subtitle?: string;
  date: string;
  poster?: string;
}

export interface CalendarItem {
  id: string;
  service: 'sonarr' | 'radarr';
  title: string;
  subtitle?: string;
  date: string;
  poster?: string;
  hasFile: boolean;
}

export interface MediaOverview {
  queue: QueueItem[];
  recent: RecentItem[];
  upcomingTv: CalendarItem[];
  upcomingMovies: CalendarItem[];
  errors: string[];
}

export interface SearchResult {
  mediaType: MediaType;
  externalId: string;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  meta?: string;
  inLibrary: boolean;
  requested: { status: RequestStatus; by: string } | null;
}

export type HaKind = 'light' | 'switch' | 'temperature' | 'sensor' | 'presence' | 'other';

export interface HaEntity {
  entityId: string;
  name: string;
  domain: string;
  state: string;
  unit?: string;
  kind: HaKind;
  controllable: boolean;
  available: boolean;
  /** Present for climate.* entities (e.g. Hive heating). */
  climate?: HaClimate;
  /** Present for water_heater.* entities (e.g. Hive hot water). */
  water?: HaWaterHeater;
}

export interface HaClimate {
  currentTemperature: number | null;
  targetTemperature: number | null;
  minTemp: number;
  maxTemp: number;
  step: number;
  /** hvac mode: heat (manual), auto (schedule), off … */
  mode: string;
  modes: string[];
  /** What the boiler is doing right now: heating, idle, off. */
  action: string | null;
  presetMode: string | null;
  presetModes: string[];
  boostActive: boolean;
}

export interface HaWaterHeater {
  /** Hive: on, off or eco (= schedule). */
  mode: string;
  modes: string[];
}

/** Actions the dashboard can send for heating and hot water. Validated server-side. */
export type HeatingAction =
  | { action: 'set_temperature'; temperature: number }
  | { action: 'set_mode'; mode: string }
  | { action: 'boost_on'; minutes: number; temperature?: number }
  | { action: 'boost_off' };

export interface RequestView {
  id: number;
  mediaType: MediaType;
  externalId: string;
  title: string;
  year: number | null;
  poster: string | null;
  overview: string | null;
  status: RequestStatus;
  note: string | null;
  requestedBy: string;
  requestedById: number;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  id: number;
  name: string;
  colour: string;
  role: 'admin' | 'member';
}

export type RecMediaType = 'movie' | 'tv';
export type RecSource = 'tmdb' | 'tvmaze' | 'radarr' | 'demo' | 'none';

export interface RecItem {
  mediaType: RecMediaType;
  /** TVDB id for TV (what Sonarr uses), TMDB id for films (what Radarr uses). */
  externalId: string;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  rating?: number | null;
}

export interface RecSection {
  id: string;
  title: string;
  items: RecItem[];
}

export interface RecResponse {
  mediaType: RecMediaType;
  source: RecSource;
  sections: RecSection[];
  /** Shown to admins only, e.g. how to enable better recommendations. */
  hint?: string;
  error?: string;
  generatedAt?: string;
}
