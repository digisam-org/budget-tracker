import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format amount in minor units (pence) to GBP currency string (£)
 * e.g., 1250 -> "£12.50", -1500 -> "-£15.00"
 */
export function formatCurrency(amountInPence: number): string {
  const isNegative = amountInPence < 0;
  const absValue = Math.abs(amountInPence) / 100;
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absValue);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Parse currency string or number to minor units (pence integer)
 * Handles negative indicators like "(12.50)", "-£12.50", "12.50 CR", "12.50 DR"
 */
export function parseToPence(input: string | number): number {
  if (typeof input === 'number') {
    return Math.round(input * 100);
  }

  const cleaned = input.trim();
  if (!cleaned) return 0;

  const isExplicitNegative =
    cleaned.startsWith('-') ||
    (cleaned.startsWith('(') && cleaned.endsWith(')')) ||
    cleaned.toUpperCase().endsWith('DR');

  // Strip all non-numeric characters except '.'
  const numericStr = cleaned.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numericStr);
  if (isNaN(parsed)) return 0;

  const pence = Math.round(parsed * 100);
  return isExplicitNegative ? -pence : pence;
}
