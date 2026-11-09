import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface SplitLineInput {
  categoryId: string;
  amountInPence: number; // signed or absolute (will match parent sign)
  note?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transactionId, splits } = body as {
      transactionId: string;
      splits: SplitLineInput[];
    };

    if (!transactionId || !Array.isArray(splits) || splits.length < 2) {
      return NextResponse.json(
        { error: 'transactionId and at least 2 split lines are required' },
        { status: 400 }
      );
    }

    // 1. Fetch parent transaction
    const [parentTx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (!parentTx) {
      return NextResponse.json(
        { error: 'Parent transaction not found' },
        { status: 404 }
      );
    }

    const parentSign = parentTx.amount < 0 ? -1 : 1;
    const parentAbs = Math.abs(parentTx.amount);

    const normalizedSplits = splits.map((s) => ({
      categoryId: s.categoryId,
      absPence: Math.abs(Math.round(s.amountInPence)),
      signedPence: parentSign * Math.abs(Math.round(s.amountInPence)),
      note: (s.note || '').trim(),
    }));

    const totalSplitAbs = normalizedSplits.reduce((sum, s) => sum + s.absPence, 0);

    // Allow at most 1p rounding tolerance
    if (Math.abs(totalSplitAbs - parentAbs) > 1) {
      return NextResponse.json(
        {
          error: `Split total (${(totalSplitAbs / 100).toFixed(2)}) must equal original transaction amount (${(parentAbs / 100).toFixed(2)})`,
        },
        { status: 400 }
      );
    }

    // 2. Load categories to set accurate 'type' ('income' | 'expenses' | 'savings')
    const allCats = await db.select().from(categories);
    const catMap = new Map(allCats.map((c) => [c.id, c]));

    // 3. Mark parent transaction as 'ignored' so its SHA-256 fingerprint remains in DB
    // to prevent future statement uploads from re-importing it, while excluding it from budget math.
    const existingMeta =
      parentTx.metadata && typeof parentTx.metadata === 'object'
        ? (parentTx.metadata as Record<string, unknown>)
        : {};

    await db
      .update(transactions)
      .set({
        status: 'ignored',
        metadata: {
          ...existingMeta,
          isSplitParent: true,
          splitCount: normalizedSplits.length,
          splitAt: new Date().toISOString(),
        },
      })
      .where(eq(transactions.id, parentTx.id));

    // 4. Insert child split transactions
    const createdSplits = [];
    for (let i = 0; i < normalizedSplits.length; i++) {
      const split = normalizedSplits[i];
      const cat = catMap.get(split.categoryId);
      const txType: 'income' | 'expenses' | 'savings' =
        cat?.type || (split.signedPence > 0 ? 'income' : 'expenses');

      const baseMerchant = parentTx.cleanMerchant || parentTx.rawDescription;
      const cleanMerchant = split.note
        ? `${baseMerchant} (${split.note})`
        : `${baseMerchant} [Split ${i + 1}/${normalizedSplits.length}]`;

      const childRow = {
        id: `tx_split_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        fingerprint: `${parentTx.fingerprint}_split_${i + 1}_${Date.now()}`,
        date: parentTx.date,
        effectiveDate: parentTx.effectiveDate || parentTx.date,
        type: txType,
        amount: split.signedPence,
        accountId: parentTx.accountId,
        categoryId: split.categoryId,
        rawDescription: split.note
          ? `${parentTx.rawDescription} (${split.note})`
          : parentTx.rawDescription,
        cleanMerchant,
        status: 'reviewed' as const,
        batchId: parentTx.batchId,
        confidenceScore: 100,
        metadata: {
          isSplitChild: true,
          parentTransactionId: parentTx.id,
          splitIndex: i + 1,
          splitTotal: normalizedSplits.length,
          splitNote: split.note || null,
        },
      };

      await db.insert(transactions).values(childRow);
      createdSplits.push(childRow);
    }

    return NextResponse.json({
      success: true,
      parentTransactionId: parentTx.id,
      splits: createdSplits,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to split transaction';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

