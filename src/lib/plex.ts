import 'server-only';
import { getConfig } from './config';
import { fetchJson } from './http';

/** Plex reachability check. /identity answers without a token; a token is used if supplied. */
export async function plexStatus(): Promise<{ version?: string }> {
  const { url, token } = getConfig().plex;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['X-Plex-Token'] = token;
  const data = await fetchJson<{ MediaContainer?: { version?: string } }>('Plex', `${url}/identity`, { headers });
  return { version: data?.MediaContainer?.version };
}
