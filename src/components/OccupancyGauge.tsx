import React, {useEffect, useState} from 'react';
import {AlertTriangle, RefreshCw} from 'lucide-react';
import type {ConnectionState, LotOccupancySnapshot} from '../types/entrysense';

interface OccupancyGaugeProps {
  snapshot: LotOccupancySnapshot;
  alertThreshold: number;
  connectionState: ConnectionState;
  onRefresh: () => void;
}

const STALE_THRESHOLD_SEC = 150; // 2 missed 60s keepalives
const OFFLINE_THRESHOLD_SEC = 900; // 15 minutes

function getAgeSeconds(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 1000));
}

function formatAgeLabel(ageSec: number | null): string {
  if (ageSec === null) return 'Waiting for first count';
  if (ageSec < 5) return 'Updated just now';
  if (ageSec < 60) return `Updated ${ageSec}s ago`;
  const diffMin = Math.floor(ageSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `Updated ${diffHr}h ago`;
}

export const OccupancyGauge: React.FC<OccupancyGaugeProps> = ({
  snapshot,
  alertThreshold,
  connectionState,
  onRefresh,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  const ageSec = getAgeSeconds(snapshot.updatedAt, nowMs);
  const isCounterOffline = snapshot.hasLiveSync && ageSec !== null && ageSec >= OFFLINE_THRESHOLD_SEC;
  const isCountStale =
    snapshot.hasLiveSync &&
    ageSec !== null &&
    ageSec >= STALE_THRESHOLD_SEC &&
    ageSec < OFFLINE_THRESHOLD_SEC;

  const freeSpaces = Math.max(0, snapshot.free);
  const isFull = freeSpaces === 0;
  const isLow = !isFull && freeSpaces <= alertThreshold;

  const statusLabel = !snapshot.hasLiveSync
    ? 'Awaiting Data'
    : isCounterOffline
      ? 'Counter offline'
      : isFull
        ? 'Lot Full'
        : isLow
          ? 'Low Availability'
          : 'Spaces Free';

  const strokeColorClass = !snapshot.hasLiveSync || isCounterOffline
    ? 'stroke-slate-300 dark:stroke-slate-700'
    : isFull
      ? 'stroke-red-600 dark:stroke-red-400'
      : isLow || isCountStale
        ? 'stroke-amber-500 dark:stroke-amber-400'
        : 'stroke-emerald-600 dark:stroke-emerald-400';

  const statusTextClass = !snapshot.hasLiveSync || isCounterOffline
    ? 'text-slate-500 dark:text-slate-400'
    : isFull
      ? 'text-red-700 dark:text-red-400'
      : isLow || isCountStale
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';

  const barColorClass = !snapshot.hasLiveSync || isCounterOffline
    ? 'bg-slate-300 dark:bg-slate-700'
    : isFull
      ? 'bg-red-600 dark:bg-red-400'
      : isLow
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-emerald-600 dark:bg-emerald-400';

  // SVG Ring geometry (240x240 viewBox)
  const radius = 98;
  const circumference = 2 * Math.PI * radius;
  const freeRatio = snapshot.capacity > 0 ? freeSpaces / snapshot.capacity : 0;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, freeRatio)));
  const clampedOccupancyPct =
    snapshot.capacity > 0
      ? Math.min(100, Math.max(0, Math.round((snapshot.occupied / snapshot.capacity) * 100)))
      : 0;

  let freshnessLabel = 'Connecting';
  let dotTone = 'bg-slate-400';
  if (connectionState === 'offline') {
    freshnessLabel = 'Cached';
    dotTone = 'bg-slate-400';
  } else if (!snapshot.hasLiveSync) {
    freshnessLabel = connectionState === 'reconnecting' ? 'Reconnecting' : 'Connecting';
    dotTone = 'bg-slate-400';
  } else if (isCounterOffline) {
    freshnessLabel = 'Counter offline';
    dotTone = 'bg-red-500';
  } else if (isCountStale) {
    freshnessLabel = 'Stale';
    dotTone = 'bg-amber-500';
  } else if (connectionState === 'reconnecting') {
    freshnessLabel = 'Reconnecting';
    dotTone = 'bg-amber-500';
  } else {
    freshnessLabel = snapshot.source === 'pi' ? 'Live · from Pi' : 'Live';
    dotTone = 'bg-emerald-500 dark:bg-emerald-400';
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    window.setTimeout(() => setIsRefreshing(false), 450);
  };

  return (
    <section
      aria-label="Live parking occupancy"
      className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-[#131A26]"
    >
      {/* Top Lot Heading + Source & Freshness */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 text-balance dark:text-slate-50 sm:text-2xl">
            {snapshot.lotName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
              <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} aria-hidden="true" />
              <span>{freshnessLabel}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatAgeLabel(ageSec)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh occupancy snapshot"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <RefreshCw
            className={`h-4 w-4 transition-transform duration-300 ${
              isRefreshing ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Inline Stale / Offline Notice (numbers remain visible) */}
      {(isCountStale || isCounterOffline) && (
        <div
          role="status"
          className={`mt-4 flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-medium ${
            isCounterOffline
              ? 'border-red-200/80 bg-red-50/70 text-red-800 dark:border-red-500/30 dark:bg-red-950/35 dark:text-red-200'
              : 'border-amber-200/80 bg-amber-50/70 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-200'
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {isCounterOffline
              ? 'Counter offline — showing the last recorded count.'
              : 'Count may be out of date — waiting for next update.'}
          </span>
        </div>
      )}

      {/* Focal Anchor: Radial Availability Gauge */}
      <div className="my-6 flex flex-col items-center justify-center">
        <div className="relative flex h-56 w-56 items-center justify-center sm:h-60 sm:w-60">
          <svg
            viewBox="0 0 240 240"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label={`${freeSpaces} of ${snapshot.capacity} spaces free, ${statusLabel}`}
          >
            <circle
              cx="120"
              cy="120"
              r={radius}
              fill="none"
              strokeWidth="14"
              className="stroke-slate-100 dark:stroke-slate-800"
            />
            <circle
              cx="120"
              cy="120"
              r={radius}
              fill="none"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={`${strokeColorClass} transition-[stroke-dashoffset,stroke] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <span
              className="font-mono text-6xl font-bold leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-50"
              data-testid="available-count"
            >
              {freeSpaces}
            </span>
            <span className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              {freeSpaces === 1 ? 'Space free' : 'Spaces free'}
            </span>
            <span className={`mt-1.5 text-xs font-semibold ${statusTextClass}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Quantitative Summary separated by hairline divider */}
      <div className="border-t border-slate-100 pt-5 dark:border-slate-800/80">
        <div className="flex items-baseline justify-between text-sm">
          <div className="text-slate-600 dark:text-slate-400">
            <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {snapshot.occupied}
            </span>{' '}
            of{' '}
            <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {snapshot.capacity}
            </span>{' '}
            occupied
          </div>
          <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {clampedOccupancyPct}% full
          </span>
        </div>

        <div
          className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          aria-hidden="true"
        >
          <div
            className={`h-full rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${barColorClass}`}
            style={{width: `${clampedOccupancyPct}%`}}
          />
        </div>
      </div>
    </section>
  );
};
