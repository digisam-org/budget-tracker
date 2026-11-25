'use client';

import { useState, useEffect } from 'react';
import {
  loadLockConfig,
  saveLockConfig,
  generateSalt,
  hashPin,
  isBiometricSupported,
  enrollBiometric,
  triggerManualLock,
  markSessionUnlocked,
  PrivacyLockConfig,
  DEFAULT_LOCK_CONFIG,
} from '@/lib/pwa/privacy-lock';
import {
  Shield,
  Lock,
  Fingerprint,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';

export function PrivacyPwaSettingsCard() {
  const [config, setConfig] = useState<PrivacyLockConfig>(DEFAULT_LOCK_CONFIG);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [swActive, setSwActive] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // PIN setup state
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setConfig(loadLockConfig());
    isBiometricSupported().then(setBiometricAvailable);

    if (typeof window !== 'undefined') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        Boolean((navigator as unknown as { standalone?: boolean }).standalone);
      setIsStandalone(standalone);

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => setSwActive(Boolean(reg.active)))
          .catch(() => setSwActive(false));
      }
    }
  }, []);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!/^\d{4}$/.test(newPin)) {
      setFeedback({ type: 'error', text: 'PIN must be exactly 4 digits.' });
      return;
    }
    if (newPin !== confirmPin) {
      setFeedback({ type: 'error', text: 'PIN entries do not match.' });
      return;
    }

    const salt = generateSalt();
    const digest = await hashPin(newPin, salt);
    const next: PrivacyLockConfig = {
      ...config,
      enabled: true,
      pinSalt: salt,
      pinHash: digest,
    };

    saveLockConfig(next);
    markSessionUnlocked();
    setConfig(next);
    setNewPin('');
    setConfirmPin('');
    setShowPinSetup(false);
    setFeedback({ type: 'success', text: '4-digit Privacy PIN enabled on this device.' });
  };

  const handleDisableLock = () => {
    const next: PrivacyLockConfig = {
      ...DEFAULT_LOCK_CONFIG,
      enabled: false,
    };
    saveLockConfig(next);
    setConfig(next);
    setShowPinSetup(false);
    setFeedback({ type: 'success', text: 'Privacy Lock disabled.' });
  };

  const handleToggleBiometric = async () => {
    setFeedback(null);

    if (config.biometricEnabled) {
      const next: PrivacyLockConfig = {
        ...config,
        biometricEnabled: false,
        biometricCredentialId: null,
      };
      saveLockConfig(next);
      setConfig(next);
      setFeedback({ type: 'success', text: 'Face ID / Touch ID unlock disabled.' });
      return;
    }

    if (!config.enabled || !config.pinHash) {
      setFeedback({
        type: 'error',
        text: 'Set a 4-digit fallback PIN first before enabling Face ID / Touch ID.',
      });
      return;
    }

    try {
      const credentialId = await enrollBiometric();
      const next: PrivacyLockConfig = {
        ...config,
        biometricEnabled: true,
        biometricCredentialId: credentialId,
      };
      saveLockConfig(next);
      setConfig(next);
      setFeedback({
        type: 'success',
        text: 'Face ID / Touch ID enrolled! You can now unlock with biometrics.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not enroll biometrics.',
      });
    }
  };

  const handleTimeoutChange = (minutes: number) => {
    const next: PrivacyLockConfig = {
      ...config,
      autoLockMinutes: minutes,
    };
    saveLockConfig(next);
    setConfig(next);
  };

  return (
    <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">PWA &amp; Mobile Privacy Lock</h2>
        </div>

        {config.enabled && (
          <button
            type="button"
            onClick={triggerManualLock}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-[11px] font-semibold transition-colors"
          >
            <Lock className="w-3 h-3" />
            <span>Lock Now</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 4-Digit PIN Toggle & Setup */}
      <div className="space-y-3 pt-1 border-t border-zinc-800/80">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              4-Digit Privacy PIN
            </p>
            <p className="text-[11px] text-zinc-400">
              Require a local PIN before revealing financial balances on this device.
            </p>
          </div>

          {config.enabled ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPinSetup((s) => !s)}
                className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold"
              >
                Change
              </button>
              <button
                type="button"
                onClick={handleDisableLock}
                className="px-2.5 py-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-[11px] font-semibold"
              >
                Disable
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPinSetup((s) => !s)}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[11px] font-bold shrink-0"
            >
              Set PIN
            </button>
          )}
        </div>

        {showPinSetup && (
          <form
            onSubmit={handleSavePin}
            className="p-3.5 rounded-2xl bg-zinc-950/80 border border-emerald-500/30 space-y-2.5"
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">
                  New 4-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-[0.5em] text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-[0.5em] text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPinSetup(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-bold"
              >
                Save PIN
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Face ID / Touch ID (WebAuthn) */}
      <div className="flex items-start justify-between gap-3 pt-2 border-t border-zinc-800/80">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
            <Fingerprint className="w-3.5 h-3.5 text-sky-400" />
            Face ID / Touch ID Unlock
          </p>
          <p className="text-[11px] text-zinc-400">
            {biometricAvailable
              ? 'Use native device biometrics via WebAuthn to unlock instantly.'
              : 'Requires a biometric-capable device over HTTPS or localhost.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggleBiometric}
          disabled={!biometricAvailable && !config.biometricEnabled}
          className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 disabled:opacity-40 ${
            config.biometricEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
          }`}
          aria-label="Toggle biometric unlock"
        >
          <div
            className={`w-5 h-5 rounded-full bg-white transition-transform ${
              config.biometricEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Auto-Lock Timeout */}
      {config.enabled && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
          <span className="text-xs text-zinc-300">Auto-Lock When Backgrounded</span>
          <select
            value={config.autoLockMinutes}
            onChange={(e) => handleTimeoutChange(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          >
            <option value={0}>Immediately</option>
            <option value={1}>After 1 minute</option>
            <option value={5}>After 5 minutes</option>
            <option value={15}>After 15 minutes</option>
            <option value={-1}>Manual only</option>
          </select>
        </div>
      )}

      {/* PWA Installation & Offline Cache Status */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-zinc-500" />
          Mode:{' '}
          <strong className="text-zinc-200">
            {isStandalone ? 'Installed PWA' : 'Browser'}
          </strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              swActive ? 'bg-emerald-400' : 'bg-zinc-600'
            }`}
          />
          {swActive ? 'Offline Cache Active' : 'SW Ready on Reload'}
        </span>
      </div>
    </div>
  );
}
