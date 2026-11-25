import { NextRequest, NextResponse } from 'next/server';
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

interface BackupSnapshot {
  schemaVersion?: number;
  tables?: {
    appSettings?: Array<typeof appSettings.$inferInsert>;
    accounts?: Array<typeof accounts.$inferInsert>;
    categories?: Array<typeof categories.$inferInsert>;
    budgetPlans?: Array<typeof budgetPlans.$inferInsert>;
    categorizationRules?: Array<typeof categorizationRules.$inferInsert>;
    importBatches?: Array<typeof importBatches.$inferInsert>;
    transactions?: Array<typeof transactions.$inferInsert>;
  };
}

export async function POST(req: NextRequest) {
  try {
    let snapshot: BackupSnapshot;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'Backup JSON file is required' }, { status: 400 });
      }
      const rawText = await file.text();
      snapshot = JSON.parse(rawText) as BackupSnapshot;
    } else {
      snapshot = (await req.json()) as BackupSnapshot;
    }

    if (!snapshot?.tables || typeof snapshot.tables !== 'object') {
      return NextResponse.json(
        { error: 'Invalid backup snapshot format: missing "tables" object' },
        { status: 400 }
      );
    }

    const { tables } = snapshot;
    const counts = {
      appSettings: 0,
      accounts: 0,
      categories: 0,
      budgetPlans: 0,
      categorizationRules: 0,
      importBatches: 0,
      transactions: 0,
    };

    // 1. Restore Settings
    if (Array.isArray(tables.appSettings)) {
      for (const row of tables.appSettings) {
        await db
          .insert(appSettings)
          .values(row)
          .onConflictDoUpdate({
            target: appSettings.id,
            set: {
              startingYear: row.startingYear,
              shiftLateIncome: row.shiftLateIncome,
              lateIncomeDay: row.lateIncomeDay,
              savingsRateType: row.savingsRateType,
              updatedAt: row.updatedAt || new Date().toISOString(),
            },
          });
        counts.appSettings++;
      }
    }

    // 2. Restore Accounts
    if (Array.isArray(tables.accounts)) {
      for (const row of tables.accounts) {
        await db
          .insert(accounts)
          .values(row)
          .onConflictDoUpdate({
            target: accounts.id,
            set: {
              name: row.name,
              type: row.type,
              institution: row.institution,
              currency: row.currency,
              balance: row.balance,
              isActive: row.isActive,
            },
          });
        counts.accounts++;
      }
    }

    // 3. Restore Categories
    if (Array.isArray(tables.categories)) {
      for (const row of tables.categories) {
        await db
          .insert(categories)
          .values(row)
          .onConflictDoUpdate({
            target: categories.id,
            set: {
              name: row.name,
              type: row.type,
              subgroup: row.subgroup,
              isSavingsTransfer: row.isSavingsTransfer,
              color: row.color,
              icon: row.icon,
              sortOrder: row.sortOrder,
            },
          });
        counts.categories++;
      }
    }

    // 4. Restore Budget Plans
    if (Array.isArray(tables.budgetPlans)) {
      for (const row of tables.budgetPlans) {
        await db
          .insert(budgetPlans)
          .values(row)
          .onConflictDoUpdate({
            target: [budgetPlans.year, budgetPlans.month, budgetPlans.categoryId],
            set: {
              plannedAmount: row.plannedAmount,
              notes: row.notes,
            },
          });
        counts.budgetPlans++;
      }
    }

    // 5. Restore Rules
    if (Array.isArray(tables.categorizationRules)) {
      for (const row of tables.categorizationRules) {
        await db
          .insert(categorizationRules)
          .values(row)
          .onConflictDoUpdate({
            target: categorizationRules.id,
            set: {
              pattern: row.pattern,
              patternType: row.patternType,
              categoryId: row.categoryId,
              cleanMerchant: row.cleanMerchant,
              priority: row.priority,
            },
          });
        counts.categorizationRules++;
      }
    }

    // 6. Restore Import Batches
    if (Array.isArray(tables.importBatches)) {
      for (const row of tables.importBatches) {
        await db
          .insert(importBatches)
          .values(row)
          .onConflictDoNothing({ target: importBatches.id });
        counts.importBatches++;
      }
    }

    // 7. Restore Transactions (deduplicated by fingerprint)
    if (Array.isArray(tables.transactions)) {
      for (const row of tables.transactions) {
        await db
          .insert(transactions)
          .values(row)
          .onConflictDoUpdate({
            target: transactions.fingerprint,
            set: {
              categoryId: row.categoryId,
              cleanMerchant: row.cleanMerchant,
              status: row.status,
              type: row.type,
              effectiveDate: row.effectiveDate,
              confidenceScore: row.confidenceScore,
              metadata: row.metadata,
            },
          });
        counts.transactions++;
      }
    }

    return NextResponse.json({
      success: true,
      restoredCounts: counts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to restore backup snapshot';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
