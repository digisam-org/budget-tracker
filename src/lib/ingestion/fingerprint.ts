import crypto from 'crypto';

export interface FingerprintParams {
  accountId: string;
  date: string; // ISO YYYY-MM-DD
  amount: number; // in pence
  rawDescription: string;
}

/**
 * Generate a deterministic SHA-256 fingerprint for deduplication.
 * Ensures identical transactions from overlapping statement exports are safely ignored.
 */
export function generateFingerprint(params: FingerprintParams): string {
  const normalizedDesc = params.rawDescription
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

  const payload = `${params.accountId}|${params.date}|${params.amount}|${normalizedDesc}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
