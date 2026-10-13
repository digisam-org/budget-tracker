import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { budgetPlans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, month, categoryId, plannedAmount } = body;

    if (!year || !month || !categoryId || plannedAmount === undefined) {
      return NextResponse.json(
        { error: 'year, month, categoryId, and plannedAmount are required' },
        { status: 400 }
      );
    }

    const planId = `plan_${year}_${month}_${categoryId}`;

    await db
      .insert(budgetPlans)
      .values({
        id: planId,
        year,
        month,
        categoryId,
        plannedAmount,
      })
      .onConflictDoUpdate({
        target: [budgetPlans.year, budgetPlans.month, budgetPlans.categoryId],
        set: { plannedAmount },
      });

    return NextResponse.json({ success: true, planId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update budget plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
