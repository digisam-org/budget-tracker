export interface PrivacyLockConfig {
  enabled: boolean;
  pinHash: string | null;
  pinSalt: string | null;
  biometricEnabled: boolean;
  biometricCredentialId: string | null; // base64url encoded
  autoLockMinutes: number; // 0 = immediate on background, -1 = manual only
}

const STORAGE_KEY = 'budget_tracker_privacy_lock_v1';
const SESSION_UNLOCK_KEY = 'budget_tracker_unlocked_at';

export const DEFAULT_LOCK_CONFIG: PrivacyLockConfig = {
  enabled: false,
  pinHash: null,
  pinSalt: null,
  biometricEnabled: false,
  biometricCredentialId: null,
  autoLockMinutes: 1,
};

export function loadLockConfig(): PrivacyLockConfig {
  if (typeof window === 'undefined') return DEFAULT_LOCK_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCK_CONFIG;
    const parsed = JSON.parse(raw) as Partial<PrivacyLockConfig>;
    return {
      ...DEFAULT_LOCK_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_LOCK_CONFIG;
  }
}

export function saveLockConfig(config: PrivacyLockConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('budget-lock-config-changed', { detail: config }));
}

export function triggerManualLock(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  window.dispatchEvent(new CustomEvent('budget-lock-now'));
}

export function markSessionUnlocked(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_UNLOCK_KEY, String(Date.now()));
}

export function isSessionCurrentlyUnlocked(config: PrivacyLockConfig): boolean {
  if (!config.enabled) return true;
  if (typeof window === 'undefined') return false;
  const ts = window.sessionStorage.getItem(SESSION_UNLOCK_KEY);
  if (!ts) return false;
  const unlockedAt = Number(ts);
  if (!Number.isFinite(unlockedAt)) return false;

  if (config.autoLockMinutes < 0) return true; // Manual only
  if (config.autoLockMinutes === 0) return true; // Locked on visibilitychange instead
  const elapsedMs = Date.now() - unlockedAt;
  return elapsedMs < config.autoLockMinutes * 60 * 1000;
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes a salted SHA-256 digest of the 4-digit PIN using Web Crypto API,
 * with a deterministic fallback if crypto.subtle is unavailable on non-HTTPS LAN origins.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const payload = `${salt}:${pin}:budget-pwa`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Deterministic fallback hash for insecure HTTP local IP dev environments
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function verifyPin(pin: string, config: PrivacyLockConfig): Promise<boolean> {
  if (!config.pinHash || !config.pinSalt) return false;
  const candidate = await hashPin(pin, config.pinSalt);
  return candidate === config.pinHash;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Checks whether the current browser/device supports platform WebAuthn biometrics
 * (Face ID, Touch ID, Android Biometrics, Windows Hello).
 */
export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential || !navigator.credentials) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Enrolls a local WebAuthn platform credential (Face ID / Touch ID) for quick unlock.
 * Returns the base64url credential ID on success.
 */
export async function enrollBiometric(): Promise<string> {
  const supported = await isBiometricSupported();
  if (!supported) {
    throw new Error('Face ID / Touch ID is not available on this device or connection (requires HTTPS or localhost).');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'Budget Tracker PWA',
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: 'owner@budget-tracker.local',
        displayName: 'Budget Tracker Owner',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Biometric registration was cancelled.');
  }

  return bufferToBase64Url(credential.rawId);
}

/**
 * Verifies the user via native Face ID / Touch ID using the enrolled WebAuthn credential.
 */
export async function authenticateBiometric(credentialId: string): Promise<boolean> {
  if (!window.PublicKeyCredential || !navigator.credentials) return false;

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [
        {
          id: base64UrlToBuffer(credentialId),
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  return Boolean(assertion);
}
