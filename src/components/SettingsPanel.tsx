import React from 'react';
import {Bell, Minus, Monitor, Moon, Plus, Sun} from 'lucide-react';
import type {LotOccupancySnapshot, ThemePreference} from '../types/entrysense';
import {PWAInstallButton} from './PWAInstallButton';

interface SettingsPanelProps {
  snapshot: LotOccupancySnapshot;
  alertThreshold: number;
  onChangeThreshold: (next: number) => void;
  browserAlertsEnabled: boolean;
  onToggleBrowserAlerts: (enabled: boolean) => Promise<void>;
  notificationNote: string | null;
  themePreference: ThemePreference;
  onChangeTheme: (next: ThemePreference) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  snapshot,
  alertThreshold,
  onChangeThreshold,
  browserAlertsEnabled,
  onToggleBrowserAlerts,
  notificationNote,
  themePreference,
  onChangeTheme,
}) => {
  const maxThreshold = Math.max(
    10,
    Math.min(snapshot.capacity, Math.round(snapshot.capacity * 0.6))
  );

  return (
    <div className="space-y-5">
      {/* 1. Low-Availability Alert Settings (Local Device Only) */}
      <section
        aria-label="Low-availability alert settings"
        className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-[#131A26]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Low-availability alert
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Show a warning banner on this device when open spaces drop to or below your chosen
              threshold.
            </p>
          </div>
          <span className="font-mono text-2xl font-bold text-amber-600 tabular-nums dark:text-amber-400 shrink-0">
            {alertThreshold}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChangeThreshold(Math.max(1, alertThreshold - 1))}
            aria-label="Decrease alert threshold"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.97] dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>

          <input
            type="range"
            min={1}
            max={maxThreshold}
            value={Math.min(alertThreshold, maxThreshold)}
            onChange={(e) => onChangeThreshold(Number(e.target.value))}
            aria-label="Low-availability space threshold"
            className="h-2 w-full cursor-pointer accent-teal-700 dark:accent-teal-400"
          />

          <button
            type="button"
            onClick={() => onChangeThreshold(Math.min(maxThreshold, alertThreshold + 1))}
            aria-label="Increase alert threshold"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.97] dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
          <span>1 space</span>
          <span>Alert at ≤ {alertThreshold} open</span>
          <span>{maxThreshold} spaces</span>
        </div>

        {/* Optional Device Notification Toggle */}
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800/80">
          <div className="flex items-start gap-2.5 min-w-0">
            <Bell
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Browser alert notifications
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Notify once when open spaces cross below {alertThreshold}.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={browserAlertsEnabled}
            onClick={() => void onToggleBrowserAlerts(!browserAlertsEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
              browserAlertsEnabled
                ? 'bg-teal-700 dark:bg-teal-500'
                : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                browserAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {notificationNote && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{notificationNote}</p>
        )}
      </section>

      {/* 2. Appearance Toggle (Local Device Only) */}
      <section
        aria-label="Display theme"
        className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-[#131A26]"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Appearance</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Switch between daylight clarity, low-glare night mode, or follow your device setting.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-900/90">
          {(
            [
              {id: 'light', label: 'Light', icon: Sun},
              {id: 'dark', label: 'Dark', icon: Moon},
              {id: 'system', label: 'System', icon: Monitor},
            ] as const
          ).map(({id, label, icon: Icon}) => {
            const active = themePreference === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeTheme(id)}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-50'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. PWA Installation Card */}
      <section
        aria-label="Install EntrySense app"
        className="rounded-3xl border border-slate-200/90 bg-white p-6 dark:border-slate-800 dark:bg-[#131A26]"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Mobile app installation
        </h2>
        <p className="mt-1 mb-4 text-xs text-slate-500 dark:text-slate-400">
          Install EntrySense to your home screen for full-screen mobile viewing and cached offline
          counts.
        </p>
        <PWAInstallButton variant="card" />
      </section>
    </div>
  );
};
