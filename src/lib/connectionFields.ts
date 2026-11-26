/** The services and settings that can be managed on Admin › Settings › Connections. */

export type ConnectionId = 'sonarr' | 'radarr' | 'lidarr' | 'plex' | 'homeassistant' | 'tmdb' | 'ntfy' | 'go2rtc' | 'webhook' | 'public';

export interface ConnectionDef {
  id: ConnectionId;
  name: string;
  /** Environment variable for the address, if the service has one. */
  urlVar?: string;
  urlLabel?: string;
  defaultUrl?: string;
  /** Environment variable for the secret, if the service has one. */
  secretVar?: string;
  secretLabel?: string;
  help: string;
  testable: boolean;
}

export const CONNECTIONS: ConnectionDef[] = [
  { id: 'sonarr', name: 'Sonarr', urlVar: 'SONARR_URL', defaultUrl: 'http://192.168.1.200:8989', secretVar: 'SONARR_API_KEY', secretLabel: 'API key', help: 'TV shows. Find the key in Sonarr › Settings › General › Security.', testable: true },
  { id: 'radarr', name: 'Radarr', urlVar: 'RADARR_URL', defaultUrl: 'http://192.168.1.200:7878', secretVar: 'RADARR_API_KEY', secretLabel: 'API key', help: 'Films. Find the key in Radarr › Settings › General › Security.', testable: true },
  { id: 'lidarr', name: 'Lidarr', urlVar: 'LIDARR_URL', defaultUrl: 'http://192.168.1.200:8686', secretVar: 'LIDARR_API_KEY', secretLabel: 'API key', help: 'Music. Find the key in Lidarr › Settings › General › Security.', testable: true },
  { id: 'plex', name: 'Plex', urlVar: 'PLEX_URL', defaultUrl: 'http://192.168.1.202:32400', secretVar: 'PLEX_TOKEN', secretLabel: 'Plex token', help: 'Optional token for "Now playing" and library details (see the README for how to find it).', testable: true },
  { id: 'homeassistant', name: 'Home Assistant', urlVar: 'HA_URL', defaultUrl: 'http://homeassistant.local:8123', secretVar: 'HA_TOKEN', secretLabel: 'Long-lived access token', help: 'Create one in Home Assistant › your profile › Security › Long-lived access tokens.', testable: true },
  { id: 'tmdb', name: 'TMDB', secretVar: 'TMDB_API_KEY', secretLabel: 'API key (v3) or read access token', help: 'Free key from themoviedb.org › Settings › API. Enables personalised recommendations.', testable: true },
  { id: 'ntfy', name: 'ntfy (push notifications)', urlVar: 'NTFY_URL', urlLabel: 'Server', defaultUrl: 'https://ntfy.sh', secretVar: 'NTFY_TOKEN', secretLabel: 'Access token (optional)', help: 'Only needed for a protected self-hosted server. Test sends a message to a throwaway topic.', testable: true },
  { id: 'go2rtc', name: 'go2rtc (cameras)', urlVar: 'GO2RTC_URL', urlLabel: 'go2rtc address', defaultUrl: 'http://192.168.1.201:1984', help: 'The go2rtc container that turns the NVR\'s RTSP streams into browser video. Keep it on your home network only — never port-forward it.', testable: true },
  { id: 'webhook', name: 'Webhook shared secret', secretVar: 'WEBHOOK_SECRET', secretLabel: 'Shared secret', help: 'Optional. Add ?secret=… to the Sonarr/Radarr/Lidarr webhook address (see the README).', testable: false },
  { id: 'public', name: 'Public URL', urlVar: 'PUBLIC_URL', urlLabel: 'Family Hub address', defaultUrl: 'http://192.168.1.201:3000', help: 'Used for links in notifications. The address family members use to open the hub.', testable: true },
];

export const URL_VARS = CONNECTIONS.flatMap((c) => (c.urlVar ? [c.urlVar] : []));
export const SECRET_VARS = CONNECTIONS.flatMap((c) => (c.secretVar ? [c.secretVar] : []));
export const CONNECTION_VARS = [...URL_VARS, ...SECRET_VARS];
