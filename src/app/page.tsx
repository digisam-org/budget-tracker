import { connection } from 'next/server';
import { db } from '@/lib/db';
import { 
  transactions, 
  categories, 
  budgetPlans, 
  accounts, 
  appSettings 
} from '@/lib/db/schema';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export const instant = false;

export default async function DashboardPage() {
  await connection();

  const allCategories = await db.select().from(categories);
  const allAccounts = await db.select().from(accounts);
  const allPlans = await db.select().from(budgetPlans);
  const allTransactions = await db.select().from(transactions);
  const [settings] = await db.select().from(appSettings);

  const defaultYear = settings?.startingYear || 2026;
  // Default to September 2026 (where latest transactions were logged in the Excel sheet) or current month
  const defaultMonth = 9;

  return (
    <DashboardClient
      initialYear={defaultYear}
      initialMonth={defaultMonth}
      categories={allCategories}
      plans={allPlans}
      transactions={allTransactions}
      accounts={allAccounts}
      settings={settings || null}
    />
  );
}
