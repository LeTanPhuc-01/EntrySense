/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useEffect, useRef, useState} from 'react';
import {AnimatePresence, MotionConfig, motion} from 'motion/react';
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
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-[var(--surface-canvas)] text-[var(--ink-primary)] transition-colors duration-200">
        {/* Sticky Frosted Glass Toolbar */}
        <header className="apple-glass sticky top-0 z-30 h-[52px] border-b border-[var(--hairline)] lg:h-14">
          <div className="mx-auto flex h-full max-w-[1040px] items-center justify-between gap-4 px-4 sm:px-6">
            {/* Brand Wordmark */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('live');
                setDesktopSection('overview');
              }}
              className="flex shrink-0 items-center gap-2.5 rounded-xl py-1 text-left whitespace-nowrap transition-opacity active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <img
                src="/icon.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-[8px] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              />
              <span className="font-[var(--font-display)] text-[17px] font-semibold tracking-[-0.025em] text-[var(--ink-primary)]">
                EntrySense
              </span>
            </button>

            {/* Desktop Segmented Control */}
            <nav
              aria-label="Primary navigation"
              className="hidden items-center rounded-full bg-[var(--surface-recessed)] p-1 lg:flex"
            >
              {(
                [
                  {id: 'overview', label: 'Overview'},
                  {id: 'settings', label: 'Settings'},
                ] as const
              ).map(({id, label}) => {
                const active = desktopSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDesktopSection(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative rounded-full px-4 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      active
                        ? 'text-[var(--ink-primary)]'
                        : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="desktop-nav-pill"
                        transition={{type: 'spring', stiffness: 500, damping: 38, mass: 0.8}}
                        className="absolute inset-0 rounded-full bg-[var(--surface-elevated)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Install Action + Adaptive Theme Toggle */}
            <div className="flex shrink-0 items-center gap-1.5">
              <PWAInstallButton variant="header" />
              <button
                type="button"
                onClick={toggleLightDark}
                aria-label={
                  resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
                }
                title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--ink-secondary)] transition-all hover:bg-[var(--surface-recessed)] hover:text-[var(--ink-primary)] active:scale-92 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <Moon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-[1040px] px-4 pt-5 pb-28 sm:px-6 lg:py-10">
          <div className="space-y-5">
            <OfflineIndicator isOnline={isOnline} />

            {loading && !snapshot ? (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <div className="apple-surface h-[440px] animate-pulse rounded-[28px] p-6 lg:col-span-5" />
                <div className="apple-surface h-[440px] animate-pulse rounded-[28px] p-6 lg:col-span-7" />
              </div>
            ) : !snapshot ? (
              <div className="apple-surface mx-auto max-w-md rounded-[28px] p-8 text-center">
                <h1 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-0.02em] text-[var(--ink-primary)]">
                  Unable to load occupancy data
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
                  {error || 'Check your connection and try again.'}
                </p>
                <button
                  type="button"
                  onClick={() => void refreshSnapshot()}
                  className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--accent)] px-6 py-2.5 text-[14px] font-semibold text-white transition-transform hover:opacity-92 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  Retry connection
                </button>
              </div>
            ) : (
              <>
                {/* MOBILE TABBED LAYOUT (< lg) */}
                <div className="lg:hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeTab}
                      initial={{opacity: 0, y: 6}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -4}}
                      transition={{duration: 0.16, ease: [0.22, 1, 0.36, 1]}}
                      className="space-y-5"
                    >
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
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* DESKTOP EXPANDED LAYOUT (>= lg) */}
                <div className="hidden lg:block">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={desktopSection}
                      initial={{opacity: 0, y: 6}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -4}}
                      transition={{duration: 0.16, ease: [0.22, 1, 0.36, 1]}}
                    >
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
                        <div className="mx-auto max-w-[680px]">
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
                    </motion.div>
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </main>

        {/* Floating iOS Glass Tab Dock (< lg) */}
        <nav
          aria-label="Mobile sections"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
        >
          <div className="apple-dock pointer-events-auto grid w-full max-w-[330px] grid-cols-3 rounded-full p-1.5">
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
                  className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    active
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="mobile-tab-pill"
                      transition={{type: 'spring', stiffness: 460, damping: 36}}
                      className="absolute inset-0 rounded-full bg-[var(--accent-soft)]"
                    />
                  )}
                  <Icon
                    className="relative z-10 h-[19px] w-[19px]"
                    strokeWidth={active ? 2.2 : 1.75}
                    aria-hidden="true"
                  />
                  <span className="relative z-10 text-[11px] font-semibold tracking-[-0.01em] leading-none">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </MotionConfig>
  );
}
