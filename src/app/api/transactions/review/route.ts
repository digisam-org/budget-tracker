import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categorizationRules, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      transactionId,
      categoryId,
      cleanMerchant,
      createRule,
      rulePattern,
      status = 'reviewed',
    } = body as {
      transactionId: string;
      categoryId?: string | null;
      cleanMerchant?: string | null;
      createRule?: boolean;
      rulePattern?: string;
      status?: 'reviewed' | 'ignored' | 'pending';
    };

    if (!transactionId) {
      return NextResponse.json(
        { error: 'transactionId is required' },
        { status: 400 }
      );
    }

    if (status === 'ignored') {
      await db
        .update(transactions)
        .set({ status: 'ignored' })
        .where(eq(transactions.id, transactionId));
      return NextResponse.json({ success: true, status: 'ignored' });
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: 'categoryId is required when confirming a transaction' },
        { status: 400 }
      );
    }

    // Lookup category type so transaction.type stays in sync
    const [matchedCategory] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId));

    // 1. Update transaction
    await db
      .update(transactions)
      .set({
        categoryId,
        type: matchedCategory?.type || 'expenses',
        cleanMerchant: cleanMerchant || null,
        status: 'reviewed',
      })
      .where(eq(transactions.id, transactionId));

    // 2. Optionally create learning rule for future statements
    if (createRule && rulePattern && rulePattern.trim().length >= 2) {
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

    return NextResponse.json({ success: true, status: 'reviewed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update transaction';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
