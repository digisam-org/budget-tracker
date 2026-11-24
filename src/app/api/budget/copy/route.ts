import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { budgetPlans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/budget/copy
 * Copies budget plan allocations from a source (year, month) to one or more target months,
 * OR applies an explicit array of { categoryId, plannedAmount } to target months.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sourceYear,
      sourceMonth,
      targetYear,
      targetMonths,
      overrides,
    } = body as {
      sourceYear?: number;
      sourceMonth?: number;
      targetYear: number;
      targetMonths: number[];
      overrides?: Array<{ categoryId: string; plannedAmount: number }>;
    };

    if (!targetYear || !Array.isArray(targetMonths) || targetMonths.length === 0) {
      return NextResponse.json(
        { error: 'targetYear and non-empty targetMonths array are required' },
        { status: 400 }
      );
    }

    let entriesToCopy: Array<{ categoryId: string; plannedAmount: number }> = [];

    if (Array.isArray(overrides) && overrides.length > 0) {
      entriesToCopy = overrides;
    } else if (sourceYear && sourceMonth) {
      const sourcePlans = await db
        .select()
        .from(budgetPlans)
        .where(and(eq(budgetPlans.year, sourceYear), eq(budgetPlans.month, sourceMonth)));

      entriesToCopy = sourcePlans.map((p) => ({
        categoryId: p.categoryId,
        plannedAmount: p.plannedAmount,
      }));
    } else {
      return NextResponse.json(
        { error: 'Either (sourceYear, sourceMonth) or overrides must be provided' },
        { status: 400 }
      );
    }

    if (entriesToCopy.length === 0) {
      return NextResponse.json(
        { error: 'No planned allocations found in the source month to copy' },
        { status: 404 }
      );
    }

    let upsertedCount = 0;

    for (const month of targetMonths) {
      if (month < 1 || month > 12) continue;

      for (const entry of entriesToCopy) {
        const planId = `plan_${targetYear}_${month}_${entry.categoryId}`;
        await db
          .insert(budgetPlans)
          .values({
            id: planId,
            year: targetYear,
            month,
            categoryId: entry.categoryId,
            plannedAmount: entry.plannedAmount,
          })
          .onConflictDoUpdate({
            target: [budgetPlans.year, budgetPlans.month, budgetPlans.categoryId],
            set: { plannedAmount: entry.plannedAmount },
          });
        upsertedCount++;
      }
    }

    const allPlans = await db.select().from(budgetPlans);

    return NextResponse.json({
      success: true,
      upsertedCount,
      targetMonths,
      plans: allPlans,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to copy budget plans';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
