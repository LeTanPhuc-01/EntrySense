import React, {useState} from 'react';
import {Download, Share, PlusSquare, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({variant = 'header'}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <p className="text-sm text-slate-600 dark:text-slate-400">
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
            ? 'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400 whitespace-nowrap shrink-0'
            : 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400 whitespace-nowrap'
        }
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'header'
              ? 'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0'
              : 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap'
          }
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#131A26]">
              <div className="flex items-center justify-between gap-4">
                <h3
                  id="ios-install-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-50"
                >
                  Install EntrySense on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Add EntrySense to your home screen for one-tap parking availability and offline support.
              </p>
              <ol className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                <li className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <Share className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="pt-0.5">
                    Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <PlusSquare className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="pt-0.5">
                    Scroll down and select <strong>Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 min-h-[44px] w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        Open EntrySense in Chrome, Edge, or Safari on your mobile device to install it directly to your home screen.
      </p>
    );
  }

  return null;
};
