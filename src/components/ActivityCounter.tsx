import React from 'react';
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
      className="rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#131A26]"
    >
      {/* Quantitative Entered / Left Split */}
      <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800/80">
        <div
          className={`p-5 transition-colors duration-200 rounded-tl-3xl ${
            ingressActive ? 'bg-teal-50/70 dark:bg-teal-950/30' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Entered
            </span>
            <ArrowDownLeft
              className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400"
              aria-hidden="true"
            />
          </div>
          <p
            className="mt-2 font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50"
            data-testid="ingress-total"
          >
            {snapshot.entered}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Vehicles in</p>
        </div>

        <div
          className={`p-5 transition-colors duration-200 rounded-tr-3xl ${
            egressActive ? 'bg-sky-50/70 dark:bg-sky-950/30' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Left</span>
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400"
              aria-hidden="true"
            />
          </div>
          <p
            className="mt-2 font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50"
            data-testid="egress-total"
          >
            {snapshot.left}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Vehicles out</p>
        </div>
      </div>

      {/* Unboxed Net Flow Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
        <span>
          Net flow:{' '}
          <strong className="font-mono font-semibold text-slate-800 tabular-nums dark:text-slate-200">
            {netLabel}
          </strong>
        </span>
        <span className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {snapshot.since ? `Since ${formatEventTime(snapshot.since)}` : 'Live counter'}
        </span>
      </div>

      {/* Recent Crossings Feed (Last 10) */}
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800/80">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recent crossings
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Latest {visibleEvents.length}
          </span>
        </div>

        {visibleEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No vehicle crossings recorded yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/70">
            {visibleEvents.map((event) => {
              const {label, signedDelta} = describeEvent(event);
              const isIn = event.direction === 'in';
              return (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        isIn
                          ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                          : 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                      }`}
                    >
                      {isIn ? (
                        <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {label}
                      </p>
                      <p className="truncate font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {formatEventTime(event.timestamp)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                      isIn
                        ? 'text-teal-700 dark:text-teal-300'
                        : 'text-sky-700 dark:text-sky-300'
                    }`}
                  >
                    {signedDelta}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
