import 'server-only';
import { getConfig } from './config';
// Registers the loader for keys saved on Admin › Settings › Connections, so every
// service client sees them even in route bundles that never touch the database.
import './db';

export class ServiceError extends Error {
  constructor(public service: string, message: string, public status?: number) {
    super(`${service}: ${message}`);
  }
}

/** fetch() with a timeout, JSON handling and readable errors. Server-side only. */
export async function fetchJson<T>(
  service: string,
  url: string,
  init: RequestInit & { timeoutMs?: number; raw?: boolean } = {},
): Promise<T> {
  const { timeoutMs = getConfig().requestTimeoutMs, raw, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.text();
        const parsed = JSON.parse(body);
        detail = Array.isArray(parsed)
          ? parsed.map((p: { errorMessage?: string }) => p.errorMessage).filter(Boolean).join('; ') || detail
          : parsed.message || parsed.error || detail;
      } catch {
        /* keep statusText */
      }
      throw new ServiceError(service, `HTTP ${res.status} ${detail}`, res.status);
    }
    if (raw) return (await res.text()) as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (e) {
    if (e instanceof ServiceError) throw e;
    if ((e as Error).name === 'AbortError') throw new ServiceError(service, 'timed out');
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code) throw new ServiceError(service, `unreachable (${cause.code})`);
    if ((e as Error).message === 'fetch failed' && cause?.message) throw new ServiceError(service, `unreachable (${cause.message})`);
    throw new ServiceError(service, (e as Error).message);
  }
}
