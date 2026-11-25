import React from 'react';
import {AlertTriangle, SlidersHorizontal} from 'lucide-react';

interface LowAvailabilityBannerProps {
  available: number;
  threshold: number;
  onAdjustThreshold: () => void;
}

export const LowAvailabilityBanner: React.FC<LowAvailabilityBannerProps> = ({
  available,
  threshold,
  onAdjustThreshold,
}) => {
  if (available > threshold) return null;

  const isFull = available === 0;

  return (
    <div
      role="alert"
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
        isFull
          ? 'border-red-200 bg-red-50/90 text-red-950 dark:border-red-500/30 dark:bg-red-950/35 dark:text-red-100'
          : 'border-amber-200 bg-amber-50/90 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            isFull ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">
            {isFull ? 'Parking lot is currently full' : 'Low parking availability'}
          </p>
          <p
            className={`mt-0.5 text-xs leading-relaxed ${
              isFull ? 'text-red-800/90 dark:text-red-200/80' : 'text-amber-800/90 dark:text-amber-200/80'
            }`}
          >
            {isFull ? (
              <>
                <span className="font-mono tabular-nums font-semibold">0</span> open spaces
                remaining. Alert threshold is{' '}
                <span className="font-mono tabular-nums font-semibold">{threshold}</span>.
              </>
            ) : (
              <>
                Only{' '}
                <span className="font-mono tabular-nums font-semibold">{available}</span>{' '}
                {available === 1 ? 'space' : 'spaces'} open — at or below your{' '}
                <span className="font-mono tabular-nums font-semibold">{threshold}</span>-space
                alert.
              </>
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAdjustThreshold}
        className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isFull
            ? 'text-red-800 hover:bg-red-100/80 focus-visible:outline-red-600 dark:text-red-200 dark:hover:bg-red-900/40'
            : 'text-amber-900 hover:bg-amber-100/80 focus-visible:outline-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40'
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Adjust</span>
      </button>
    </div>
  );
};
