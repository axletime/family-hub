/**
 * Groups and per-group feature permissions. Shared by server and browser code
 * (no secrets here). The server is the source of truth: every API route checks
 * these with requireFeature(); the browser only uses them to hide things.
 */

export type GroupId = 'admin' | 'home' | 'outside';
export const GROUP_IDS: GroupId[] = ['admin', 'home', 'outside'];

export type FeatureId =
  | 'tiles'
  | 'queue'
  | 'calendar'
  | 'haView'
  | 'haControl'
  | 'cameras'
  | 'request'
  | 'discover'
  | 'myRequests'
  | 'allRequests'
  | 'approve';

/** off = no access, on = from anywhere, lan = only from the home network. */
export type Access = 'off' | 'on' | 'lan';

export interface FeatureDef {
  id: FeatureId;
  label: string;
  help: string;
}

export const FEATURES: FeatureDef[] = [
  { id: 'tiles', label: 'Service tiles & quick links', help: 'Status tiles and links to Sonarr, Radarr, Plex and so on.' },
  { id: 'queue', label: 'Download queue', help: 'What is downloading right now.' },
  { id: 'calendar', label: 'Calendar & upcoming', help: 'Upcoming TV and films, and recently added.' },
  { id: 'haView', label: 'Home Assistant panel (view)', help: 'See lights, sensors, heating and hot water.' },
  { id: 'haControl', label: 'Home Assistant toggles & heating', help: 'Switch lights and plugs, change the heating and hot water.' },
  { id: 'cameras', label: 'Cameras', help: 'CCTV snapshots and live view.' },
  { id: 'request', label: 'Request TV, films & music', help: 'Search and request new things.' },
  { id: 'discover', label: 'Discover', help: 'Recommendations, with a button to request them.' },
  { id: 'myRequests', label: 'My requests', help: 'See and cancel their own requests.' },
  { id: 'allRequests', label: 'All requests', help: 'See everyone’s requests.' },
  { id: 'approve', label: 'Approve requests', help: 'Approve or decline requests (also needs All requests).' },
];

export const FEATURE_IDS = FEATURES.map((f) => f.id);
export const FEATURE_LABEL: Record<FeatureId, string> = Object.fromEntries(FEATURES.map((f) => [f.id, f.label])) as Record<FeatureId, string>;

export type AccessMap = Record<FeatureId, Access>;

export interface GroupAccess {
  names: { home: string; outside: string };
  admin: AccessMap;
  home: AccessMap;
  outside: AccessMap;
}

const all = (a: Access): AccessMap => Object.fromEntries(FEATURE_IDS.map((f) => [f, a])) as AccessMap;

/** Defaults: Home = everything except cameras and approving; Outside = requests only. */
export function defaultGroupAccess(homeCanControlHeating = true): GroupAccess {
  return {
    names: { home: 'Home', outside: 'Outside' },
    admin: all('on'),
    home: { ...all('on'), cameras: 'off', approve: 'off', haControl: homeCanControlHeating ? 'on' : 'off' },
    outside: { ...all('off'), request: 'on', discover: 'on', myRequests: 'on' },
  };
}

export const DASHBOARD_FEATURES: FeatureId[] = ['tiles', 'queue', 'calendar', 'haView', 'cameras', 'discover'];

/** What the browser is told about the signed-in user. */
export interface AccessInfo {
  group: GroupId;
  groupName: string;
  network: 'home' | 'away';
  access: AccessMap;
}

export function canUse(u: Pick<AccessInfo, 'access' | 'network'> | null | undefined, f: FeatureId): boolean {
  if (!u) return false;
  const a = u.access[f];
  return a === 'on' || (a === 'lan' && u.network === 'home');
}

/** Why a feature is unavailable (for 403 messages), or null when it is allowed. */
export function denyReason(u: Pick<AccessInfo, 'access' | 'network'>, f: FeatureId): string | null {
  const a = u.access[f];
  if (a === 'on' || (a === 'lan' && u.network === 'home')) return null;
  if (a === 'lan') return `${FEATURE_LABEL[f]} is only available on the home network.`;
  return `You don’t have access to ${FEATURE_LABEL[f].toLowerCase()}.`;
}

export function groupLabel(g: GroupId, names: GroupAccess['names']): string {
  return g === 'admin' ? 'Admin' : names[g];
}
