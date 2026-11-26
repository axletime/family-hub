'use client';
import { useEffect, useRef, useState } from 'react';
import type { HaEntity } from '@/lib/types';
import { Icon, Spinner } from './ui';

export type HeatingRequest =
  | { action: 'set_temperature'; temperature: number }
  | { action: 'set_mode'; mode: string }
  | { action: 'boost_on'; minutes: number; temperature?: number }
  | { action: 'boost_off' };

type Send = (entityId: string, req: HeatingRequest) => Promise<boolean>;

const CLIMATE_MODE_LABEL: Record<string, string> = { heat: 'Heat', auto: 'Schedule', off: 'Off' };
const WATER_MODE_LABEL: Record<string, string> = { on: 'On', off: 'Off', eco: 'Schedule' };
const HEAT_BOOSTS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
];
const WATER_BOOSTS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
];

const fmt = (t: number | null | undefined) => (t === null || t === undefined ? '–' : `${t.toFixed(1)}°`);
const roundHalf = (t: number) => Math.round(t * 2) / 2;

function Segmented({ options, value, onSelect, disabled, label }: { options: { value: string; label: string }[]; value: string; onSelect: (v: string) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onSelect(o.value)}
            className={`min-h-[44px] rounded-lg px-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'bg-accent-600 text-white shadow' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RoundButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition hover:border-accent-400 hover:bg-accent-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10">
      <Icon name={icon} className="h-5 w-5" />
    </button>
  );
}

export function ClimateCard({ entity, canControl, send }: { entity: HaEntity; canControl: boolean; send: Send }) {
  const c = entity.climate!;
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [boostOpen, setBoostOpen] = useState(false);
  const [boostMinutes, setBoostMinutes] = useState(60);
  const [boostTemp, setBoostTemp] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const step = c.step >= 0.5 ? c.step : 0.5;
  const clamp = (t: number) => Math.min(c.maxTemp, Math.max(c.minTemp, roundHalf(t)));
  const target = pending ?? c.targetTemperature;
  const disabled = !canControl || !entity.available;
  const heatingNow = c.action ? c.action === 'heating' : c.mode !== 'off' && (c.currentTemperature ?? 99) < (c.targetTemperature ?? 0);
  const modes = (c.modes.length ? c.modes : ['heat', 'auto', 'off']).filter((m) => m in CLIMATE_MODE_LABEL);

  const nudge = (dir: 1 | -1) => {
    const base = target ?? c.currentTemperature ?? 20;
    const next = clamp(base + dir * step);
    setPending(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    // Wait for the taps to stop before telling Home Assistant (and Hive's cloud).
    timer.current = setTimeout(async () => {
      timer.current = null;
      await send(entity.entityId, { action: 'set_temperature', temperature: next });
      if (latest.current === next) setPending(null);
    }, 900);
  };

  const run = async (key: string, req: HeatingRequest) => {
    setBusy(key);
    const ok = await send(entity.entityId, req);
    setBusy(null);
    return ok;
  };

  const openBoost = () => {
    setBoostTemp(clamp((c.targetTemperature ?? c.currentTemperature ?? 20) + 1));
    setBoostOpen(true);
  };

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${heatingNow ? 'border-orange-400/50 bg-orange-400/10' : 'border-slate-200 dark:border-white/10'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon name="thermo" className="h-4 w-4 text-accent-500 dark:text-accent-300" />
            <span className="truncate">{entity.name}</span>
          </div>
          {!entity.available && <div className="text-xs text-slate-500">Unavailable</div>}
        </div>
        <span className={`badge ${heatingNow ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`} aria-live="polite">
          <Icon name="flame" className={`h-3.5 w-3.5 ${heatingNow ? 'animate-pulse' : ''}`} />
          {heatingNow ? 'Heating on now' : 'Heating off now'}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Room</div>
          <div className="text-3xl font-bold tabular-nums">{fmt(c.currentTemperature)}</div>
        </div>
        <div className="flex items-center gap-2">
          {canControl && <RoundButton icon="minus" label="Lower target by 0.5°" disabled={disabled || c.mode === 'off' || (target ?? 0) <= c.minTemp} onClick={() => nudge(-1)} />}
          <div className="min-w-[4.5rem] text-center">
            <div className="text-xs text-slate-500 dark:text-slate-400">Target</div>
            <div className={`text-2xl font-semibold tabular-nums ${pending !== null ? 'text-accent-600 dark:text-accent-300' : ''}`}>{c.mode === 'off' ? 'Off' : fmt(target)}</div>
          </div>
          {canControl && <RoundButton icon="plus" label="Raise target by 0.5°" disabled={disabled || c.mode === 'off' || (target ?? 0) >= c.maxTemp} onClick={() => nudge(1)} />}
        </div>
      </div>

      <div className="mt-3">
        <Segmented label={`${entity.name} mode`} value={c.mode} disabled={disabled || busy !== null} onSelect={(m) => run('mode', { action: 'set_mode', mode: m })} options={modes.map((m) => ({ value: m, label: CLIMATE_MODE_LABEL[m] }))} />
      </div>

      {c.boostActive ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent-600/10 px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-accent-700 dark:text-accent-300">
            <Icon name="bolt" className="h-4 w-4" /> Boost on{c.targetTemperature !== null ? ` · ${fmt(c.targetTemperature)}` : ''}
          </span>
          {canControl && (
            <button type="button" className="btn-ghost" disabled={disabled || busy !== null} onClick={() => run('boost', { action: 'boost_off' })}>
              {busy === 'boost' ? <Spinner className="h-4 w-4" /> : <Icon name="x" className="h-4 w-4" />} Cancel boost
            </button>
          )}
        </div>
      ) : canControl && !boostOpen ? (
        <button type="button" className="btn-ghost mt-3 w-full" disabled={disabled} onClick={openBoost}>
          <Icon name="bolt" className="h-4 w-4" /> Boost
        </button>
      ) : null}

      {canControl && boostOpen && !c.boostActive && (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
          <div>
            <div className="label">Boost for</div>
            <Segmented label="Boost length" value={String(boostMinutes)} onSelect={(v) => setBoostMinutes(Number(v))} options={HEAT_BOOSTS.map((b) => ({ value: String(b.minutes), label: b.label }))} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="label mb-0">Boost to</div>
            <div className="flex items-center gap-2">
              <RoundButton icon="minus" label="Lower boost temperature" disabled={(boostTemp ?? 0) <= c.minTemp} onClick={() => setBoostTemp((t) => clamp((t ?? 20) - step))} />
              <span className="min-w-[3.5rem] text-center text-xl font-semibold tabular-nums">{fmt(boostTemp)}</span>
              <RoundButton icon="plus" label="Raise boost temperature" disabled={(boostTemp ?? 0) >= c.maxTemp} onClick={() => setBoostTemp((t) => clamp((t ?? 20) + step))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => setBoostOpen(false)}>Not now</button>
            <button
              type="button"
              className="btn-primary"
              disabled={disabled || busy !== null}
              onClick={async () => {
                if (await run('boost', { action: 'boost_on', minutes: boostMinutes, temperature: boostTemp ?? undefined })) setBoostOpen(false);
              }}
            >
              {busy === 'boost' ? <Spinner className="h-4 w-4" /> : <Icon name="bolt" className="h-4 w-4" />} Start boost
            </button>
          </div>
        </div>
      )}
      {!canControl && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">View only — an admin manages the heating.</p>}
    </div>
  );
}

export function WaterCard({ entity, canControl, send }: { entity: HaEntity; canControl: boolean; send: Send }) {
  const w = entity.water!;
  const [busy, setBusy] = useState<string | null>(null);
  const disabled = !canControl || !entity.available || busy !== null;
  const modes = (w.modes.length ? w.modes : ['on', 'off', 'eco']).filter((m) => m in WATER_MODE_LABEL);
  const on = w.mode === 'on';

  const run = async (key: string, req: HeatingRequest) => {
    setBusy(key);
    await send(entity.entityId, req);
    setBusy(null);
  };

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${on ? 'border-sky-400/50 bg-sky-400/10' : 'border-slate-200 dark:border-white/10'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <Icon name="drop" className="h-4 w-4 text-sky-500" />
          <span className="truncate">{entity.name}</span>
        </div>
        <span className={`badge ${on ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`} aria-live="polite">
          {!entity.available ? 'Unavailable' : on ? 'On' : w.mode === 'eco' ? 'On schedule' : WATER_MODE_LABEL[w.mode] ?? w.mode}
        </span>
      </div>
      <div className="mt-3">
        <Segmented label={`${entity.name} mode`} value={w.mode} disabled={disabled} onSelect={(m) => run('mode', { action: 'set_mode', mode: m })} options={modes.map((m) => ({ value: m, label: WATER_MODE_LABEL[m] }))} />
      </div>
      {canControl && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {WATER_BOOSTS.map((b) => (
            <button key={b.minutes} type="button" className="btn-ghost" disabled={disabled} onClick={() => run(`boost${b.minutes}`, { action: 'boost_on', minutes: b.minutes })}>
              {busy === `boost${b.minutes}` ? <Spinner className="h-4 w-4" /> : <Icon name="bolt" className="h-4 w-4" />} Boost {b.label}
            </button>
          ))}
        </div>
      )}
      {!canControl && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">View only — an admin manages the hot water.</p>}
    </div>
  );
}
