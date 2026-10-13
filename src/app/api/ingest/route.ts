import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { importBatches, transactions, categorizationRules } from '@/lib/db/schema';
import { detectBankFormat } from '@/lib/ingestion/detector';
import { normalizeBankRow } from '@/lib/ingestion/normalizer';
import { generateFingerprint } from '@/lib/ingestion/fingerprint';
import { matchRule } from '@/lib/classifier/rules-engine';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const accountId = formData.get('accountId') as string | null;

    if (!file || !accountId) {
      return NextResponse.json(
        { error: 'File and accountId are required' },
        { status: 400 }
      );
    }

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

    // 1. Detect Bank Format
    const detection = detectBankFormat(parseResult.meta.fields);

    // 2. Load categorization rules for auto-tagging
    const existingRules = await db.select().from(categorizationRules);

    // 3. Normalize rows and generate fingerprints
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const preparedRows = [];

    for (const rawRow of parseResult.data) {
      const normalized = normalizeBankRow(rawRow, detection.bank);
      if (!normalized) continue;

      const fingerprint = generateFingerprint({
        accountId,
        date: normalized.date,
        amount: normalized.amount,
        rawDescription: normalized.rawDescription,
      });

      // Match deterministic rules
      const ruleMatch = matchRule(normalized.rawDescription, existingRules);

      preparedRows.push({
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        fingerprint,
        date: normalized.date,
        amount: normalized.amount,
        accountId,
        categoryId: ruleMatch ? ruleMatch.categoryId : null,
        rawDescription: normalized.rawDescription,
        cleanMerchant: ruleMatch?.cleanMerchant || normalized.suggestedMerchant || null,
        status: (ruleMatch && ruleMatch.confidence >= 90 ? 'reviewed' : 'pending') as 'reviewed' | 'pending',
        batchId,
        confidenceScore: ruleMatch ? ruleMatch.confidence : 0,
        metadata: {
          ...normalized.metadata,
          ruleMatched: ruleMatch?.matchedRuleId || null,
        },
      });
    }

    // 4. Insert Batch Record
    await db.insert(importBatches).values({
      id: batchId,
      filename: file.name,
      accountId,
      totalRows: parseResult.data.length,
      importedCount: 0,
      duplicateCount: 0,
    });

    // 5. Insert Transactions with Deduplication
    let importedCount = 0;
    let duplicateCount = 0;

    for (const row of preparedRows) {
      try {
        const result = await db
          .insert(transactions)
          .values(row)
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

    // Update batch record stats
    await db
      .update(importBatches)
      .set({ importedCount, duplicateCount })
      .where(eq(importBatches.id, batchId));

    return NextResponse.json({
      success: true,
      batchId,
      detectedBank: detection.bank,
      confidence: detection.confidence,
      totalRows: parseResult.data.length,
      importedCount,
      duplicateCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during ingestion';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
