/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useEffect, useRef, useState} from 'react';
import {BarChart3, Gauge, Moon, SlidersHorizontal, Sun} from 'lucide-react';
import {ActivityCounter} from './components/ActivityCounter';
import {HourlyOccupancyChart} from './components/HourlyOccupancyChart';
import {LowAvailabilityBanner} from './components/LowAvailabilityBanner';
import {OccupancyGauge} from './components/OccupancyGauge';
import {OfflineIndicator} from './components/OfflineIndicator';
import {PWAInstallButton} from './components/PWAInstallButton';
import {SettingsPanel} from './components/SettingsPanel';
import {useEntrySenseStream} from './hooks/useEntrySenseStream';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {useTheme} from './hooks/useTheme';

type MobileTab = 'live' | 'trends' | 'settings';

const THRESHOLD_STORAGE_KEY = 'entrysense-alert-threshold';
const BROWSER_ALERTS_STORAGE_KEY = 'entrysense-browser-alerts';

function readStoredThreshold(): number {
  if (typeof window === 'undefined') return 15;
  try {
    const parsed = Number.parseInt(localStorage.getItem(THRESHOLD_STORAGE_KEY) || '', 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000) {
      return parsed;
    }
  } catch {
    // Ignore storage read errors
  }
  return 15;
}

function readStoredBrowserAlerts(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(BROWSER_ALERTS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function App() {
  const isOnline = useOnlineStatus();
  const {preference: themePreference, resolvedTheme, setTheme, toggleLightDark} = useTheme();
  const {
    snapshot,
    loading,
    error,
    connectionState,
    lastPulse,
    refreshSnapshot,
  } = useEntrySenseStream(isOnline);

  const [activeTab, setActiveTab] = useState<MobileTab>('live');
  const [desktopSection, setDesktopSection] = useState<'overview' | 'settings'>('overview');
  const [alertThreshold, setAlertThreshold] = useState<number>(readStoredThreshold);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState<boolean>(readStoredBrowserAlerts);
  const [notificationNote, setNotificationNote] = useState<string | null>(null);
  const previousAvailableRef = useRef<number | null>(null);

  const handleChangeThreshold = (next: number) => {
    const clamped = Math.max(1, Math.round(next));
    setAlertThreshold(clamped);
    try {
      localStorage.setItem(THRESHOLD_STORAGE_KEY, String(clamped));
    } catch {
      // Ignore storage write errors
    }
  };

  const handleToggleBrowserAlerts = async (enabled: boolean) => {
    setNotificationNote(null);
    if (!enabled) {
      setBrowserAlertsEnabled(false);
      try {
        localStorage.setItem(BROWSER_ALERTS_STORAGE_KEY, 'false');
      } catch {
        // Ignore storage errors
      }
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationNote('This browser does not support system notifications.');
      setBrowserAlertsEnabled(false);
      return;
    }

    if (Notification.permission === 'granted') {
      setBrowserAlertsEnabled(true);
      try {
        localStorage.setItem(BROWSER_ALERTS_STORAGE_KEY, 'true');
      } catch {
        // Ignore storage errors
      }
      return;
    }

    if (Notification.permission === 'denied') {
      setNotificationNote(
        'Notifications are blocked in browser settings. The in-app banner still alerts you automatically.'
      );
      setBrowserAlertsEnabled(false);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      setBrowserAlertsEnabled(granted);
      localStorage.setItem(BROWSER_ALERTS_STORAGE_KEY, String(granted));
      if (!granted) {
        setNotificationNote(
          'Notification permission was not granted. In-app low-availability alerts remain active.'
        );
      }
    } catch {
      setNotificationNote('Unable to request notification permission in this context.');
      setBrowserAlertsEnabled(false);
    }
  };

  // Trigger a one-shot browser notification only when crossing from above threshold to at/below threshold
  useEffect(() => {
    if (!snapshot || !snapshot.hasLiveSync) return;
    const prev = previousAvailableRef.current;
    previousAvailableRef.current = snapshot.free;

    if (
      browserAlertsEnabled &&
      prev !== null &&
      prev > alertThreshold &&
      snapshot.free <= alertThreshold &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification('EntrySense — Low Availability', {
          body:
            snapshot.free === 0
              ? `${snapshot.lotName} is now full (0 spaces free).`
              : `${snapshot.lotName} has only ${snapshot.free} spaces free.`,
          icon: '/pwa-192x192.png',
        });
      } catch {
        // Ignore notification errors in restricted contexts
      }
    }
  }, [snapshot, alertThreshold, browserAlertsEnabled]);

  const jumpToAlertSettings = () => {
    setActiveTab('settings');
    setDesktopSection('settings');
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-slate-900 transition-colors duration-200 dark:bg-[#0B0F17] dark:text-slate-50">
      {/* Compact Sticky Top Bar (52px mobile / 56px desktop) */}
      <header className="sticky top-0 z-30 h-[52px] border-b border-slate-200/80 bg-[#F8FAFC]/85 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0B0F17]/85 lg:h-14">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('live');
              setDesktopSection('overview');
            }}
            className="flex items-center gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 rounded-lg whitespace-nowrap shrink-0"
          >
            <img
              src="/icon.png"
              alt=""
              width={26}
              height={26}
              className="h-6.5 w-6.5 rounded-lg shrink-0"
            />
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
              EntrySense
            </span>
          </button>

          {/* Zone 2: Clean Desktop Single-Line Text Nav */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-6 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setDesktopSection('overview')}
              className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                desktopSection === 'overview'
                  ? 'text-slate-900 dark:text-slate-50'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Overview
              {desktopSection === 'overview' && (
                <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-teal-600 dark:bg-teal-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setDesktopSection('settings')}
              className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                desktopSection === 'settings'
                  ? 'text-slate-900 dark:text-slate-50'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Settings
              {desktopSection === 'settings' && (
                <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-teal-600 dark:bg-teal-400" />
              )}
            </button>
          </nav>

          {/* Zone 3: Install Action + Adaptive Theme Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={toggleLightDark}
              aria-label={
                resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 pt-5 pb-24 sm:px-6 lg:py-8">
        <div className="space-y-5">
          <OfflineIndicator isOnline={isOnline} />

          {loading && !snapshot ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="h-[430px] animate-pulse rounded-3xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-[#131A26] lg:col-span-5" />
              <div className="h-[430px] animate-pulse rounded-3xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-[#131A26] lg:col-span-7" />
            </div>
          ) : !snapshot ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#131A26]">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Unable to load occupancy data
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {error || 'Check your connection and try again.'}
              </p>
              <button
                type="button"
                onClick={() => void refreshSnapshot()}
                className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950"
              >
                Retry connection
              </button>
            </div>
          ) : (
            <>
              {/* MOBILE TABBED LAYOUT (< lg) */}
              <div className="space-y-5 lg:hidden">
                {activeTab === 'live' && (
                  <>
                    {snapshot.hasLiveSync && (
                      <LowAvailabilityBanner
                        available={snapshot.free}
                        threshold={alertThreshold}
                        onAdjustThreshold={jumpToAlertSettings}
                      />
                    )}
                    <OccupancyGauge
                      snapshot={snapshot}
                      alertThreshold={alertThreshold}
                      connectionState={connectionState}
                      onRefresh={() => void refreshSnapshot()}
                    />
                    <ActivityCounter snapshot={snapshot} lastPulse={lastPulse} />
                  </>
                )}

                {activeTab === 'trends' && (
                  <>
                    {snapshot.hasLiveSync && (
                      <LowAvailabilityBanner
                        available={snapshot.free}
                        threshold={alertThreshold}
                        onAdjustThreshold={jumpToAlertSettings}
                      />
                    )}
                    <HourlyOccupancyChart snapshot={snapshot} />
                  </>
                )}

                {activeTab === 'settings' && (
                  <SettingsPanel
                    snapshot={snapshot}
                    alertThreshold={alertThreshold}
                    onChangeThreshold={handleChangeThreshold}
                    browserAlertsEnabled={browserAlertsEnabled}
                    onToggleBrowserAlerts={handleToggleBrowserAlerts}
                    notificationNote={notificationNote}
                    themePreference={themePreference}
                    onChangeTheme={setTheme}
                  />
                )}
              </div>

              {/* DESKTOP EXPANDED LAYOUT (>= lg) */}
              <div className="hidden lg:block">
                {desktopSection === 'overview' ? (
                  <div className="space-y-6">
                    {snapshot.hasLiveSync && (
                      <LowAvailabilityBanner
                        available={snapshot.free}
                        threshold={alertThreshold}
                        onAdjustThreshold={jumpToAlertSettings}
                      />
                    )}

                    <div className="grid grid-cols-12 items-start gap-6">
                      <div className="col-span-5 space-y-6">
                        <OccupancyGauge
                          snapshot={snapshot}
                          alertThreshold={alertThreshold}
                          connectionState={connectionState}
                          onRefresh={() => void refreshSnapshot()}
                        />
                      </div>

                      <div className="col-span-7 space-y-6">
                        <HourlyOccupancyChart snapshot={snapshot} />
                        <ActivityCounter snapshot={snapshot} lastPulse={lastPulse} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl">
                    <SettingsPanel
                      snapshot={snapshot}
                      alertThreshold={alertThreshold}
                      onChangeThreshold={handleChangeThreshold}
                      browserAlertsEnabled={browserAlertsEnabled}
                      onToggleBrowserAlerts={handleToggleBrowserAlerts}
                      notificationNote={notificationNote}
                      themePreference={themePreference}
                      onChangeTheme={setTheme}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Fixed Mobile Bottom Navigation Bar (Thumb Zone Anchor, 60px height) */}
      <nav
        aria-label="Mobile sections"
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-slate-200/90 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-[#0B0F17]/90 lg:hidden pb-safe"
      >
        <div className="mx-auto grid h-[60px] max-w-lg grid-cols-3 items-center">
          {(
            [
              {id: 'live', label: 'Live', icon: Gauge},
              {id: 'trends', label: 'Trends', icon: BarChart3},
              {id: 'settings', label: 'Settings', icon: SlidersHorizontal},
            ] as const
          ).map(({id, label, icon: Icon}) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.8} aria-hidden="true" />
                <span className="text-[11px] font-semibold tracking-tight leading-none">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
