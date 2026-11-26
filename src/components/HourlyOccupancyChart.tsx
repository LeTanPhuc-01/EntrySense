import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  const chartGridRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);

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

  const selectHourFromClientX = useCallback(
    (clientX: number) => {
      const container = chartGridRef.current;
      if (!container || hourlyStats.length === 0) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
      const idx = Math.floor(ratio * hourlyStats.length);
      const target = hourlyStats[idx];
      if (target) {
        setSelectedHour(target.hour);
      }
    },
    [hourlyStats]
  );

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
      className="apple-surface rounded-[28px] p-6 sm:p-7"
    >
      {/* Header & Selected Hour Readout */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-[var(--font-display)] text-[18px] font-semibold tracking-[-0.02em] text-[var(--ink-primary)]">
            Popular times
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
            Historical typical &amp; today · Chicago ({tzShort})
          </p>
        </div>

        <div className="text-right">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)] tabular-nums">
            {selectedBucket.label}
            {isSelectedCurrent ? ' · Now' : ''}
          </p>
          <p className="text-[12px] text-[var(--ink-secondary)] tabular-nums">
            {isSelectedCurrent && isFreshLive ? (
              <>
                <span
                  className="font-semibold"
                  style={{color: 'var(--chart-live-cap)'}}
                >
                  Live {liveOccupancyPct}%
                </span>
                {selectedBucket.sampleCount > 0 && (
                  <>
                    <span className="mx-1.5 text-[var(--ink-tertiary)]" aria-hidden="true">
                      ·
                    </span>
                    <span>Typical {selectedBucket.typicalPct}%</span>
                  </>
                )}
              </>
            ) : selectedBucket.todayPct !== null ? (
              <>
                <span
                  className="font-medium"
                  style={{color: 'var(--chart-today-cap)'}}
                >
                  Today {selectedBucket.todayPct}%
                </span>
                {selectedBucket.sampleCount > 0 && (
                  <>
                    <span className="mx-1.5 text-[var(--ink-tertiary)]" aria-hidden="true">
                      ·
                    </span>
                    <span>Typical {selectedBucket.typicalPct}%</span>
                  </>
                )}
              </>
            ) : selectedBucket.sampleCount > 0 ? (
              <>
                Typical{' '}
                <span className="font-medium text-[var(--ink-primary)]">
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

      {/* Live Comparison Strip */}
      {liveComparison && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--hairline)] pt-3.5 text-[12px]">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.06em] uppercase"
            style={{color: 'var(--chart-live-cap)'}}
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{backgroundColor: 'var(--chart-live-cap)'}}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{backgroundColor: 'var(--chart-live-cap)'}}
              />
            </span>
            Live
          </span>
          <span className="font-semibold text-[var(--ink-primary)]">
            {liveComparison.headline}
          </span>
          <span className="text-[var(--ink-secondary)] tabular-nums">
            · {liveComparison.detail}
          </span>
        </div>
      )}

      {/* Interactive Scrubbing Layered Bar Chart */}
      <div className="mt-5">
        <div
          ref={chartGridRef}
          onPointerDown={(e) => {
            isScrubbingRef.current = true;
            selectHourFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!isScrubbingRef.current) return;
            if (e.pointerType === 'mouse' && e.buttons !== 1) {
              isScrubbingRef.current = false;
              return;
            }
            selectHourFromClientX(e.clientX);
          }}
          onPointerUp={() => {
            isScrubbingRef.current = false;
          }}
          onPointerCancel={() => {
            isScrubbingRef.current = false;
          }}
          onPointerLeave={() => {
            isScrubbingRef.current = false;
          }}
          className="relative grid h-44 touch-pan-y select-none items-end gap-1 sm:gap-1.5"
          style={{gridTemplateColumns: `repeat(${Math.max(1, hourlyStats.length)}, minmax(0, 1fr))`}}
          role="group"
          aria-label="Hourly typical and live parking occupancy from 6 AM to 11 PM Chicago time"
        >
          {/* 100% and 50% reference hairlines */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-end border-t border-dashed border-[var(--hairline)]"
            aria-hidden="true"
          >
            <span className="mt-0.5 text-[10px] font-medium text-[var(--ink-tertiary)] tabular-nums">
              100%
            </span>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-[50%] flex items-end justify-end border-t border-[var(--hairline)]"
            aria-hidden="true"
          >
            <span className="mb-0.5 text-[10px] font-medium text-[var(--ink-tertiary)] tabular-nums">
              50%
            </span>
          </div>

          {hourlyStats.map((bucket, idx) => {
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
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' && idx < hourlyStats.length - 1) {
                    e.preventDefault();
                    setSelectedHour(hourlyStats[idx + 1].hour);
                  } else if (e.key === 'ArrowLeft' && idx > 0) {
                    e.preventDefault();
                    setSelectedHour(hourlyStats[idx - 1].hour);
                  }
                }}
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
                className={`group relative flex h-full w-full items-end justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isSelected ? 'bg-[var(--surface-recessed)]/75' : ''
                }`}
              >
                {/* Layer 1: Historical Typical Bar */}
                <span
                  className="w-full rounded-t-[5px] transition-[height,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    height: `${typicalHeight}%`,
                    backgroundColor: hasTypical
                      ? isSelected
                        ? 'var(--chart-typical-active)'
                        : 'var(--chart-typical)'
                      : 'var(--surface-recessed)',
                  }}
                />

                {/* Layer 2: Earlier Today Observed Overlay */}
                {hasTodayPast && (
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t-[5px] border-t-2 transition-[height] duration-200"
                    style={{
                      height: `${todayHeight}%`,
                      backgroundColor: 'var(--chart-today-fill)',
                      borderColor: 'var(--chart-today-cap)',
                    }}
                  />
                )}

                {/* Layer 3: Translucent LIVE Overlay on Current Chicago Hour */}
                {showLiveOverlay && (
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t-[5px] border-t-[2.5px] transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{
                      height: `${liveHeight}%`,
                      backgroundColor: 'var(--chart-live-fill)',
                      borderColor: 'var(--chart-live-cap)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Clean Axis Tick Labels */}
        <div
          className="mt-2 grid gap-1 text-center text-[11px] font-medium text-[var(--ink-tertiary)] tabular-nums sm:gap-1.5"
          style={{gridTemplateColumns: `repeat(${Math.max(1, hourlyStats.length)}, minmax(0, 1fr))`}}
          aria-hidden="true"
        >
          {hourlyStats.map((bucket, idx) => (
            <span
              key={bucket.hour}
              style={bucket.hour === currentHour ? {color: 'var(--chart-live-cap)'} : undefined}
              className={
                bucket.hour === currentHour
                  ? 'font-semibold'
                  : bucket.hour === selectedBucket.hour
                    ? 'font-semibold text-[var(--ink-primary)]'
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

        {/* Minimal Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--ink-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{backgroundColor: 'var(--chart-typical)'}}
              aria-hidden="true"
            />
            Typical
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full border-t-2"
              style={{
                backgroundColor: 'var(--chart-today-fill)',
                borderColor: 'var(--chart-today-cap)',
              }}
              aria-hidden="true"
            />
            Today
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full border-t-2"
              style={{
                backgroundColor: 'var(--chart-live-fill)',
                borderColor: 'var(--chart-live-cap)',
              }}
              aria-hidden="true"
            />
            Live now
          </span>
          <span className="ml-auto text-[12px] font-medium text-[var(--ink-secondary)] tabular-nums">
            In {selectedBucket.ingressCount} · Out {selectedBucket.egressCount}
          </span>
        </div>
      </div>

      {/* Peak & Quiet Summary Strip */}
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--hairline)] pt-4">
        <div>
          <p className="text-[12px] text-[var(--ink-secondary)]">Typical peak window</p>
          <p className="mt-1 text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
            {insights.peakWindow}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)] tabular-nums">
            {insights.hasHistory
              ? `Up to ${insights.peakPct}% typical`
              : 'Updates every 10 min'}
          </p>
        </div>

        <div>
          <p className="text-[12px] text-[var(--ink-secondary)]">Quietest hour</p>
          <p className="mt-1 text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)] tabular-nums">
            {insights.quietWindow}
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-[var(--status-good)]">
            {insights.hasHistory ? 'Easiest availability' : 'Persists across resets'}
          </p>
        </div>
      </div>
    </section>
  );
};
