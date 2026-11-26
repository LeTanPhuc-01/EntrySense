import React, {useEffect, useId, useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence, motion} from 'motion/react';
import {Download, Monitor, MoreVertical, PlusSquare, Share, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
}

type InstallPlatform = 'ios' | 'android' | 'desktop';

const PLATFORM_OPTIONS: ReadonlyArray<{id: InstallPlatform; label: string}> = [
  {id: 'ios', label: 'iOS'},
  {id: 'android', label: 'Android'},
  {id: 'desktop', label: 'Desktop'},
];

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({variant = 'header'}) => {
  const {isInstallable, isInstalled, isIOS, isAndroid, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const detectedPlatform: InstallPlatform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  const [selectedPlatform, setSelectedPlatform] = useState<InstallPlatform>(detectedPlatform);
  const pillLayoutId = useId();

  useEffect(() => {
    if (!showGuide) {
      setSelectedPlatform(detectedPlatform);
    }
  }, [detectedPlatform, showGuide]);

  useEffect(() => {
    if (!showGuide) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowGuide(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showGuide]);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <p className="text-[13px] text-[var(--ink-secondary)]">
          EntrySense is installed and running in standalone app mode.
        </p>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === 'header'
            ? 'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-semibold text-white whitespace-nowrap transition-all hover:opacity-92 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
            : 'inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-[14px] font-semibold text-white whitespace-nowrap transition-all hover:opacity-92 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
        }
      >
        <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  const openGuide = () => {
    setSelectedPlatform(detectedPlatform);
    setShowGuide(true);
  };

  const modal =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {showGuide && (
              <motion.div
                initial={{opacity: 0}}
                animate={{opacity: 1}}
                exit={{opacity: 0}}
                transition={{duration: 0.18}}
                onClick={() => setShowGuide(false)}
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-md sm:items-center sm:p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pwa-install-title"
              >
                <motion.div
                  initial={{opacity: 0, y: 24, scale: 0.98}}
                  animate={{opacity: 1, y: 0, scale: 1}}
                  exit={{opacity: 0, y: 20, scale: 0.98}}
                  transition={{type: 'spring', stiffness: 420, damping: 34}}
                  onClick={(e) => e.stopPropagation()}
                  className="apple-surface w-full max-w-sm rounded-[28px] p-6"
                >
                  <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--hairline-strong)] sm:hidden" />

                  <div className="flex items-center justify-between gap-4">
                    <h3
                      id="pwa-install-title"
                      className="font-[var(--font-display)] text-[18px] font-semibold tracking-[-0.02em] text-[var(--ink-primary)]"
                    >
                      Install EntrySense
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowGuide(false)}
                      aria-label="Close install instructions"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[var(--surface-recessed)] text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
                    >
                      <X className="h-4 w-4" strokeWidth={2.2} />
                    </button>
                  </div>

                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                    Add EntrySense to your home screen or desktop for one-tap occupancy checks and
                    cached offline counts.
                  </p>

                  {/* Platform Segmented Selector */}
                  <div
                    role="tablist"
                    aria-label="Choose device platform"
                    className="mt-4 grid grid-cols-3 rounded-[13px] bg-[var(--surface-recessed)] p-1"
                  >
                    {PLATFORM_OPTIONS.map(({id, label}) => {
                      const active = selectedPlatform === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setSelectedPlatform(id)}
                          className={`relative min-h-[36px] rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                            active
                              ? 'text-[var(--ink-primary)]'
                              : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId={pillLayoutId}
                              transition={{type: 'spring', stiffness: 500, damping: 38, mass: 0.8}}
                              className="absolute inset-0 rounded-[10px] bg-[var(--surface-elevated)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                            />
                          )}
                          <span className="relative z-10">{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedPlatform === 'ios' && (
                    <ol className="mt-5 divide-y divide-[var(--hairline)] text-[14px] text-[var(--ink-primary)]">
                      <li className="flex items-center gap-3 pb-3.5">
                        <span className="text-[13px] font-semibold text-[var(--accent)] tabular-nums">
                          1
                        </span>
                        <Share
                          className="h-4 w-4 shrink-0 text-[var(--accent)]"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        <span>
                          Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                        </span>
                      </li>
                      <li className="flex items-center gap-3 pt-3.5">
                        <span className="text-[13px] font-semibold text-[var(--accent)] tabular-nums">
                          2
                        </span>
                        <PlusSquare
                          className="h-4 w-4 shrink-0 text-[var(--accent)]"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        <span>
                          Scroll down and select <strong>Add to Home Screen</strong>.
                        </span>
                      </li>
                    </ol>
                  )}

                  {selectedPlatform === 'android' && (
                    <ol className="mt-5 divide-y divide-[var(--hairline)] text-[14px] text-[var(--ink-primary)]">
                      <li className="flex items-center gap-3 pb-3.5">
                        <span className="text-[13px] font-semibold text-[var(--accent)] tabular-nums">
                          1
                        </span>
                        <MoreVertical
                          className="h-4 w-4 shrink-0 text-[var(--accent)]"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        <span>
                          Tap the <strong>menu (⋮)</strong> button in Chrome&apos;s address bar.
                        </span>
                      </li>
                      <li className="flex items-center gap-3 pt-3.5">
                        <span className="text-[13px] font-semibold text-[var(--accent)] tabular-nums">
                          2
                        </span>
                        <PlusSquare
                          className="h-4 w-4 shrink-0 text-[var(--accent)]"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        <span>
                          Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                        </span>
                      </li>
                    </ol>
                  )}

                  {selectedPlatform === 'desktop' && (
                    <ol className="mt-5 divide-y divide-[var(--hairline)] text-[14px] text-[var(--ink-primary)]">
                      <li className="flex items-center gap-3 pb-3.5">
                        <span className="text-[13px] font-semibold text-[var(--accent)] tabular-nums">
                          1
                        </span>
                        <Download
                          className="h-4 w-4 shrink-0 text-[var(--accent)]"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        <span>
                          In Chrome or Edge, click the <strong>Install</strong> icon in the address
                          bar (or Safari <strong>File → Add to Dock</strong>).
                        </span>
                      </li>
                      <li className="flex items-center gap-3 pt-3.5">
                        <span className="text-[13px] font-semibold text-[var(--accent)] tabular-nums">
                          2
                        </span>
                        <Monitor
                          className="h-4 w-4 shrink-0 text-[var(--accent)]"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        <span>
                          Confirm <strong>Install</strong> to run EntrySense in its own app window.
                        </span>
                      </li>
                    </ol>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    className="mt-6 min-h-[46px] w-full rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-[14px] font-semibold text-white transition-all hover:opacity-92 active:scale-[0.98]"
                  >
                    Done
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={openGuide}
        className={
          variant === 'header'
            ? 'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--accent)] whitespace-nowrap transition-all hover:opacity-85 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
            : 'inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent)] whitespace-nowrap transition-all hover:opacity-85 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
        }
      >
        <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} aria-hidden="true" />
        <span>Install App</span>
      </button>
      {modal}
    </>
  );
};
