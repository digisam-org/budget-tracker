'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadLockConfig,
  isSessionCurrentlyUnlocked,
  markSessionUnlocked,
  verifyPin,
  authenticateBiometric,
  PrivacyLockConfig,
  DEFAULT_LOCK_CONFIG,
} from '@/lib/pwa/privacy-lock';
import {
  Lock,
  Fingerprint,
  Delete,
  WifiOff,
  Download,
  Share,
  X,
  ShieldCheck,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const INSTALL_DISMISSED_KEY = 'budget_tracker_install_dismissed';

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [lockConfig, setLockConfig] = useState<PrivacyLockConfig>(DEFAULT_LOCK_CONFIG);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // PIN entry state
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isBiometricPrompting, setIsBiometricPrompting] = useState(false);

  // Offline & Install state
  const [isOffline, setIsOffline] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(true);

  const backgroundedAtRef = useRef<number | null>(null);
  const hasAutoPromptedBiometricRef = useRef(false);

  // 1. Register Service Worker + Online/Offline + Install Prompt listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Register sw.js (subpath-safe for GitHub Pages)
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
        .catch((err) => console.warn('SW registration failed:', err));
    }

    // Online / offline status
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check standalone & install prompt dismissal
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone);
    const dismissed = window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
    setInstallDismissed(dismissed || isStandalone);

    // Detect iOS Safari (non-standalone)
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari && !isStandalone && !dismissed) {
      setShowIosInstallHint(true);
    }

    // Capture Android/Desktop install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      window.dispatchEvent(new CustomEvent('budget-pwa-installable'));
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Allow settings page to trigger install prompt
    const handleTriggerInstall = async () => {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      setDeferredPrompt(null);
    };
    window.addEventListener('budget-pwa-trigger-install', handleTriggerInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('budget-pwa-trigger-install', handleTriggerInstall);
    };
  }, [deferredPrompt]);

  // 2. Hydrate Privacy Lock config & listen for background/manual lock events
  useEffect(() => {
    const cfg = loadLockConfig();
    setLockConfig(cfg);
    if (cfg.enabled && !isSessionCurrentlyUnlocked(cfg)) {
      setIsLocked(true);
    }
    setIsHydrated(true);

    const handleConfigChange = (e: Event) => {
      const next = (e as CustomEvent<PrivacyLockConfig>).detail || loadLockConfig();
      setLockConfig(next);
      if (!next.enabled) {
        setIsLocked(false);
      }
    };

    const handleManualLock = () => {
      const current = loadLockConfig();
      if (current.enabled) {
        hasAutoPromptedBiometricRef.current = false;
        setPinEntry('');
        setPinError(null);
        setIsLocked(true);
      }
    };

    const handleVisibilityChange = () => {
      const current = loadLockConfig();
      if (!current.enabled || current.autoLockMinutes < 0) return;

      if (document.visibilityState === 'hidden') {
        backgroundedAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const bgAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (bgAt !== null) {
          const elapsedMs = Date.now() - bgAt;
          if (current.autoLockMinutes === 0 || elapsedMs >= current.autoLockMinutes * 60 * 1000) {
            hasAutoPromptedBiometricRef.current = false;
            setPinEntry('');
            setPinError(null);
            setIsLocked(true);
          }
        }
      }
    };

    window.addEventListener('budget-lock-config-changed', handleConfigChange);
    window.addEventListener('budget-lock-now', handleManualLock);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('budget-lock-config-changed', handleConfigChange);
      window.removeEventListener('budget-lock-now', handleManualLock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const unlockApp = useCallback(() => {
    markSessionUnlocked();
    setPinEntry('');
    setPinError(null);
    setIsLocked(false);
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    if (!lockConfig.biometricEnabled || !lockConfig.biometricCredentialId) return;
    setIsBiometricPrompting(true);
    setPinError(null);

    try {
      const ok = await authenticateBiometric(lockConfig.biometricCredentialId);
      if (ok) {
        unlockApp();
      } else {
        setPinError('Biometric check did not complete. Enter your 4-digit PIN.');
      }
    } catch {
      setPinError('Face ID / Touch ID cancelled. Enter your 4-digit PIN.');
    } finally {
      setIsBiometricPrompting(false);
    }
  }, [lockConfig, unlockApp]);

  // Auto-trigger biometric prompt once when lock screen opens (if enabled)
  useEffect(() => {
    if (
      isLocked &&
      lockConfig.biometricEnabled &&
      lockConfig.biometricCredentialId &&
      !hasAutoPromptedBiometricRef.current
    ) {
      hasAutoPromptedBiometricRef.current = true;
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isLocked, lockConfig, handleBiometricUnlock]);

  const handleDigitPress = async (digit: string) => {
    if (pinEntry.length >= 4) return;
    const next = pinEntry + digit;
    setPinEntry(next);
    setPinError(null);

    if (next.length === 4) {
      const ok = await verifyPin(next, lockConfig);
      if (ok) {
        unlockApp();
      } else {
        setPinError('Incorrect PIN. Try again.');
        setTimeout(() => setPinEntry(''), 300);
      }
    }
  };

  const handleBackspace = () => {
    setPinEntry((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setInstallDismissed(true);
    }
  };

  const dismissInstallBanner = () => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    setInstallDismissed(true);
    setShowIosInstallHint(false);
  };

  return (
    <>
      {/* Offline Indicator Pill */}
      {isOffline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 backdrop-blur-md text-amber-300 text-[11px] font-semibold flex items-center gap-1.5 shadow-lg">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode · Cached View</span>
        </div>
      )}

      {/* Main App Content (hidden behind opaque overlay while locked) */}
      <div className={isLocked ? 'blur-xl pointer-events-none select-none' : ''}>
        {children}
      </div>

      {/* Add-to-Home-Screen Install Banner (Chrome/Android/Desktop) */}
      {isHydrated && !isLocked && !installDismissed && deferredPrompt && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md p-3.5 rounded-2xl bg-zinc-900/95 border border-emerald-500/30 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Install Budget Tracker</p>
              <p className="text-[11px] text-zinc-400 truncate">
                Full-screen mobile app with offline cache
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-colors"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismissInstallBanner}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300"
              aria-label="Dismiss install banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* iOS Safari Add-to-Home-Screen Hint */}
      {isHydrated && !isLocked && !installDismissed && !deferredPrompt && showIosInstallHint && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md p-3.5 rounded-2xl bg-zinc-900/95 border border-zinc-700 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 shrink-0">
              <Share className="w-4 h-4" />
            </div>
            <p className="text-[11px] text-zinc-300 leading-snug">
              Install as an app: tap <strong className="text-white">Share</strong> then{' '}
              <strong className="text-white">Add to Home Screen</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissInstallBanner}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 shrink-0"
            aria-label="Dismiss iOS install hint"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Full-Screen Privacy Lock Overlay (4-Digit PIN + Face ID / Touch ID) */}
      {isHydrated && isLocked && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/98 backdrop-blur-2xl flex flex-col items-center justify-center px-6 py-8">
          <div className="w-full max-w-xs space-y-6 text-center">
            <div className="space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <Lock className="w-6 h-6" />
              </div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                Budget Tracker Locked
              </h1>
              <p className="text-xs text-zinc-400">
                Enter your 4-digit PIN{lockConfig.biometricEnabled ? ' or use Face ID / Touch ID' : ''} to view your finances
              </p>
            </div>

            {/* 4-Digit PIN Dots */}
            <div className="flex items-center justify-center gap-4 py-2">
              {[0, 1, 2, 3].map((idx) => {
                const filled = pinEntry.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                      filled
                        ? 'bg-emerald-400 scale-110 shadow-[0_0_10px_rgba(52,211,153,0.7)]'
                        : 'bg-zinc-800 border border-zinc-700'
                    }`}
                  />
                );
              })}
            </div>

            {pinError && (
              <p className="text-xs font-medium text-rose-400 -mt-2">{pinError}</p>
            )}

            {/* Mobile Numpad */}
            <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  className="h-14 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-zinc-800 text-xl font-bold text-white transition-all"
                >
                  {digit}
                </button>
              ))}

              {/* Bottom-left: Face ID / Touch ID trigger (if enrolled) */}
              {lockConfig.biometricEnabled && lockConfig.biometricCredentialId ? (
                <button
                  type="button"
                  onClick={handleBiometricUnlock}
                  disabled={isBiometricPrompting}
                  className="h-14 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 border border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-all disabled:opacity-50"
                  title="Unlock with Face ID / Touch ID"
                >
                  <Fingerprint className="w-6 h-6" />
                </button>
              ) : (
                <div className="h-14 flex items-center justify-center text-zinc-700">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              )}

              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                className="h-14 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 border border-zinc-800 text-xl font-bold text-white transition-all"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                className="h-14 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800 active:scale-95 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-all"
                aria-label="Delete digit"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
