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
      className={`flex items-center justify-between gap-3 rounded-[20px] px-4 py-3.5 transition-colors ${
        isFull
          ? 'bg-[var(--status-danger-soft)] text-[var(--ink-primary)]'
          : 'bg-[var(--status-warn-soft)] text-[var(--ink-primary)]'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            isFull ? 'text-[var(--status-danger)]' : 'text-[var(--status-warn)]'
          }`}
          strokeWidth={2}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p
            className={`text-[14px] font-semibold leading-snug ${
              isFull ? 'text-[var(--status-danger)]' : 'text-[var(--status-warn)]'
            }`}
          >
            {isFull ? 'Parking lot is currently full' : 'Low parking availability'}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-secondary)] tabular-nums">
            {isFull ? (
              <>
                <span className="font-semibold text-[var(--ink-primary)]">0</span> open spaces
                remaining. Alert threshold is{' '}
                <span className="font-semibold text-[var(--ink-primary)]">{threshold}</span>.
              </>
            ) : (
              <>
                Only <span className="font-semibold text-[var(--ink-primary)]">{available}</span>{' '}
                {available === 1 ? 'space' : 'spaces'} open — at or below your{' '}
                <span className="font-semibold text-[var(--ink-primary)]">{threshold}</span>-space
                alert.
              </>
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAdjustThreshold}
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-elevated)]/80 px-3.5 py-2 text-[12px] font-semibold text-[var(--ink-primary)] whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all hover:bg-[var(--surface-elevated)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        <span>Adjust</span>
      </button>
    </div>
  );
};
