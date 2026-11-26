import { NextResponse } from 'next/server';
import { handler, HttpError, readJson, requireAdmin } from '@/lib/auth';
import { getSettings, hasSecretSetting, saveSecretSetting, saveSettings, type Settings } from '@/lib/db';
import { recentNotifications } from '@/lib/notify';
import { getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

function view() {
  const cfg = getConfig();
  return {
    settings: getSettings(),
    environment: {
      demoMode: cfg.demoMode,
      sonarrUrl: cfg.sonarr.url,
      radarrUrl: cfg.radarr.url,
      lidarrUrl: cfg.lidarr.url,
      plexUrl: cfg.plex.url,
      haUrl: cfg.ha.url,
      // Only report whether keys are set — never the keys themselves.
      sonarrKeySet: Boolean(cfg.sonarr.apiKey),
      radarrKeySet: Boolean(cfg.radarr.apiKey),
      lidarrKeySet: Boolean(cfg.lidarr.apiKey),
      plexTokenSet: Boolean(cfg.plex.token),
      haTokenSet: Boolean(cfg.ha.token),
      tmdbKeySet: Boolean(cfg.tmdb.apiKey),
      cookieSecure: cfg.cookieSecure,
      ntfyTokenSet: hasSecretSetting('ntfyToken') || Boolean(cfg.ntfy.token),
      ntfyTokenFromEnv: Boolean(cfg.ntfy.token) && !hasSecretSetting('ntfyToken'),
      webhookSecretSet: Boolean(cfg.webhookSecret),
      pollMinutes: cfg.ntfy.pollMinutes,
    },
    notifications: recentNotifications(20),
  };
}

export const GET = handler(async () => {
  await requireAdmin();
  return NextResponse.json(view());
});

export const PUT = handler(async (req) => {
  await requireAdmin();
  const b = await readJson<Partial<Settings> & { ntfyToken?: string | null }>(req);
  const patch: Partial<Settings> = {};
  if (b.requireApproval !== undefined) patch.requireApproval = Boolean(b.requireApproval);
  for (const k of ['sonarrRootFolder', 'radarrRootFolder', 'lidarrRootFolder'] as const) {
    if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 500);
  }
  for (const k of ['sonarrQualityProfileId', 'radarrQualityProfileId', 'lidarrQualityProfileId', 'lidarrMetadataProfileId'] as const) {
    if (b[k] !== undefined) {
      const v = b[k] === null || (b[k] as unknown) === '' ? null : Number(b[k]);
      if (v !== null && !Number.isInteger(v)) throw new HttpError(400, `Invalid ${k}.`);
      patch[k] = v;
    }
  }
  if (b.haEntities !== undefined) {
    if (!Array.isArray(b.haEntities)) throw new HttpError(400, 'haEntities must be a list.');
    const ids = b.haEntities.map((s) => String(s).trim()).filter(Boolean);
    const bad = ids.find((id) => !/^[a-z_]+\.[a-z0-9_]+$/.test(id));
    if (bad) throw new HttpError(400, `"${bad}" is not a valid entity ID (e.g. light.living_room).`);
    patch.haEntities = [...new Set(ids)].slice(0, 60);
  }
  if (b.notificationsEnabled !== undefined) patch.notificationsEnabled = Boolean(b.notificationsEnabled);
  for (const k of ['ntfyUrl', 'publicUrl'] as const) {
    if (b[k] === undefined) continue;
    const v = String(b[k]).trim().replace(/\/+$/, '');
    if (v && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(v)) throw new HttpError(400, `"${v}" is not a valid http(s) address.`);
    patch[k] = v.slice(0, 300);
  }
  if (b.ntfyTopicPrefix !== undefined) {
    const v = String(b.ntfyTopicPrefix).trim().toLowerCase();
    if (v && !/^[a-z0-9-]{1,20}$/.test(v)) throw new HttpError(400, 'The topic prefix can only use letters, numbers and dashes (max 20).');
    patch.ntfyTopicPrefix = v;
  }
  // Write-only: the token is never sent back to the browser.
  if (b.ntfyToken !== undefined) saveSecretSetting('ntfyToken', b.ntfyToken ? String(b.ntfyToken).trim().slice(0, 300) : null);
  saveSettings(patch);
  return NextResponse.json(view());
});
