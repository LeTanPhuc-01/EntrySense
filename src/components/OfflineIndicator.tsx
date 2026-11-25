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
      className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-100/90 px-4 py-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <p className="leading-snug">
        <span className="font-semibold">Offline mode</span>
        <span className="mx-1.5 text-slate-400 dark:text-slate-500" aria-hidden="true">
          ·
        </span>
        <span className="text-slate-600 dark:text-slate-300">
          Showing last cached occupancy count. Live sync resumes automatically.
        </span>
      </p>
    </div>
  );
};
