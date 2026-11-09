import { parseToPence } from '../utils';
import { NormalizedTransaction, standardizeDate } from './normalizer';

const MONTHS_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

const NOISE_PATTERNS = [
  /^balance\b/i,
  /^available\s+balance/i,
  /^current\s+balance/i,
  /^total\s+spent/i,
  /^spent\s+today/i,
  /^overdraft/i,
  /^sort\s+code/i,
  /^account\s+number/i,
  /^statement\s+balance/i,
  /^minimum\s+payment/i,
  /^credit\s+limit/i,
  /^\d{1,2}:\d{2}\s*(am|pm)?$/i,
];

/**
 * Attempts to parse a mobile banking date header like:
 * - "Today", "Yesterday"
 * - "Monday 9 Nov", "Tue, 14 Oct 2026", "9 November"
 * - "12/10/2026", "2026-10-12"
 */
export function parseDateHeader(line: string, defaultYear: number = 2026): string | null {
  const clean = line.trim();
  const lower = clean.toLowerCase();

  const now = new Date();
  if (lower === 'today') {
    return now.toISOString().split('T')[0];
  }
  if (lower === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    return yest.toISOString().split('T')[0];
  }

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // UK DD/MM/YYYY or DD-MM-YYYY
  const ukFull = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ukFull) {
    return `${ukFull[3]}-${ukFull[2].padStart(2, '0')}-${ukFull[1].padStart(2, '0')}`;
  }

  // "Mon, 9 Nov 2026" or "9 November" or "14 Oct 26"
  const dayMonthMatch = clean.match(
    /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,.\s]+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{2,4}))?$/i
  );
  if (dayMonthMatch) {
    const day = dayMonthMatch[1].padStart(2, '0');
    const monthName = dayMonthMatch[2].toLowerCase();
    const month = MONTHS_MAP[monthName];
    if (month) {
      let year = defaultYear;
      if (dayMonthMatch[3]) {
        year = dayMonthMatch[3].length === 2 ? 2000 + parseInt(dayMonthMatch[3], 10) : parseInt(dayMonthMatch[3], 10);
      }
      return `${year}-${month}-${day}`;
    }
  }

  // "Nov 9, 2026" or "October 14"
  const monthDayMatch = clean.match(
    /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,.\s]+)?([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,.\s]+(\d{2,4}))?$/i
  );
  if (monthDayMatch) {
    const monthName = monthDayMatch[1].toLowerCase();
    const month = MONTHS_MAP[monthName];
    const day = monthDayMatch[2].padStart(2, '0');
    if (month) {
      let year = defaultYear;
      if (monthDayMatch[3]) {
        year = monthDayMatch[3].length === 2 ? 2000 + parseInt(monthDayMatch[3], 10) : parseInt(monthDayMatch[3], 10);
      }
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

/**
 * Parses OCR text or copied mobile banking feed text into normalized transactions.
 * Handles both single-line ("Tesco  -£14.50") and multi-line mobile banking layouts.
 */
export function parseBankScreenshotText(
  rawText: string,
  defaultYear: number = 2026
): NormalizedTransaction[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: NormalizedTransaction[] = [];
  let currentDate = new Date().toISOString().split('T')[0];
  if (defaultYear && !currentDate.startsWith(String(defaultYear))) {
    currentDate = `${defaultYear}-${currentDate.slice(5)}`;
  }

  let pendingMerchant: string | null = null;

  // Regex to find a currency amount at the end or middle of a line: e.g. -£14.50, +£876.00, £42.09, -12.99
  const amountRegex = /([+-]?\s*£\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?|[+-]?\s*\d{1,3}(?:,\d{3})*\.\d{2}\s*(?:CR|DR|GBP)?)$/i;
  const inlineDatePrefixRegex = /^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{2,4})?)\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip obvious UI noise lines
    if (NOISE_PATTERNS.some((pat) => pat.test(line))) {
      pendingMerchant = null;
      continue;
    }

    // 1. Check if the entire line is a Date Header (e.g., "Today", "Yesterday", "14 Oct 2026")
    const headerDate = parseDateHeader(line, defaultYear);
    if (headerDate) {
      currentDate = headerDate;
      pendingMerchant = null;
      continue;
    }

    // 2. Check if the line contains a price/amount
    const amountMatch = line.match(amountRegex);
    if (amountMatch) {
      const rawAmountStr = amountMatch[1].trim();
      const beforeAmount = line.slice(0, amountMatch.index).trim();

      // Determine if positive (inflow) or negative (outflow)
      const isPositiveSign =
        rawAmountStr.startsWith('+') ||
        rawAmountStr.toUpperCase().endsWith('CR');
      const isNegativeSign =
        rawAmountStr.startsWith('-') ||
        rawAmountStr.toUpperCase().endsWith('DR');

      const absPence = Math.abs(parseToPence(rawAmountStr));
      if (absPence === 0) continue;

      let description = beforeAmount || pendingMerchant || '';
      let rowDate = currentDate;

      // Check if description starts with an inline date (e.g. "12/10/2026 Tesco")
      const inlineDateMatch = description.match(inlineDatePrefixRegex);
      if (inlineDateMatch) {
        const parsedInline =
          parseDateHeader(inlineDateMatch[1], defaultYear) ||
          standardizeDate(inlineDateMatch[1]);
        if (parsedInline && /^\d{4}-\d{2}-\d{2}$/.test(parsedInline)) {
          rowDate = parsedInline;
          description = inlineDateMatch[2].trim();
        }
      }

      // Clean up bullet points or trailing separators
      description = description.replace(/[•|·\-–—]+$/, '').trim();

      if (!description || NOISE_PATTERNS.some((pat) => pat.test(description))) {
        pendingMerchant = null;
        continue;
      }

      const isIncomeKeyword = /\b(salary|payroll|dividend|bonus|refund|rent\s+from|interest)\b/i.test(description);
      const signedAmount =
        isPositiveSign || (!isNegativeSign && isIncomeKeyword)
          ? absPence
          : -absPence;

      results.push({
        date: rowDate,
        amount: signedAmount,
        rawDescription: description,
        suggestedMerchant: description,
        metadata: { source: 'screenshot_ocr' },
      });

      pendingMerchant = null;
    } else {
      // Line without an amount: could be a merchant name in a 2-line mobile layout
      // Ignore short timestamps/categories like "14:32" or "Groceries • 12:10"
      if (
        line.length >= 2 &&
        line.length <= 60 &&
        !/^\d{1,2}:\d{2}/.test(line) &&
        !line.includes('•')
      ) {
        pendingMerchant = line;
      }
    }
  }

  return results;
}

/**
 * Extracts structured bank transactions from a screenshot using Gemini Multimodal Vision API.
 */
export async function extractTransactionsWithGeminiVision(params: {
  base64Image: string;
  mimeType: string;
  apiKey: string;
  defaultYear?: number;
}): Promise<{ transactions: NormalizedTransaction[]; detectedBank: string }> {
  const { base64Image, mimeType, apiKey, defaultYear = 2026 } = params;

  const prompt = `You are a financial statement parser for a UK personal budget app.
Extract all visible bank or credit card transactions from this mobile banking screenshot.
Rules:
1. Return valid JSON matching the exact schema:
{
  "detectedBank": "monzo" | "barclays" | "hsbc" | "starling" | "amex" | "lloyds" | "revolut" | "generic",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amountInPence": number,
      "rawDescription": "string",
      "cleanMerchant": "string"
    }
  ]
}
2. For "date": Use ISO YYYY-MM-DD format. If the year is omitted in the screenshot (e.g. "14 Oct"), assume the year is ${defaultYear}. If the header says "Today" or "Yesterday", use ${defaultYear}-${new Date().toISOString().slice(5, 10)}.
3. For "amountInPence": Convert GBP £ amounts to integer pence (e.g., £14.50 -> -1450 for expenses/debits, +£500.00 -> 50000 for income/credits/refunds). Outflows/purchases MUST be negative integers; inflows/deposits MUST be positive integers.
4. Ignore account balances, total spent headers, or pending authorization holds that have no amount.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Vision API error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty response from Gemini Vision API');
  }

  const parsed = JSON.parse(rawText);
  const txs: NormalizedTransaction[] = (parsed.transactions || []).map((t: any) => ({
    date: standardizeDate(t.date || `${defaultYear}-09-01`),
    amount: typeof t.amountInPence === 'number' ? Math.round(t.amountInPence) : 0,
    rawDescription: String(t.rawDescription || t.cleanMerchant || 'Unknown'),
    suggestedMerchant: String(t.cleanMerchant || t.rawDescription || 'Unknown'),
    metadata: { source: 'gemini_vision', detectedBank: parsed.detectedBank },
  })).filter((t: NormalizedTransaction) => t.amount !== 0);

  return {
    detectedBank: parsed.detectedBank || 'screenshot',
    transactions: txs,
  };
}

