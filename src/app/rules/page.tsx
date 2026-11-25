import { connection } from 'next/server';
import { db } from '@/lib/db';
import { categorizationRules, categories, appSettings, transactions } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { RulesManagerClient } from '@/components/rules/rules-manager-client';
import { PrivacyPwaSettingsCard } from '@/components/rules/privacy-pwa-settings-card';

export const instant = false;

export default async function RulesPage() {
  await connection();

  const allRules = await db
    .select()
    .from(categorizationRules)
    .orderBy(desc(categorizationRules.priority));
  const allCategories = await db.select().from(categories);
  const [settings] = await db.select().from(appSettings);
  const pendingTxs = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.status, 'pending'));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Rules &amp; Engine Settings
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Manage learned merchant rules, test raw bank strings, and configure your zero-based budget engine.
        </p>
      </div>

      <RulesManagerClient
        initialRules={allRules}
        categories={allCategories}
        initialSettings={
          settings || {
            id: 'default',
            startingYear: 2026,
            shiftLateIncome: false,
            lateIncomeDay: 20,
            savingsRateType: 'active',
            updatedAt: new Date().toISOString(),
          }
        }
        pendingCount={pendingTxs.length}
      />

      <PrivacyPwaSettingsCard />
    </div>
  );
}
