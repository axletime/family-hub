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
}

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
