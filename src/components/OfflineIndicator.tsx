import React from 'react';
import {WifiOff} from 'lucide-react';

interface OfflineIndicatorProps {
  isOnline: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({isOnline}) => {
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="apple-surface flex items-center gap-3 rounded-[20px] px-4 py-3 text-[13px] text-[var(--ink-primary)]"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-[var(--status-warn)]" strokeWidth={2} aria-hidden="true" />
      <p className="leading-snug">
        <span className="font-semibold">Offline mode</span>
        <span className="mx-1.5 text-[var(--ink-tertiary)]" aria-hidden="true">
          ·
        </span>
        <span className="text-[var(--ink-secondary)]">
          Showing last cached occupancy count. Live sync resumes automatically.
        </span>
      </p>
    </div>
  );
};
