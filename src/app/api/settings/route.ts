import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { appSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 'default'));
    return NextResponse.json({
      settings: settings || {
        id: 'default',
        startingYear: 2026,
        shiftLateIncome: false,
        lateIncomeDay: 20,
        savingsRateType: 'active',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { startingYear, shiftLateIncome, lateIncomeDay, savingsRateType } = body as {
      startingYear?: number;
      shiftLateIncome?: boolean;
      lateIncomeDay?: number;
      savingsRateType?: 'active' | 'passive';
    };

    const [existing] = await db.select().from(appSettings).where(eq(appSettings.id, 'default'));

    const nextStartingYear =
      typeof startingYear === 'number' && startingYear >= 2000 && startingYear <= 2100
        ? startingYear
        : existing?.startingYear ?? 2026;
    const nextShiftLateIncome =
      typeof shiftLateIncome === 'boolean'
        ? shiftLateIncome
        : existing?.shiftLateIncome ?? false;
    const nextLateIncomeDay =
      typeof lateIncomeDay === 'number' && lateIncomeDay >= 1 && lateIncomeDay <= 28
        ? lateIncomeDay
        : existing?.lateIncomeDay ?? 20;
    const nextSavingsRateType =
      savingsRateType === 'active' || savingsRateType === 'passive'
        ? savingsRateType
        : existing?.savingsRateType ?? 'active';

    await db
      .insert(appSettings)
      .values({
        id: 'default',
        startingYear: nextStartingYear,
        shiftLateIncome: nextShiftLateIncome,
        lateIncomeDay: nextLateIncomeDay,
        savingsRateType: nextSavingsRateType,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: {
          startingYear: nextStartingYear,
          shiftLateIncome: nextShiftLateIncome,
          lateIncomeDay: nextLateIncomeDay,
          savingsRateType: nextSavingsRateType,
          updatedAt: new Date().toISOString(),
        },
      });

    const [updated] = await db.select().from(appSettings).where(eq(appSettings.id, 'default'));

    return NextResponse.json({ success: true, settings: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
