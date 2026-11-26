import React, {useEffect, useState} from 'react';
import {motion} from 'motion/react';
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

  const statusTone = !snapshot.hasLiveSync || isCounterOffline
    ? {
        stroke: 'var(--ink-tertiary)',
        text: 'text-[var(--ink-secondary)]',
        bar: 'var(--ink-tertiary)',
      }
    : isFull
      ? {
          stroke: 'var(--status-danger-fill)',
          text: 'text-[var(--status-danger)]',
          bar: 'var(--status-danger-fill)',
        }
      : isLow || isCountStale
        ? {
            stroke: 'var(--status-warn-fill)',
            text: 'text-[var(--status-warn)]',
            bar: 'var(--status-warn-fill)',
          }
        : {
            stroke: 'var(--status-good-fill)',
            text: 'text-[var(--status-good)]',
            bar: 'var(--status-good-fill)',
          };

  // SVG Ring geometry (240x240 viewBox)
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const freeRatio = snapshot.capacity > 0 ? freeSpaces / snapshot.capacity : 0;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, freeRatio)));
  const clampedOccupancyPct =
    snapshot.capacity > 0
      ? Math.min(100, Math.max(0, Math.round((snapshot.occupied / snapshot.capacity) * 100)))
      : 0;

  let freshnessLabel = 'Connecting';
  let pillStyle = 'bg-[var(--surface-recessed)] text-[var(--ink-secondary)]';
  let dotStyle = 'bg-[var(--ink-tertiary)]';
  let isLiveActive = false;

  if (connectionState === 'offline') {
    freshnessLabel = 'Cached';
  } else if (!snapshot.hasLiveSync) {
    freshnessLabel = connectionState === 'reconnecting' ? 'Reconnecting' : 'Connecting';
  } else if (isCounterOffline) {
    freshnessLabel = 'Counter offline';
    pillStyle = 'bg-[var(--status-danger-soft)] text-[var(--status-danger)]';
    dotStyle = 'bg-[var(--status-danger-fill)]';
  } else if (isCountStale) {
    freshnessLabel = 'Stale';
    pillStyle = 'bg-[var(--status-warn-soft)] text-[var(--status-warn)]';
    dotStyle = 'bg-[var(--status-warn-fill)]';
  } else if (connectionState === 'reconnecting') {
    freshnessLabel = 'Reconnecting';
    pillStyle = 'bg-[var(--status-warn-soft)] text-[var(--status-warn)]';
    dotStyle = 'bg-[var(--status-warn-fill)]';
  } else {
    freshnessLabel = snapshot.source === 'pi' ? 'Live · from Pi' : 'Live';
    pillStyle = 'bg-[var(--status-good-soft)] text-[var(--status-good)]';
    dotStyle = 'bg-[var(--status-good-fill)]';
    isLiveActive = true;
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    window.setTimeout(() => setIsRefreshing(false), 450);
  };

  return (
    <section
      aria-label="Live parking occupancy"
      className="apple-surface rounded-[28px] p-6 sm:p-7"
    >
      {/* Top Lot Heading + Status Pill & Freshness */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-[var(--font-display)] text-[22px] font-semibold tracking-[-0.03em] leading-tight text-[var(--ink-primary)] text-balance sm:text-[24px]">
            {snapshot.lotName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--ink-secondary)]">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${pillStyle}`}
            >
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                {isLiveActive && (
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotStyle}`}
                  />
                )}
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotStyle}`} />
              </span>
              <span>{freshnessLabel}</span>
            </span>
            <span className="tabular-nums">{formatAgeLabel(ageSec)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh occupancy snapshot"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-[var(--ink-secondary)] transition-all hover:bg-[var(--surface-recessed)] hover:text-[var(--ink-primary)] active:scale-92 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <RefreshCw
            className={`h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isRefreshing ? 'rotate-180' : ''
            }`}
            strokeWidth={1.9}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Inline Stale / Offline Notice (numbers remain visible) */}
      {(isCountStale || isCounterOffline) && (
        <div
          role="status"
          className={`mt-4 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px] font-medium ${
            isCounterOffline
              ? 'bg-[var(--status-danger-soft)] text-[var(--status-danger)]'
              : 'bg-[var(--status-warn-soft)] text-[var(--status-warn)]'
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span>
            {isCounterOffline
              ? 'Counter offline — showing the last recorded count.'
              : 'Count may be out of date — waiting for next update.'}
          </span>
        </div>
      )}

      {/* Focal Precision Availability Ring */}
      <div className="my-7 flex flex-col items-center justify-center">
        <div className="relative flex h-[236px] w-[236px] items-center justify-center sm:h-[248px] sm:w-[248px]">
          <svg
            viewBox="0 0 240 240"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label={`${freeSpaces} of ${snapshot.capacity} spaces free, ${statusLabel}`}
          >
            {/* Outer neutral track */}
            <circle
              cx="120"
              cy="120"
              r={radius}
              fill="none"
              strokeWidth="11"
              stroke="var(--surface-recessed)"
            />
            {/* Inner precision dial ticks */}
            <circle
              cx="120"
              cy="120"
              r={84}
              fill="none"
              strokeWidth="1.5"
              strokeDasharray="1 11.2"
              strokeLinecap="round"
              stroke="var(--ink-tertiary)"
              opacity="0.32"
            />
            {/* Spring-animated progress arc */}
            <motion.circle
              cx="120"
              cy="120"
              r={radius}
              fill="none"
              strokeWidth="11"
              strokeLinecap="round"
              stroke={statusTone.stroke}
              strokeDasharray={circumference}
              initial={false}
              animate={{strokeDashoffset: dashOffset}}
              transition={{type: 'spring', stiffness: 120, damping: 24, mass: 0.9}}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span
              className="font-[var(--font-display)] text-[68px] font-semibold leading-none tracking-[-0.045em] text-[var(--ink-primary)] tabular-nums sm:text-[72px]"
              data-testid="available-count"
            >
              {freeSpaces}
            </span>
            <span className="mt-2 text-[14px] font-medium text-[var(--ink-secondary)]">
              {freeSpaces === 1 ? 'Space free' : 'Spaces free'}
            </span>
            <span className={`mt-1 text-[12px] font-semibold tracking-[-0.01em] ${statusTone.text}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Capacity Meter */}
      <div className="border-t border-[var(--hairline)] pt-5">
        <div className="flex items-baseline justify-between text-[13px]">
          <div className="text-[var(--ink-secondary)] tabular-nums">
            <span className="font-semibold text-[var(--ink-primary)]">{snapshot.occupied}</span>{' '}
            of{' '}
            <span className="font-semibold text-[var(--ink-primary)]">{snapshot.capacity}</span>{' '}
            occupied
          </div>
          <span className="font-semibold text-[var(--ink-primary)] tabular-nums">
            {clampedOccupancyPct}% full
          </span>
        </div>

        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-recessed)]"
          aria-hidden="true"
        >
          <motion.div
            className="h-full rounded-full"
            style={{backgroundColor: statusTone.bar}}
            initial={false}
            animate={{width: `${clampedOccupancyPct}%`}}
            transition={{type: 'spring', stiffness: 140, damping: 26}}
          />
        </div>
      </div>
    </section>
  );
};
