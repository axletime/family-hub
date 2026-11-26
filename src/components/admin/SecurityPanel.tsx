'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { ErrorNote, Icon, Spinner, Toggle } from '../ui';
import type { Access, FeatureId, GroupAccess } from '@/lib/features';

interface SecurityData {
  settings: { requireLongPins: boolean; trustedProxies: string; trustedProxiesFromEnv: string };
  client: { ip: string; network: 'home' | 'away'; https: boolean; peer: string; peerTrusted: boolean; untrustedForward: boolean };
  cookieSecureEnv: boolean;
  shortPins: { id: number; name: string; pinLength: number | null }[];
  locks: { kind: 'ip' | 'user'; label: string; network?: string; until: number }[];
  events: { id: number; at: number; ip: string; network: string; userName: string | null; success: boolean; reason: string }[];
}

const REASON: Record<string, string> = {
  ok: 'Signed in',
  bad_pin: 'Wrong PIN',
  unknown_profile: 'Unknown profile',
  locked_ip: 'Blocked (address locked)',
  locked_user: 'Blocked (profile locked)',
  admin_reset: 'Lockout cleared by admin',
  pin_changed: 'PIN changed',
};

const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "Only from home network" switches for the riskiest features, applied to every group that has them. */
function LanOnly({ ga, onSaved }: { ga: GroupAccess; onSaved: () => void }) {
  const [busy, setBusy] = useState<FeatureId | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rows: { id: FeatureId; label: string }[] = [
    { id: 'cameras', label: 'Cameras' },
    { id: 'haControl', label: 'Home Assistant toggles & heating' },
    { id: 'haView', label: 'Home Assistant panel (view)' },
  ];
  const isLan = (f: FeatureId) => {
    const vals = (['admin', 'home', 'outside'] as const).map((g) => ga[g][f]).filter((v) => v !== 'off');
    return vals.length > 0 && vals.every((v) => v === 'lan');
  };
  const flip = async (f: FeatureId, on: boolean) => {
    setBusy(f);
    setErr(null);
    const swap = (v: Access): Access => (v === 'off' ? 'off' : on ? 'lan' : 'on');
    try {
      await api('/api/admin/groups', { method: 'PUT', body: { admin: { [f]: swap(ga.admin[f]) }, home: { [f]: swap(ga.home[f]) }, outside: { [f]: swap(ga.outside[f]) } } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <h3 className="text-sm font-medium">Only allow from the home network</h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        When on, these work only from your home network (private addresses such as 192.168.x.x), for every group including Admin. Fine-tune per group on <Link href="/admin/users" className="link">Family › Groups &amp; permissions</Link>.
      </p>
      <ul className="mt-2 divide-y divide-slate-200 dark:divide-white/10">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <span className="flex-1 text-sm">{r.label}</span>
            <Toggle label={`${r.label}: home network only`} checked={isLan(r.id)} disabled={busy !== null} onChange={(v) => flip(r.id, v)} />
          </li>
        ))}
      </ul>
      {err && <ErrorNote>{err}</ErrorNote>}
    </div>
  );
}

export default function SecurityPanel() {
  const { data, error, reload, setData } = useApi<SecurityData>('/api/admin/security', 60000);
  const groups = useApi<{ access: GroupAccess }>('/api/admin/groups');
  const [proxies, setProxies] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (data && proxies === null) setProxies(data.settings.trustedProxies);
  }, [data, proxies]);

  const put = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api<SecurityData>('/api/admin/security', { method: 'PUT', body });
      setData(d);
      setProxies(d.settings.trustedProxies);
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (l: SecurityData['locks'][number]) => {
    try {
      await api('/api/admin/security/unlock', { method: 'POST', body: l.kind === 'ip' ? { ip: l.label } : { userName: l.label } });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Unlock failed' });
    }
  };

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <section className="card p-5"><Spinner /></section>;
  const c = data.client;
  const plainFromOutside = !c.https && c.network === 'away';

  return (
    <>
      {plainFromOutside && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-200" role="alert">
          <div className="flex items-center gap-2 font-semibold"><Icon name="shield" className="h-4 w-4" /> You are using Family Hub over the internet without encryption (HTTP)</div>
          <p className="mt-1">PINs and session cookies can be read by anyone between you and your home. Put Family Hub behind a reverse proxy with a free Let&rsquo;s Encrypt certificate (e.g. Nginx Proxy Manager on Unraid — see the README, &ldquo;HTTPS for your No-IP address&rdquo;), then remove the router&rsquo;s port 80 → 3000 forward.</p>
        </div>
      )}
      {data.shortPins.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200" role="alert">
          <div className="font-semibold">Short PINs</div>
          <p className="mt-1">
            These profiles still use a PIN shorter than 6 digits{data.shortPins.some((u) => u.pinLength === null) ? ' (or one set before PIN lengths were recorded — it updates at their next sign-in)' : ''}:{' '}
            <strong>{data.shortPins.map((u) => `${u.name}${u.pinLength ? ` (${u.pinLength})` : ''}`).join(', ')}</strong>. Reset them on <Link href="/admin/users" className="link">Family</Link> or ask them to change it in My account.
          </p>
        </div>
      )}

      <section className="card space-y-4 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="shield" className="h-4 w-4" /> Security</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-white/5">
            <div className="text-xs text-slate-500 dark:text-slate-400">This device is on</div>
            <div className={`font-semibold ${c.network === 'home' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'}`}>{c.network === 'home' ? 'Home network' : 'Away (internet)'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{c.ip}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-white/5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Connection</div>
            <div className={`font-semibold ${c.https ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'}`}>{c.https ? 'HTTPS (encrypted)' : 'HTTP (not encrypted)'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Secure cookies: {data.cookieSecureEnv || c.https ? 'on' : 'off'}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-white/5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Connected via</div>
            <div className="font-semibold">{c.peerTrusted ? 'Trusted proxy' : 'Direct'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{c.peer}{c.untrustedForward ? ' · forwarded address ignored (proxy not trusted)' : ''}</div>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-medium">Require 6+ digit PINs</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">New and changed PINs must be 6–8 digits. Recommended now that the hub is reachable from the internet. Existing PINs keep working.</p>
          </div>
          <Toggle label="Require 6+ digit PINs" checked={data.settings.requireLongPins} disabled={busy} onChange={(v) => put({ requireLongPins: v }, v ? 'New PINs must now be at least 6 digits.' : '4-digit PINs are allowed again.')} />
        </div>

        {groups.data && <LanOnly ga={groups.data.access} onSaved={groups.reload} />}

        <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
          <label className="text-sm font-medium" htmlFor="trustedProxies">Trusted reverse proxies</label>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Only set this if Family Hub sits behind a reverse proxy such as Nginx Proxy Manager. Enter its IP or subnet (e.g. <code>172.17.0.0/16</code> or <code>192.168.1.201</code>), or <code>private</code> for any private address. The visitor&rsquo;s real address (X-Forwarded-For) and HTTPS (X-Forwarded-Proto) are believed only from these. Leave blank when people connect directly.
            {data.settings.trustedProxiesFromEnv && <> Default from TRUST_PROXY: <code>{data.settings.trustedProxiesFromEnv}</code>.</>}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input id="trustedProxies" className="input flex-1 font-mono" placeholder="(none)" value={proxies ?? ''} onChange={(e) => setProxies(e.target.value)} spellCheck={false} />
            <button className="btn-primary" disabled={busy || proxies === data.settings.trustedProxies} onClick={() => put({ trustedProxies: proxies ?? '' }, 'Trusted proxies saved.')}>Save</button>
          </div>
        </div>

        {msg && (msg.ok ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>)}

        <div>
          <h3 className="text-sm font-medium">Sign-in lockouts</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">After 5 wrong PINs a profile is locked for 15 minutes (10 from one address), doubling each time up to 24 hours. Wrong PINs also slow down each try.</p>
          {!data.locks.length ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Nobody is locked out.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-200 text-sm dark:divide-white/10">
              {data.locks.map((l) => (
                <li key={`${l.kind}-${l.label}-${l.network}`} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">{l.kind === 'ip' ? `Address ${l.label}` : `${l.label}${l.network === 'away' ? ' (from the internet)' : ' (at home)'}`} · until {fmt(l.until)}</span>
                  <button className="btn-ghost px-3 py-1" onClick={() => unlock(l)}>Unlock</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <button className="flex items-center gap-1 text-sm font-medium text-accent-600 dark:text-accent-300" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
            {showLog ? 'Hide' : 'Show'} sign-in log ({data.events.length})
          </button>
          {showLog && (
            <div className="scrollbar-thin mt-2 max-h-[360px] overflow-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-slate-500 dark:text-slate-400">
                  <tr><th className="py-1 pr-2">When</th><th className="pr-2">Who</th><th className="pr-2">Result</th><th className="pr-2">Address</th></tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id} className="border-t border-slate-200 dark:border-white/10">
                      <td className="py-1 pr-2 whitespace-nowrap">{fmt(e.at)}</td>
                      <td className="pr-2">{e.userName ?? '—'}</td>
                      <td className={`pr-2 ${e.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{REASON[e.reason] ?? e.reason}</td>
                      <td className="pr-2 font-mono">{e.ip === '-' ? '—' : e.ip} {e.ip !== '-' && <span className="text-slate-500">({e.network === 'home' ? 'home' : 'internet'})</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
