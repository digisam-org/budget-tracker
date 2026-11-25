import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db';
import {
  appSettings,
  accounts,
  categories,
  budgetPlans,
  transactions,
  categorizationRules,
  importBatches,
} from '@/lib/db/schema';
import { buildUltimateBudgetWorkbook } from '@/lib/backup/xlsx-builder';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    // 1. Raw SQLite database file download
    if (format === 'sqlite' || format === 'db') {
      const dbUrl = process.env.DATABASE_URL || 'file:budget.db';
      const rawPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;
      const resolvedPath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(process.cwd(), rawPath);

      const fileBuf = await readFile(resolvedPath);
      return new NextResponse(new Uint8Array(fileBuf), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': `attachment; filename="budget-tracker-${today}.db"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Fetch all tables for JSON or Excel export
    const [
      allSettings,
      allAccounts,
      allCategories,
      allPlans,
      allTransactions,
      allRules,
      allBatches,
    ] = await Promise.all([
      db.select().from(appSettings),
      db.select().from(accounts),
      db.select().from(categories),
      db.select().from(budgetPlans),
      db.select().from(transactions),
      db.select().from(categorizationRules),
      db.select().from(importBatches),
    ]);

    // 2. Excel (.xlsx) Workbook Export mirroring Ultimate Personal Budget Extended.xlsx
    if (format === 'xlsx' || format === 'excel') {
      const yearParam = searchParams.get('year');
      const year =
        yearParam && /^\d{4}$/.test(yearParam)
          ? parseInt(yearParam, 10)
          : allSettings[0]?.startingYear || 2026;

      const xlsxBuf = buildUltimateBudgetWorkbook({
        year,
        settings: allSettings[0] || null,
        accounts: allAccounts,
        categories: allCategories,
        plans: allPlans,
        transactions: allTransactions,
      });

      return new NextResponse(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Ultimate-Personal-Budget-${year}-${today}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // 3. Full JSON Snapshot Export (default)
    const snapshot = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      tables: {
        appSettings: allSettings,
        accounts: allAccounts,
        categories: allCategories,
        budgetPlans: allPlans,
        categorizationRules: allRules,
        importBatches: allBatches,
        transactions: allTransactions,
      },
    };

    const jsonString = JSON.stringify(snapshot, null, 2);
    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="budget-tracker-snapshot-${today}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate backup export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
