import { connection } from 'next/server';
import { db } from '@/lib/db';
import { categories, budgetPlans, transactions } from '@/lib/db/schema';
import { BudgetPlannerClient } from '@/components/budget/budget-planner-client';

export const instant = false;

export default async function BudgetPage() {
  await connection();
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  const allCategories = await db.select().from(categories);
  const allPlans = await db.select().from(budgetPlans);
  const allTransactions = await db.select().from(transactions);

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
          {monthName}
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white">Zero-Based Planner</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Give every single pound a job. Target £0 left to allocate across Income, Bills, Living, Rental, and Investments.
        </p>
      </div>

      <BudgetPlannerClient
        initialYear={currentYear}
        initialMonth={currentMonth}
        categories={allCategories}
        initialPlans={allPlans}
        transactions={allTransactions}
      />
    </div>
  );
}
