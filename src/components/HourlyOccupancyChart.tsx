import React, {useEffect, useMemo, useState} from 'react';
import type {LotOccupancySnapshot} from '../types/entrysense';

interface HourlyOccupancyChartProps {
  snapshot: LotOccupancySnapshot;
}

const STALE_THRESHOLD_SEC = 150;

function getCurrentHourInTimezone(nowMs: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '12';
    return Number.parseInt(hourStr, 10) % 24;
  } catch {
    return new Date(nowMs).getHours();
  }
}

function formatTimezoneShort(nowMs: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date(nowMs));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'CT';
  } catch {
    return 'CT';
  }
}

export const HourlyOccupancyChart: React.FC<HourlyOccupancyChartProps> = ({snapshot}) => {
  const {hourlyStats, capacity, occupied, hasLiveSync, updatedAt, timezone} = snapshot;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const currentHour = useMemo(
    () => getCurrentHourInTimezone(nowMs, timezone || 'America/Chicago'),
    [nowMs, timezone]
  );
  const tzShort = useMemo(
    () => formatTimezoneShort(nowMs, timezone || 'America/Chicago'),
    [nowMs, timezone]
  );

  const isFreshLive = useMemo(() => {
    if (!hasLiveSync || !updatedAt) return false;
    const updatedMs = Date.parse(updatedAt);
    if (Number.isNaN(updatedMs)) return false;
    return (nowMs - updatedMs) / 1000 < STALE_THRESHOLD_SEC;
  }, [hasLiveSync, updatedAt, nowMs]);

  const liveOccupancyPct = useMemo(
    () => (capacity > 0 ? Math.min(100, Math.max(0, Math.round((occupied / capacity) * 100))) : 0),
    [occupied, capacity]
  );

  const defaultSelectedHour = useMemo(() => {
    const exact = hourlyStats.find((b) => b.hour === currentHour);
    if (exact) return exact.hour;
    return hourlyStats[0]?.hour ?? 12;
  }, [hourlyStats, currentHour]);

  const [selectedHour, setSelectedHour] = useState<number>(defaultSelectedHour);

  const selectedBucket = useMemo(() => {
    return (
      hourlyStats.find((b) => b.hour === selectedHour) ??
      hourlyStats[0] ?? {
        hour: 12,
        label: '12 PM',
        shortLabel: '12p',
        typicalPct: 0,
        typicalOccupied: 0,
        sampleCount: 0,
        todayPct: null,
        todayOccupied: null,
        ingressCount: 0,
        egressCount: 0,
        isPeak: false,
      }
    );
  }, [hourlyStats, selectedHour]);

  const currentHourBucket = useMemo(
    () => hourlyStats.find((b) => b.hour === currentHour) ?? null,
    [hourlyStats, currentHour]
  );

  // Google-style live comparison message for the current Chicago hour
  const liveComparison = useMemo(() => {
    if (!isFreshLive) return null;
    if (!currentHourBucket || currentHourBucket.sampleCount === 0) {
      return {
        headline: `${liveOccupancyPct}% full right now`,
        detail: 'Collecting historical baseline for this hour',
      };
    }
    const diff = liveOccupancyPct - currentHourBucket.typicalPct;
    if (diff >= 10) {
      return {
        headline: 'Busier than usual',
        detail: `${liveOccupancyPct}% full now vs. ${currentHourBucket.typicalPct}% typical`,
      };
    }
    if (diff <= -10) {
      return {
        headline: 'Less busy than usual',
        detail: `${liveOccupancyPct}% full now vs. ${currentHourBucket.typicalPct}% typical`,
      };
    }
    return {
      headline: 'As busy as usual',
      detail: `${liveOccupancyPct}% full now · ${currentHourBucket.typicalPct}% typical`,
    };
  }, [isFreshLive, currentHourBucket, liveOccupancyPct]);

  const insights = useMemo(() => {
    const sampled = hourlyStats.filter((b) => b.sampleCount > 0);
    if (sampled.length === 0) {
      return {hasHistory: false, peakWindow: 'Building history', quietWindow: 'Building history', peakPct: 0};
    }

    const peakBuckets = sampled.filter((b) => b.isPeak);
    let peakWindow = '';
    let peakPct = 0;

    if (peakBuckets.length > 0) {
      const firstPeak = peakBuckets[0];
      const lastPeak = peakBuckets[peakBuckets.length - 1];
      peakWindow =
        firstPeak.hour === lastPeak.hour
          ? firstPeak.label
          : `${firstPeak.label} – ${lastPeak.label}`;
      peakPct = Math.max(...peakBuckets.map((b) => b.typicalPct));
    } else {
      const maxBucket = sampled.reduce((a, b) => (b.typicalPct > a.typicalPct ? b : a));
      peakWindow = maxBucket.label;
      peakPct = maxBucket.typicalPct;
    }

    const quietBucket = sampled.reduce((a, b) => (b.typicalPct < a.typicalPct ? b : a));
    const quietWindow = `${quietBucket.label} (${quietBucket.typicalPct}% typical)`;

    return {hasHistory: true, peakWindow, quietWindow, peakPct};
  }, [hourlyStats]);

  const isSelectedCurrent = selectedBucket.hour === currentHour;

  return (
    <section
      aria-label="Popular times and live occupancy"
      className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-[#131A26]"
    >
      {/* Header & Selected Hour Readout */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Popular times
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Historical typical &amp; today · Chicago ({tzShort})
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {selectedBucket.label}
            {isSelectedCurrent ? ' · Now' : ''}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isSelectedCurrent && isFreshLive ? (
              <>
                <span className="font-mono font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                  Live {liveOccupancyPct}%
                </span>
                {selectedBucket.sampleCount > 0 && (
                  <>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      Typical {selectedBucket.typicalPct}%
                    </span>
                  </>
                )}
              </>
            ) : selectedBucket.todayPct !== null ? (
              <>
                <span className="font-mono font-medium text-teal-700 tabular-nums dark:text-teal-400">
                  Today {selectedBucket.todayPct}%
                </span>
                {selectedBucket.sampleCount > 0 && (
                  <>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      Typical {selectedBucket.typicalPct}%
                    </span>
                  </>
                )}
              </>
            ) : selectedBucket.sampleCount > 0 ? (
              <>
                Typical{' '}
                <span className="font-mono font-medium text-slate-800 tabular-nums dark:text-slate-200">
                  {selectedBucket.typicalPct}%
                </span>{' '}
                full
              </>
            ) : (
              'No data for this hour yet'
            )}
          </p>
        </div>
      </div>

      {/* Google-style LIVE comparison bar */}
      {liveComparison && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800/80">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-rose-600 uppercase dark:text-rose-400">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 dark:bg-rose-400" />
            </span>
            Live
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {liveComparison.headline}
          </span>
          <span className="text-slate-500 dark:text-slate-400">· {liveComparison.detail}</span>
        </div>
      )}

      {/* Interactive Google-Style Layered Bar Chart */}
      <div className="mt-5">
        <div
          className="relative grid h-44 items-end gap-1 sm:gap-1.5"
          style={{gridTemplateColumns: `repeat(${Math.max(1, hourlyStats.length)}, minmax(0, 1fr))`}}
          role="group"
          aria-label="Hourly typical and live parking occupancy from 6 AM to 11 PM Chicago time"
        >
          {/* Subtle 50% and 80% reference hairlines */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-[80%] border-t border-dashed border-slate-200 dark:border-slate-800"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-[50%] border-t border-slate-100 dark:border-slate-800/70"
            aria-hidden="true"
          />

          {hourlyStats.map((bucket) => {
            const isCurrent = bucket.hour === currentHour;
            const isSelected = bucket.hour === selectedBucket.hour;

            const hasTypical = bucket.sampleCount > 0;
            const typicalHeight = hasTypical ? Math.max(6, Math.min(100, bucket.typicalPct)) : 4;
            const hasTodayPast = !isCurrent && bucket.todayPct !== null;
            const todayHeight = hasTodayPast
              ? Math.max(6, Math.min(100, bucket.todayPct!))
              : 0;
            const showLiveOverlay = isCurrent && isFreshLive;
            const liveHeight = showLiveOverlay ? Math.max(8, Math.min(100, liveOccupancyPct)) : 0;

            return (
              <button
                key={bucket.hour}
                type="button"
                onClick={() => setSelectedHour(bucket.hour)}
                aria-pressed={isSelected}
                aria-label={`${bucket.label}: ${
                  hasTypical ? `typical ${bucket.typicalPct}% full` : 'no historical average yet'
                }${
                  showLiveOverlay
                    ? `, live ${liveOccupancyPct}% full`
                    : hasTodayPast
                      ? `, today ${bucket.todayPct}% full`
                      : ''
                }`}
                className={`group relative flex h-full w-full items-end justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                  isSelected ? 'bg-slate-100/70 dark:bg-slate-800/40' : ''
                }`}
              >
                {/* Layer 1: Historical Typical Bar (Google Maps soft sky-blue) */}
                <span
                  className={`w-full rounded-t-md transition-[height,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    hasTypical
                      ? isSelected
                        ? 'bg-sky-300 dark:bg-sky-400/50'
                        : 'bg-sky-200 group-hover:bg-sky-300/90 dark:bg-sky-500/30 dark:group-hover:bg-sky-400/45'
                      : 'bg-slate-100 dark:bg-slate-800/80'
                  }`}
                  style={{height: `${typicalHeight}%`}}
                />

                {/* Layer 2: Earlier Today Observed Overlay */}
                {hasTodayPast && (
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t-md border-t-2 border-teal-600 bg-teal-500/25 transition-[height] duration-200 dark:border-teal-400 dark:bg-teal-400/20"
                    style={{height: `${todayHeight}%`}}
                  />
                )}

                {/* Layer 3: Google-style Translucent LIVE Overlay on Current Chicago Hour */}
                {showLiveOverlay && (
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t-md border-t-[3px] border-rose-600 bg-rose-500/60 transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-rose-300 dark:bg-rose-500/65"
                    style={{height: `${liveHeight}%`}}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Clean Axis Tick Labels */}
        <div
          className="mt-2 grid gap-1 text-center font-mono text-[10px] text-slate-400 tabular-nums dark:text-slate-500 sm:gap-1.5"
          style={{gridTemplateColumns: `repeat(${Math.max(1, hourlyStats.length)}, minmax(0, 1fr))`}}
          aria-hidden="true"
        >
          {hourlyStats.map((bucket, idx) => (
            <span
              key={bucket.hour}
              className={
                bucket.hour === currentHour
                  ? 'font-bold text-rose-600 dark:text-rose-400'
                  : bucket.hour === selectedBucket.hour
                    ? 'font-semibold text-slate-900 dark:text-slate-100'
                    : idx % 3 === 0
                      ? ''
                      : 'invisible sm:visible'
              }
            >
              {idx % 3 === 0 || bucket.hour === selectedBucket.hour || bucket.hour === currentHour
                ? bucket.shortLabel
                : ''}
            </span>
          ))}
        </div>

        {/* Unboxed Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-xs bg-sky-200 dark:bg-sky-500/40"
              aria-hidden="true"
            />
            Typical
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-xs border-t-2 border-teal-600 bg-teal-500/30 dark:border-teal-400"
              aria-hidden="true"
            />
            Today
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-xs border-t-2 border-rose-600 bg-rose-500/65 dark:border-rose-300"
              aria-hidden="true"
            />
            Live now
          </span>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            In {selectedBucket.ingressCount} · Out {selectedBucket.egressCount}
          </span>
        </div>
      </div>

      {/* Peak & Quiet Summary Strip */}
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-800/80">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Typical peak window</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {insights.peakWindow}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {insights.hasHistory
              ? `Up to ${insights.peakPct}% typical`
              : 'Updates every 10 min'}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Quietest hour</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {insights.quietWindow}
          </p>
          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
            {insights.hasHistory ? 'Easiest availability' : 'Persists across resets'}
          </p>
        </div>
      </div>
    </section>
  );
};
