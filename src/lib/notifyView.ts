import 'server-only';
import QRCode from 'qrcode';
import { getDb, getSettings } from './db';
import { getConfig } from './config';
import { ensureTopic, parsePrefs, recentNotifications } from './notify';

/** What the Account page needs to show a user's notification setup. */
export async function notificationView(userId: number) {
  const s = getSettings();
  const topic = ensureTopic(userId);
  const row = getDb().prepare('SELECT notify_prefs FROM users WHERE id = ?').get(userId) as { notify_prefs: string | null };
  const subscribeUrl = `${s.ntfyUrl}/${topic}`;
  const host = s.ntfyUrl.replace(/^https?:\/\//, '');
  const qrSvg = await QRCode.toString(subscribeUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } });
  return {
    topic,
    server: s.ntfyUrl,
    subscribeUrl,
    // The ntfy apps assume HTTPS unless told otherwise.
    appUrl: `ntfy://${host}/${topic}${s.ntfyUrl.startsWith('http://') ? '?secure=false' : ''}`,
    selfHosted: !/^https:\/\/ntfy\.sh$/.test(s.ntfyUrl),
    enabled: s.notificationsEnabled,
    demo: getConfig().demoMode,
    prefs: parsePrefs(row.notify_prefs),
    qrSvg,
    recent: recentNotifications(5, userId),
  };
}
