import React from 'react';
import {motion} from 'motion/react';
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
  const clampedValue = Math.min(alertThreshold, maxThreshold);
  const sliderPct =
    maxThreshold > 1
      ? Math.max(0, Math.min(100, ((clampedValue - 1) / (maxThreshold - 1)) * 100))
      : 100;

  return (
    <div className="space-y-7">
      {/* 1. Alerts Section (iOS Grouped Inset Section) */}
      <section aria-label="Low-availability alert settings">
        <h2 className="mb-2 px-4 text-[12px] font-semibold tracking-[0.06em] text-[var(--ink-secondary)] uppercase">
          Alerts
        </h2>
        <div className="apple-surface overflow-hidden rounded-[24px]">
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
                  Low-availability alert
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                  Show a warning banner on this device when open spaces drop to or below your
                  chosen threshold.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--status-warn-soft)] px-3 py-1 text-[14px] font-semibold text-[var(--status-warn)] tabular-nums">
                {alertThreshold}
              </span>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChangeThreshold(Math.max(1, alertThreshold - 1))}
                aria-label="Decrease alert threshold"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-recessed)] text-[var(--ink-primary)] transition-all hover:opacity-85 active:scale-92 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <Minus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </button>

              <input
                type="range"
                min={1}
                max={maxThreshold}
                value={clampedValue}
                onChange={(e) => onChangeThreshold(Number(e.target.value))}
                aria-label="Low-availability space threshold"
                style={{'--slider-pct': `${sliderPct}%`} as React.CSSProperties}
                className="apple-slider w-full cursor-pointer"
              />

              <button
                type="button"
                onClick={() => onChangeThreshold(Math.min(maxThreshold, alertThreshold + 1))}
                aria-label="Increase alert threshold"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-recessed)] text-[var(--ink-primary)] transition-all hover:opacity-85 active:scale-92 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-[var(--ink-tertiary)] tabular-nums">
              <span>1 space</span>
              <span>Alert at ≤ {alertThreshold} open</span>
              <span>{maxThreshold} spaces</span>
            </div>
          </div>

          {/* Browser Notification Row */}
          <div className="border-t border-[var(--hairline)] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Bell
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-secondary)]"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-[var(--ink-primary)]">
                    Browser alert notifications
                  </p>
                  <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)] tabular-nums">
                    Notify once when open spaces cross below {alertThreshold}.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={browserAlertsEnabled}
                aria-label="Browser alert notifications"
                onClick={() => void onToggleBrowserAlerts(!browserAlertsEnabled)}
                style={{
                  backgroundColor: browserAlertsEnabled
                    ? 'var(--status-good-fill)'
                    : 'var(--surface-recessed)',
                }}
                className="relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <motion.span
                  layout
                  transition={{type: 'spring', stiffness: 520, damping: 34}}
                  className={`inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22),0_0_0_0.5px_rgba(0,0,0,0.04)] ${
                    browserAlertsEnabled ? 'ml-auto' : 'mr-auto'
                  }`}
                />
              </button>
            </div>
            {notificationNote && (
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                {notificationNote}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 2. Appearance Section */}
      <section aria-label="Display theme">
        <h2 className="mb-2 px-4 text-[12px] font-semibold tracking-[0.06em] text-[var(--ink-secondary)] uppercase">
          Appearance
        </h2>
        <div className="apple-surface rounded-[24px] p-5 sm:p-6">
          <p className="text-[13px] leading-relaxed text-[var(--ink-secondary)]">
            Switch between daylight clarity, low-glare night mode, or follow your device setting.
          </p>

          <div className="mt-4 grid grid-cols-3 rounded-[14px] bg-[var(--surface-recessed)] p-1">
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
                  className={`relative flex min-h-[42px] items-center justify-center gap-1.5 rounded-[11px] px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    active
                      ? 'text-[var(--ink-primary)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="theme-segment-pill"
                      transition={{type: 'spring', stiffness: 500, damping: 38, mass: 0.8}}
                      className="absolute inset-0 rounded-[11px] bg-[var(--surface-elevated)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                    />
                  )}
                  <Icon
                    className="relative z-10 h-3.5 w-3.5 shrink-0"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Home Screen Installation Section */}
      <section aria-label="Install EntrySense app">
        <h2 className="mb-2 px-4 text-[12px] font-semibold tracking-[0.06em] text-[var(--ink-secondary)] uppercase">
          Home Screen
        </h2>
        <div className="apple-surface rounded-[24px] p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
            Mobile app installation
          </h3>
          <p className="mt-1 mb-4 text-[13px] leading-relaxed text-[var(--ink-secondary)]">
            Install EntrySense to your home screen for full-screen mobile viewing and cached offline
            counts.
          </p>
          <PWAInstallButton variant="card" />
        </div>
      </section>
    </div>
  );
};
