import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categorizationRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transactionId, categoryId, cleanMerchant, createRule, rulePattern } = body;

    if (!transactionId || !categoryId) {
      return NextResponse.json(
        { error: 'transactionId and categoryId are required' },
        { status: 400 }
      );
    }

    // 1. Update transaction
    await db
      .update(transactions)
      .set({
        categoryId,
        cleanMerchant: cleanMerchant || null,
        status: 'reviewed',
      })
      .where(eq(transactions.id, transactionId));

    // 2. Optionally create learning rule for future statements
    if (createRule && rulePattern) {
      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.insert(categorizationRules).values({
        id: ruleId,
        pattern: rulePattern.trim().toUpperCase(),
        patternType: 'contains',
        categoryId,
        cleanMerchant: cleanMerchant || null,
        priority: 5,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update transaction';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
