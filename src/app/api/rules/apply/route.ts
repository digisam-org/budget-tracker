import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories, categorizationRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { matchRule } from '@/lib/classifier/rules-engine';

/**
 * POST /api/rules/apply
 * Retroactively applies deterministic merchant rules to all pending transactions
 * (or optionally to all uncategorized transactions).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const autoApprove = body?.autoApprove !== false;

    const allRules = await db.select().from(categorizationRules);
    const allCategories = await db.select().from(categories);
    const catMap = new Map(allCategories.map((c) => [c.id, c]));

    const pendingTxs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.status, 'pending'));

    let matchedCount = 0;
    let autoReviewedCount = 0;

    for (const tx of pendingTxs) {
      const matched = matchRule(tx.rawDescription, allRules);
      if (!matched) continue;

      matchedCount++;
      const cat = catMap.get(matched.categoryId);
      const newStatus: 'reviewed' | 'pending' = autoApprove ? 'reviewed' : 'pending';
      if (newStatus === 'reviewed') autoReviewedCount++;

      const existingMeta =
        tx.metadata && typeof tx.metadata === 'object'
          ? (tx.metadata as Record<string, unknown>)
          : {};

      await db
        .update(transactions)
        .set({
          categoryId: matched.categoryId,
          cleanMerchant: matched.cleanMerchant || tx.cleanMerchant || tx.rawDescription,
          type: cat?.type || tx.type,
          confidenceScore: matched.confidence,
          status: newStatus,
          metadata: {
            ...existingMeta,
            aiReasoning: `Matched merchant rule (${matched.matchedRuleId})`,
            classificationSource: 'rule',
          },
        })
        .where(eq(transactions.id, tx.id));
    }

    return NextResponse.json({
      success: true,
      scannedCount: pendingTxs.length,
      matchedCount,
      autoReviewedCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to apply rules';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
