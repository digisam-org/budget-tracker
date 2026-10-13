import { parseToPence } from '../utils';
import { SupportedBank } from './detector';

export interface NormalizedTransaction {
  date: string; // ISO YYYY-MM-DD
  amount: number; // minor units (pence). Positive = Inflow/Credit, Negative = Outflow/Debit
  rawDescription: string;
  suggestedMerchant?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Standardize various UK date strings into ISO YYYY-MM-DD
 */
export function standardizeDate(dateStr: string): string {
  const clean = dateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const ukMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, '0');
    const month = ukMatch[2].padStart(2, '0');
    const year = ukMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback to JS Date parser
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return clean;
}

/**
 * Normalizes raw key-value record from CSV row into unified transaction model
 */
export function normalizeBankRow(
  row: Record<string, string>,
  bank: SupportedBank
): NormalizedTransaction | null {
  // Normalize row keys to lowercase
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    record[key.trim().toLowerCase()] = (value || '').trim();
  }

  try {
    switch (bank) {
      case 'monzo': {
        const date = standardizeDate(record['date'] || '');
        const amount = parseToPence(record['amount'] || '0');
        const name = record['name'] || '';
        const description = record['description'] || name;
        const notes = record['notes and #tags'] || '';

        if (!date || isNaN(amount)) return null;

        return {
          date,
          amount,
          rawDescription: `${name} ${description} ${notes}`.trim(),
          suggestedMerchant: name || undefined,
          metadata: { monzoCategory: record['category'] },
        };
      }

      case 'starling': {
        const date = standardizeDate(record['date'] || '');
        const amount = parseToPence(record['amount (gbp)'] || record['amount'] || '0');
        const counterParty = record['counter party'] || '';
        const reference = record['reference'] || '';

        if (!date || isNaN(amount)) return null;

        return {
          date,
          amount,
          rawDescription: `${counterParty} ${reference}`.trim(),
          suggestedMerchant: counterParty || undefined,
          metadata: { spendingCategory: record['spending category'] },
        };
      }

      case 'hsbc': {
        const date = standardizeDate(record['date'] || '');
        const paidOut = record['paid out'] ? parseToPence(record['paid out']) : 0;
        const paidIn = record['paid in'] ? parseToPence(record['paid in']) : 0;
        // Outflow is negative, Inflow is positive
        const amount = paidIn > 0 ? paidIn : -Math.abs(paidOut);
        const description = record['details'] || record['payment type'] || '';

        if (!date || (paidOut === 0 && paidIn === 0)) return null;

        return {
          date,
          amount,
          rawDescription: description,
        };
      }

      case 'barclays': {
        const date = standardizeDate(record['date'] || '');
        const amount = parseToPence(record['amount'] || '0');
        const memo = record['memo'] || record['subcategory'] || '';

        if (!date || isNaN(amount)) return null;

        return {
          date,
          amount,
          rawDescription: memo,
        };
      }

      case 'lloyds': {
        const date = standardizeDate(record['transaction date'] || record['date'] || '');
        const debit = record['debit amount'] ? parseToPence(record['debit amount']) : 0;
        const credit = record['credit amount'] ? parseToPence(record['credit amount']) : 0;
        const amount = credit > 0 ? credit : -Math.abs(debit);
        const description = record['transaction description'] || '';

        if (!date || (debit === 0 && credit === 0)) return null;

        return {
          date,
          amount,
          rawDescription: description,
        };
      }

      case 'amex': {
        const date = standardizeDate(record['date'] || '');
        // Amex statement: expenses are usually positive numbers, so invert them
        const rawAmt = parseToPence(record['amount'] || '0');
        const amount = -rawAmt;
        const description = record['description'] || '';

        if (!date || isNaN(amount)) return null;

        return {
          date,
          amount,
          rawDescription: description,
          suggestedMerchant: description.split('  ')[0]?.trim(),
        };
      }

      case 'generic':
      default: {
        // Find best match for date, amount, description
        const dateKey = Object.keys(record).find((k) => k.includes('date'));
        const date = dateKey ? standardizeDate(record[dateKey]) : '';

        let amount = 0;
        const debitKey = Object.keys(record).find((k) => k.includes('debit') || k.includes('out'));
        const creditKey = Object.keys(record).find((k) => k.includes('credit') || k.includes('in'));

        if (debitKey || creditKey) {
          const debit = debitKey && record[debitKey] ? parseToPence(record[debitKey]) : 0;
          const credit = creditKey && record[creditKey] ? parseToPence(record[creditKey]) : 0;
          amount = credit > 0 ? credit : -Math.abs(debit);
        } else {
          const amountKey = Object.keys(record).find((k) => k.includes('amount') || k.includes('value'));
          amount = amountKey ? parseToPence(record[amountKey]) : 0;
        }

        const descKey = Object.keys(record).find(
          (k) => k.includes('desc') || k.includes('memo') || k.includes('details') || k.includes('name')
        );
        const rawDescription = descKey ? record[descKey] : Object.values(record).join(' ');

        if (!date || amount === 0) return null;

        return {
          date,
          amount,
          rawDescription,
        };
      }
    }
  } catch {
    return null;
  }
}
