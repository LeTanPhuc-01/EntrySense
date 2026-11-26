import React from 'react';
import {motion} from 'motion/react';
import {ArrowDownLeft, ArrowUpRight} from 'lucide-react';
import type {SignalPulse} from '../hooks/useEntrySenseStream';
import type {CrossingEvent, LotOccupancySnapshot} from '../types/entrysense';

interface ActivityCounterProps {
  snapshot: LotOccupancySnapshot;
  lastPulse: SignalPulse | null;
}

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', second: '2-digit'});
}

function describeEvent(event: CrossingEvent): {label: string; signedDelta: string} {
  if (event.direction === 'in') {
    return {
      label: 'Vehicle entered',
      signedDelta: '+1',
    };
  }
  return {
    label: 'Vehicle exited',
    signedDelta: '-1',
  };
}

export const ActivityCounter: React.FC<ActivityCounterProps> = ({snapshot, lastPulse}) => {
  const ingressActive = lastPulse?.direction === 'in';
  const egressActive = lastPulse?.direction === 'out';
  const netLabel = snapshot.netFlow > 0 ? `+${snapshot.netFlow}` : `${snapshot.netFlow}`;

  const visibleEvents = snapshot.events.slice(0, 10);

  return (
    <section
      aria-label="Live entered and left activity"
      className="apple-surface overflow-hidden rounded-[28px]"
    >
      {/* Quantitative Entered / Left Split */}
      <div className="grid grid-cols-2 divide-x divide-[var(--hairline)]">
        <div
          className={`p-5 sm:p-6 transition-colors duration-300 ${
            ingressActive ? 'bg-[var(--status-good-soft)]' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[var(--ink-secondary)]">Entered</span>
            <ArrowDownLeft
              className="h-3.5 w-3.5 shrink-0 text-[var(--status-good)]"
              strokeWidth={2}
              aria-hidden="true"
            />
          </div>
          <p
            className="mt-2 font-[var(--font-display)] text-[32px] font-semibold leading-none tracking-[-0.03em] text-[var(--ink-primary)] tabular-nums"
            data-testid="ingress-total"
          >
            {snapshot.entered}
          </p>
          <p className="mt-1.5 text-[12px] text-[var(--ink-tertiary)]">Vehicles in</p>
        </div>

        <div
          className={`p-5 sm:p-6 transition-colors duration-300 ${
            egressActive ? 'bg-[var(--accent-soft)]' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[var(--ink-secondary)]">Left</span>
            <ArrowUpRight
              className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
              strokeWidth={2}
              aria-hidden="true"
            />
          </div>
          <p
            className="mt-2 font-[var(--font-display)] text-[32px] font-semibold leading-none tracking-[-0.03em] text-[var(--ink-primary)] tabular-nums"
            data-testid="egress-total"
          >
            {snapshot.left}
          </p>
          <p className="mt-1.5 text-[12px] text-[var(--ink-tertiary)]">Vehicles out</p>
        </div>
      </div>

      {/* Quiet Net Flow Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] px-5 py-3 text-[12px] text-[var(--ink-secondary)] sm:px-6">
        <span>
          Net flow{' '}
          <strong className="font-semibold text-[var(--ink-primary)] tabular-nums">
            {netLabel}
          </strong>
        </span>
        <span className="truncate text-[12px] text-[var(--ink-tertiary)] tabular-nums">
          {snapshot.since ? `Since ${formatEventTime(snapshot.since)}` : 'Live counter'}
        </span>
      </div>

      {/* Recent Crossings Inset List (No rounded-square icon tiles) */}
      <div className="border-t border-[var(--hairline)] px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <h2 className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.015em] text-[var(--ink-primary)]">
            Recent crossings
          </h2>
          <span className="text-[12px] text-[var(--ink-tertiary)] tabular-nums">
            Latest {visibleEvents.length}
          </span>
        </div>

        {visibleEvents.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--ink-secondary)]">
            No vehicle crossings recorded yet.
          </p>
        ) : (
          <ul className="mt-2.5 divide-y divide-[var(--hairline)]">
            {visibleEvents.map((event) => {
              const {label, signedDelta} = describeEvent(event);
              const isIn = event.direction === 'in';
              return (
                <motion.li
                  key={event.id}
                  initial={{opacity: 0, y: -5}}
                  animate={{opacity: 1, y: 0}}
                  transition={{duration: 0.2, ease: [0.22, 1, 0.36, 1]}}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1.5 last:pb-1"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {isIn ? (
                      <ArrowDownLeft
                        className="h-4 w-4 shrink-0 text-[var(--status-good)]"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-[var(--accent)]"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[var(--ink-primary)]">
                        {label}
                      </p>
                      <p className="truncate text-[12px] text-[var(--ink-tertiary)] tabular-nums">
                        {formatEventTime(event.timestamp)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 text-[14px] font-semibold tabular-nums ${
                      isIn ? 'text-[var(--status-good)]' : 'text-[var(--accent)]'
                    }`}
                  >
                    {signedDelta}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
