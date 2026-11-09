import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import path from 'path';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import {
  importBatches,
  transactions,
  categorizationRules,
  appSettings,
  categories,
} from '@/lib/db/schema';
import { detectBankFormat } from '@/lib/ingestion/detector';
import { normalizeBankRow, NormalizedTransaction } from '@/lib/ingestion/normalizer';
import { generateFingerprint } from '@/lib/ingestion/fingerprint';
import { matchRule } from '@/lib/classifier/rules-engine';
import { findTransferPairs } from '@/lib/classifier/transfer-matcher';
import {
  extractTransactionsWithGeminiVision,
  parseBankScreenshotText,
} from '@/lib/ingestion/screenshot-parser';
import { runLocalMacOSVisionOCR } from '@/lib/ingestion/local-vision-ocr';

export interface StagedPreviewRow {
  tempId: string;
  date: string;
  effectiveDate: string;
  amount: number; // in pence
  type: 'income' | 'expenses' | 'savings';
  rawDescription: string;
  cleanMerchant: string;
  categoryId: string | null;
  confidenceScore: number;
  isDuplicate: boolean;
  isTransferCandidate: boolean;
  transferMatchedAccountId?: string;
}

function computeEffectiveDate(
  isoDate: string,
  txType: 'income' | 'expenses' | 'savings',
  shiftLateIncome?: boolean,
  lateIncomeDay: number = 20
): string {
  if (!shiftLateIncome || txType !== 'income') return isoDate;
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const day = parseInt(parts[2], 10);
  if (day >= lateIncomeDay) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const nextDate = new Date(Date.UTC(year, month, 1));
    return nextDate.toISOString().split('T')[0];
  }
  return isoDate;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Load DB context
    const existingRules = await db.select().from(categorizationRules);
    const existingCategories = await db.select().from(categories);
    const existingTransactions = await db.select().from(transactions);
    const [settings] = await db.select().from(appSettings);

    const catMap = new Map(existingCategories.map((c) => [c.id, c]));
    const existingFingerprints = new Set(existingTransactions.map((t) => t.fingerprint));
    const defaultYear = settings?.startingYear || 2026;

    // Handle JSON Commit payload (from interactive preview table)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { accountId, filename = 'Manual / Screenshot Batch', rows } = body as {
        accountId: string;
        filename?: string;
        rows: Array<{
          date: string;
          amount: number;
          rawDescription: string;
          cleanMerchant?: string;
          categoryId?: string | null;
          type?: 'income' | 'expenses' | 'savings';
        }>;
      };

      if (!accountId || !Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json(
          { error: 'accountId and non-empty rows are required' },
          { status: 400 }
        );
      }

      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.insert(importBatches).values({
        id: batchId,
        filename,
        accountId,
        totalRows: rows.length,
        importedCount: 0,
        duplicateCount: 0,
      });

      let importedCount = 0;
      let duplicateCount = 0;

      for (const row of rows) {
        const fingerprint = generateFingerprint({
          accountId,
          date: row.date,
          amount: row.amount,
          rawDescription: row.rawDescription,
        });

        const matchedCat = row.categoryId ? catMap.get(row.categoryId) : null;
        const txType: 'income' | 'expenses' | 'savings' =
          row.type ||
          (row.amount > 0
            ? 'income'
            : matchedCat?.type === 'savings'
            ? 'savings'
            : 'expenses');

        const effectiveDate = computeEffectiveDate(
          row.date,
          txType,
          settings?.shiftLateIncome,
          settings?.lateIncomeDay
        );

        try {
          const result = await db
            .insert(transactions)
            .values({
              id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              fingerprint,
              date: row.date,
              effectiveDate,
              type: txType,
              amount: row.amount,
              accountId,
              categoryId: row.categoryId || null,
              rawDescription: row.rawDescription,
              cleanMerchant: row.cleanMerchant || row.rawDescription,
              status: row.categoryId ? 'reviewed' : 'pending',
              batchId,
              confidenceScore: row.categoryId ? 95 : 50,
              metadata: { source: 'verified_commit' },
            })
            .onConflictDoNothing({ target: transactions.fingerprint })
            .returning();

          if (result.length > 0) {
            importedCount++;
          } else {
            duplicateCount++;
          }
        } catch {
          duplicateCount++;
        }
      }

      await db
        .update(importBatches)
        .set({ importedCount, duplicateCount })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json({
        success: true,
        batchId,
        detectedBank: 'verified',
        confidence: 100,
        totalRows: rows.length,
        importedCount,
        duplicateCount,
      });
    }

    // Otherwise handle multipart/form-data (CSV file, Image screenshot, or rawText)
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawText = formData.get('rawText') as string | null;
    const accountId = formData.get('accountId') as string | null;
    const mode = (formData.get('mode') as string | null) || 'commit'; // 'preview' | 'commit'

    if (!accountId || (!file && !rawText)) {
      return NextResponse.json(
        { error: 'accountId and either a file or rawText are required' },
        { status: 400 }
      );
    }

    let normalizedList: NormalizedTransaction[] = [];
    let detectedBank = 'generic';
    let detectionConfidence = 90;
    let rawOcrText: string | undefined;

    if (rawText && rawText.trim().length > 0) {
      normalizedList = parseBankScreenshotText(rawText, defaultYear);
      detectedBank = 'screenshot_text';
      rawOcrText = rawText;
    } else if (file) {
      const isImage =
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|webp|heic)$/i.test(file.name);

      if (isImage) {
        const arrayBuf = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const apiKey =
          process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

        if (apiKey) {
          try {
            const visionRes = await extractTransactionsWithGeminiVision({
              base64Image: buffer.toString('base64'),
              mimeType: file.type || 'image/png',
              apiKey,
              defaultYear,
            });
            normalizedList = visionRes.transactions;
            detectedBank = `${visionRes.detectedBank} (Vision AI)`;
            detectionConfidence = 96;
          } catch (visionErr) {
            console.warn('Gemini Vision fallback to local OCR:', visionErr);
          }
        }

        // Fallback to local macOS Apple Vision OCR if Gemini key not set or returned empty
        if (normalizedList.length === 0) {
          const ext = path.extname(file.name) || '.png';
          rawOcrText = await runLocalMacOSVisionOCR(buffer, ext);
          normalizedList = parseBankScreenshotText(rawOcrText, defaultYear);
          detectedBank = 'screenshot (Apple Vision OCR)';
          detectionConfidence = 88;
        }
      } else {
        // CSV / Statement file
        const csvText = await file.text();
        const parseResult = Papa.parse<Record<string, string>>(csvText, {
          header: true,
          skipEmptyLines: true,
        });

        if (!parseResult.meta.fields || parseResult.meta.fields.length === 0) {
          return NextResponse.json(
            { error: 'CSV file contains no readable headers' },
            { status: 400 }
          );
        }

        const detection = detectBankFormat(parseResult.meta.fields);
        detectedBank = detection.bank;
        detectionConfidence = detection.confidence;

        for (const rawRow of parseResult.data) {
          const norm = normalizeBankRow(rawRow, detection.bank);
          if (norm) normalizedList.push(norm);
        }
      }
    }

    // Check inter-account transfers across existing DB transactions + newly parsed rows
    const candidatePool = [
      ...existingTransactions.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        date: t.date,
        amount: t.amount,
        rawDescription: t.rawDescription,
      })),
      ...normalizedList.map((n, idx) => ({
        id: `staged_${idx}`,
        accountId,
        date: n.date,
        amount: n.amount,
        rawDescription: n.rawDescription,
      })),
    ];

    const transferPairs = findTransferPairs(candidatePool, 2);
    const transferMap = new Map<string, string>(); // stagedId -> matchedAccountId
    for (const pair of transferPairs) {
      if (pair.outflow.id?.startsWith('staged_')) {
        transferMap.set(pair.outflow.id, pair.inflow.accountId);
      }
      if (pair.inflow.id?.startsWith('staged_')) {
        transferMap.set(pair.inflow.id, pair.outflow.accountId);
      }
    }

    // Prepare staged rows with rule matching and deduplication check
    const stagedRows: StagedPreviewRow[] = [];
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    for (let i = 0; i < normalizedList.length; i++) {
      const normalized = normalizedList[i];
      const fingerprint = generateFingerprint({
        accountId,
        date: normalized.date,
        amount: normalized.amount,
        rawDescription: normalized.rawDescription,
      });

      const isDuplicate = existingFingerprints.has(fingerprint);
      const stagedKey = `staged_${i}`;
      const transferMatchedAcc = transferMap.get(stagedKey);

      const ruleMatch = matchRule(normalized.rawDescription, existingRules);
      const matchedCat = ruleMatch ? catMap.get(ruleMatch.categoryId) : null;

      const txType: 'income' | 'expenses' | 'savings' =
        normalized.amount > 0
          ? 'income'
          : matchedCat?.type === 'savings' || Boolean(transferMatchedAcc)
          ? 'savings'
          : 'expenses';

      const effectiveDate = computeEffectiveDate(
        normalized.date,
        txType,
        settings?.shiftLateIncome,
        settings?.lateIncomeDay
      );

      stagedRows.push({
        tempId: stagedKey,
        date: normalized.date,
        effectiveDate,
        amount: normalized.amount,
        type: txType,
        rawDescription: normalized.rawDescription,
        cleanMerchant:
          ruleMatch?.cleanMerchant ||
          normalized.suggestedMerchant ||
          normalized.rawDescription,
        categoryId: ruleMatch ? ruleMatch.categoryId : null,
        confidenceScore: ruleMatch ? ruleMatch.confidence : transferMatchedAcc ? 92 : 0,
        isDuplicate,
        isTransferCandidate: Boolean(transferMatchedAcc),
        transferMatchedAccountId: transferMatchedAcc,
      });
    }

    // If preview mode requested, return staged rows without inserting into DB yet
    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        mode: 'preview',
        detectedBank,
        confidence: detectionConfidence,
        totalRows: stagedRows.length,
        newCount: stagedRows.filter((r) => !r.isDuplicate).length,
        duplicateCount: stagedRows.filter((r) => r.isDuplicate).length,
        transferCount: stagedRows.filter((r) => r.isTransferCandidate).length,
        rawOcrText,
        stagedRows,
      });
    }

    // Commit mode: insert non-duplicate transactions into DB
    await db.insert(importBatches).values({
      id: batchId,
      filename: file?.name || 'Pasted Statement',
      accountId,
      totalRows: stagedRows.length,
      importedCount: 0,
      duplicateCount: 0,
    });

    let importedCount = 0;
    let duplicateCount = 0;

    for (const row of stagedRows) {
      const fingerprint = generateFingerprint({
        accountId,
        date: row.date,
        amount: row.amount,
        rawDescription: row.rawDescription,
      });

      try {
        const result = await db
          .insert(transactions)
          .values({
            id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            fingerprint,
            date: row.date,
            effectiveDate: row.effectiveDate,
            type: row.type,
            amount: row.amount,
            accountId,
            categoryId: row.categoryId,
            rawDescription: row.rawDescription,
            cleanMerchant: row.cleanMerchant,
            status: row.confidenceScore >= 90 && row.categoryId ? 'reviewed' : 'pending',
            batchId,
            confidenceScore: row.confidenceScore,
            metadata: {
              isTransferCandidate: row.isTransferCandidate,
              transferMatchedAccountId: row.transferMatchedAccountId || null,
            },
          })
          .onConflictDoNothing({ target: transactions.fingerprint })
          .returning();

        if (result.length > 0) {
          importedCount++;
        } else {
          duplicateCount++;
        }
      } catch {
        duplicateCount++;
      }
    }

    await db
      .update(importBatches)
      .set({ importedCount, duplicateCount })
      .where(eq(importBatches.id, batchId));

    return NextResponse.json({
      success: true,
      mode: 'commit',
      batchId,
      detectedBank,
      confidence: detectionConfidence,
      totalRows: stagedRows.length,
      importedCount,
      duplicateCount,
      transferCount: stagedRows.filter((r) => r.isTransferCandidate).length,
      stagedRows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during ingestion';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
