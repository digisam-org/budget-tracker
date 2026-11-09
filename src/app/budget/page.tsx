import { connection } from 'next/server';
import { db } from '@/lib/db';
import { categories, budgetPlans, transactions, appSettings } from '@/lib/db/schema';
import { BudgetPlannerClient } from '@/components/budget/budget-planner-client';

export const instant = false;

export default async function BudgetPage() {
  await connection();

  const allCategories = await db.select().from(categories);
  const allPlans = await db.select().from(budgetPlans);
  const allTransactions = await db.select().from(transactions);
  const [settings] = await db.select().from(appSettings);

  const defaultYear = settings?.startingYear || 2026;
  const defaultMonth = 9; // September 2026

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Multi-Period Planner</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Zero-based budgeting across Income, Expenses, and Savings. Target £0.00 to allocate for each month.
        </p>
      </div>

      <BudgetPlannerClient
        initialYear={defaultYear}
        initialMonth={defaultMonth}
        categories={allCategories}
        initialPlans={allPlans}
        transactions={allTransactions}
        settings={settings || null}
      />
    </div>
  );
}
