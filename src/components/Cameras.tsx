'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from './api';
import { Empty, ErrorNote, Icon, Spinner } from './ui';

interface CameraInfo {
  id: number;
  name: string;
  hasSub: boolean;
}
type CamerasResponse = { cameras: CameraInfo[]; demo: boolean };

/** True while the browser tab is visible (polling and live video pause when hidden). */
function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    on();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/**
 * A camera still that refreshes every `intervalMs`. The next frame is loaded
 * off-screen first so the picture never flashes blank between refreshes.
 */
function Snapshot({ id, stream = 'sub', intervalMs = 5000, alt, className = '' }: { id: number; stream?: 'sub' | 'main'; intervalMs?: number; alt: string; className?: string }) {
  const visible = usePageVisible();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    setSrc(null);
    setFailed(false);
  }, [id, stream]);

  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    const load = () => {
      if (busy.current) return;
      busy.current = true;
      const url = `/api/cameras/${id}/snapshot?stream=${stream}&t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        busy.current = false;
        if (stopped) return;
        setSrc(url);
        setFailed(false);
      };
      img.onerror = () => {
        busy.current = false;
        if (!stopped) setFailed(true);
      };
      img.src = url;
    };
    load();
    const t = setInterval(load, intervalMs);
    return () => {
      stopped = true;
      busy.current = false;
      clearInterval(t);
    };
  }, [id, stream, intervalMs, visible]);

  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain" />}
      {!src && !failed && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
      {failed && (
        <div className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/60 px-2 py-1 text-xs text-amber-200 ${src ? '' : 'top-0 justify-center'}`}>
          <Icon name="x" className="h-3.5 w-3.5" /> {src ? 'Picture not updating' : 'No picture — check the camera or go2rtc'}
        </div>
      )}
    </div>
  );
}

type LiveMode = 'mp4' | 'mjpeg' | 'snapshot';

/** Full-screen live viewer. Closing it (X, Esc, backdrop) removes the video element, which ends the stream. */
function LiveViewer({ cameras, index, demo, onIndex, onClose }: { cameras: CameraInfo[]; index: number; demo: boolean; onIndex: (i: number) => void; onClose: () => void }) {
  const cam = cameras[index];
  const visible = usePageVisible();
  const [mode, setMode] = useState<LiveMode>(demo ? 'snapshot' : 'mp4');
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tick, setTick] = useState(() => Date.now());

  // Snapshot mode: refresh the still every 1.5 seconds while visible.
  useEffect(() => {
    if (mode !== 'snapshot' || !visible) return;
    const t = setInterval(() => setTick(Date.now()), 1500);
    return () => clearInterval(t);
  }, [mode, visible]);

  useEffect(() => {
    setMode(demo ? 'snapshot' : 'mp4');
    setPlaying(false);
  }, [cam?.id, demo]);

  // If MP4 has not started within 10 seconds (e.g. an H.265 camera), fall back to MJPEG.
  useEffect(() => {
    if (mode !== 'mp4' || playing || !visible) return;
    const t = setTimeout(() => setMode('mjpeg'), 10000);
    return () => clearTimeout(t);
  }, [mode, playing, visible, cam?.id]);

  // Make sure the browser drops the connection when the element goes away.
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      if (v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    };
  }, [mode, cam?.id, visible]);

  const step = useCallback((d: number) => onIndex((index + d + cameras.length) % cameras.length), [index, cameras.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step]);

  if (!cam) return null;
  const base = `/api/cameras/${cam.id}/live`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={`${cam.name} live`}>
      <button className="absolute inset-0 cursor-default" aria-label="Close live view" onClick={onClose} />
      <div className="pt-safe px-safe relative z-10 flex items-center gap-2 py-2 text-white">
        <span className="flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {cam.name}
        </span>
        <span className="text-xs text-white/60">{mode === 'mp4' ? (playing ? 'Live' : 'Connecting…') : mode === 'mjpeg' ? 'Live (MJPEG)' : demo ? 'Demo — refreshing picture' : 'Refreshing picture'}</span>
        <button onClick={onClose} className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
          <Icon name="x" className="h-6 w-6" />
        </button>
      </div>

      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 items-center justify-center px-2">
        <div className="pointer-events-auto relative overflow-hidden rounded-lg bg-black" style={{ width: 'min(calc(100vw - 16px), calc((100dvh - 170px) * 16 / 9))', height: 'min(calc((100vw - 16px) * 9 / 16), calc(100dvh - 170px))' }}>
          {!visible ? null : mode === 'mp4' ? (
            <video
              key={`mp4-${cam.id}`}
              ref={videoRef}
              src={`${base}?format=mp4`}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
              onPlaying={() => setPlaying(true)}
              onError={() => setMode('mjpeg')}
            />
          ) : mode === 'mjpeg' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`mjpeg-${cam.id}`} src={`${base}?format=mjpeg`} alt={`${cam.name} live`} className="absolute inset-0 h-full w-full object-contain" onError={() => setMode('snapshot')} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`snap-${cam.id}`} src={`/api/cameras/${cam.id}/snapshot?stream=main&t=${tick}`} alt={`${cam.name} live`} className="absolute inset-0 h-full w-full object-contain" />
          )}
          {mode === 'mp4' && !playing && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
          {cameras.length > 1 && (
            <>
              <button onClick={() => step(-1)} className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Previous camera">
                <span className="text-2xl leading-none">‹</span>
              </button>
              <button onClick={() => step(1)} className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Next camera">
                <span className="text-2xl leading-none">›</span>
              </button>
            </>
          )}
        </div>
      </div>

      {cameras.length > 1 && (
        <div className="pb-safe px-safe relative z-10 flex justify-center gap-2 overflow-x-auto py-3">
          {cameras.map((c, i) => (
            <button key={c.id} onClick={() => onIndex(i)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${i === index ? 'bg-accent-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Camera grid with tabs (All / each camera); tapping a picture opens the live viewer. */
function CameraWall({ large = false }: { large?: boolean }) {
  const { data, error, loading } = useApi<CamerasResponse>('/api/cameras');
  const [tab, setTab] = useState<number | 'all'>('all');
  const [viewer, setViewer] = useState<number | null>(null);
  const close = useCallback(() => setViewer(null), []);
  const cams = data?.cameras ?? [];

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!cams.length) return <Empty>No cameras yet. An admin can add them in Settings › Cameras.</Empty>;

  const selected = tab === 'all' ? null : cams.findIndex((c) => c.id === tab);
  const tile = (c: CameraInfo, i: number, big: boolean) => (
    <button key={c.id} onClick={() => setViewer(i)} className="group relative block w-full overflow-hidden rounded-xl text-left" aria-label={`Open ${c.name} live`}>
      <Snapshot id={c.id} stream="sub" intervalMs={big ? 3000 : 5000} alt={c.name} className="aspect-video w-full" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-2.5 py-1.5 text-sm font-medium text-white">
        <span className="truncate">{c.name}</span>
        <Icon name="expand" className="h-4 w-4 opacity-70 group-hover:opacity-100" />
      </div>
    </button>
  );

  return (
    <div>
      <div className="scrollbar-thin -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Choose camera">
        {[{ id: 'all' as const, name: 'All' }, ...cams].map((c) => (
          <button key={c.id} role="tab" aria-selected={tab === c.id} onClick={() => setTab(c.id)} className={`${tab === c.id ? 'btn-primary' : 'btn-ghost'} min-h-[40px] shrink-0 px-3 py-1.5 text-sm`}>
            {c.name}
          </button>
        ))}
      </div>
      {selected !== null && selected >= 0 ? (
        tile(cams[selected], selected, true)
      ) : (
        <div className={`grid gap-2 ${large ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>{cams.map((c, i) => tile(c, i, false))}</div>
      )}
      {viewer !== null && <LiveViewer cameras={cams} index={viewer} demo={!!data?.demo} onIndex={setViewer} onClose={close} />}
    </div>
  );
}

export function CamerasCard() {
  return (
    <section className="card p-4">
      <h2 className="card-title mb-3">
        <span className="flex items-center gap-2"><Icon name="camera" className="h-4 w-4" /> Cameras</span>
        <Link href="/cameras" className="text-sm font-medium text-accent-600 hover:underline dark:text-accent-300">Open</Link>
      </h2>
      <CameraWall />
    </section>
  );
}

export function CamerasPageView() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Cameras</h1>
        <p className="text-slate-500 dark:text-slate-400">Pictures refresh every few seconds. Tap a camera for live video.</p>
      </div>
      <CameraWall large />
    </div>
  );
}
