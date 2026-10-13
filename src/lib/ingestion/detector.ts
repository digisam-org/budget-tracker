export type SupportedBank =
  | 'monzo'
  | 'barclays'
  | 'hsbc'
  | 'starling'
  | 'amex'
  | 'lloyds'
  | 'generic';

export interface DetectionResult {
  bank: SupportedBank;
  confidence: number;
  matchedHeaders: string[];
}

/**
 * Inspects CSV headers to identify the originating UK financial institution
 */
export function detectBankFormat(headers: string[]): DetectionResult {
  const normalized = headers.map((h) => h.trim().toLowerCase());

  // Monzo signature
  if (
    normalized.includes('transaction id') ||
    (normalized.includes('name') && normalized.includes('category split')) ||
    (normalized.includes('emoji') && normalized.includes('notes and #tags'))
  ) {
    return { bank: 'monzo', confidence: 100, matchedHeaders: headers };
  }

  // Starling signature
  if (
    normalized.includes('counter party') ||
    normalized.includes('spending category')
  ) {
    return { bank: 'starling', confidence: 100, matchedHeaders: headers };
  }

  // HSBC UK signature
  if (
    normalized.includes('paid out') &&
    normalized.includes('paid in') &&
    normalized.includes('payment type')
  ) {
    return { bank: 'hsbc', confidence: 100, matchedHeaders: headers };
  }

  // Barclays signature
  if (
    normalized.includes('subcategory') ||
    (normalized.includes('memo') && normalized.includes('account'))
  ) {
    return { bank: 'barclays', confidence: 95, matchedHeaders: headers };
  }

  // Lloyds / Halifax signature
  if (
    normalized.includes('transaction description') &&
    (normalized.includes('debit amount') || normalized.includes('credit amount'))
  ) {
    return { bank: 'lloyds', confidence: 95, matchedHeaders: headers };
  }

  // American Express signature
  if (
    normalized.includes('card member') ||
    normalized.includes('account #')
  ) {
    return { bank: 'amex', confidence: 95, matchedHeaders: headers };
  }

  return { bank: 'generic', confidence: 50, matchedHeaders: headers };
}
