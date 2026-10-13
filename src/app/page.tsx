import Link from 'next/link';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories, budgetPlans, accounts } from '@/lib/db/schema';
import { calculateMonthlyBudget } from '@/lib/budget/calculator';
import { formatCurrency } from '@/lib/utils';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  PiggyBank, 
  Layers, 
  UploadCloud, 
  ChevronRight,
  TrendingUp,
  Building2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Fetch db records
  const allCategories = await db.select().from(categories);
  const allAccounts = await db.select().from(accounts);
  const allPlans = await db.select().from(budgetPlans);
  const allTransactions = await db.select().from(transactions);

  // Pending count for review queue badge
  const pendingTransactions = allTransactions.filter((t) => t.status === 'pending');

  // Compute Zero-Based Budget
  const budgetReport = calculateMonthlyBudget({
    year: currentYear,
    month: currentMonth,
    categories: allCategories,
    plans: allPlans,
    transactions: allTransactions,
  });

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <header className="flex items-center justify-between pt-1">
        <div>
          <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            {monthName}
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">Monthly Overview</h1>
        </div>
        <Link
          href="/dropzone"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Upload CSV</span>
        </Link>
      </header>

      {/* Review Queue Alert Banner (if pending transactions exist) */}
      {pendingTransactions.length > 0 && (
        <Link
          href="/review"
          className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:bg-amber-500/15 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{pendingTransactions.length} items to review</p>
              <p className="text-xs text-amber-300/80">Confirm automated categorizations</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* Zero-Based Core KPI: To Be Allocated */}
      <div className="p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-zinc-400 font-medium">
            Zero-Based Target
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            {budgetReport.toBeAllocated === 0 ? (
              <>
                <CheckCircle2 className="w-3 h-3" /> Balanced
              </>
            ) : (
              'Needs Allocation'
            )}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight text-white">
            {formatCurrency(budgetReport.toBeAllocated)}
          </span>
          <span className="text-xs text-zinc-400">left to allocate</span>
        </div>

        <p className="text-xs text-zinc-400 mt-2">
          Total Income ({formatCurrency(budgetReport.totalPlannedIncome)}) − Expenses & Savings ({formatCurrency(budgetReport.totalPlannedExpenses + budgetReport.totalPlannedSavings)})
        </p>
      </div>

      {/* Grid KPIs: Savings Rate, Living Expenses, Rental Yield */}
      <div className="grid grid-cols-2 gap-3">
        {/* Savings & Investments Card */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-400 font-medium">Savings Rate</span>
            <PiggyBank className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-300">{budgetReport.savingsRate}%</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {formatCurrency(budgetReport.totalActualSavings)} invested
            </p>
          </div>
        </div>

        {/* Living Consumption Spend */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-400 font-medium">Living Expenses</span>
            <ArrowDownLeft className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-rose-300">
              {formatCurrency(budgetReport.totalActualExpenses)}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Planned: {formatCurrency(budgetReport.totalPlannedExpenses)}
            </p>
          </div>
        </div>

        {/* Rental Property Cashflow (Segregated) */}
        <div className="col-span-2 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-zinc-400 font-medium">Rental Property Net</p>
              <p className="text-base font-bold text-white">
                {formatCurrency(budgetReport.rentalNetProfit)}
              </p>
            </div>
          </div>
          <span className="text-xs text-zinc-400">
            In: {formatCurrency(budgetReport.totalActualRentalInflow)} / Out: {formatCurrency(budgetReport.totalActualRentalOutflow)}
          </span>
        </div>
      </div>

      {/* Connected Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-200">Tracked Accounts</h2>
          <span className="text-xs text-zinc-400">{allAccounts.length} accounts</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {allAccounts.map((acc) => (
            <div
              key={acc.id}
              className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-zinc-300 truncate">{acc.name}</span>
              </div>
              <span className="text-[11px] text-zinc-400 capitalize">{acc.type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Ledger Entries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-200">Recent Transactions</h2>
          <Link href="/transactions" className="text-xs text-emerald-400 hover:underline">
            View all
          </Link>
        </div>

        {allTransactions.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-zinc-800 text-center space-y-2">
            <p className="text-sm text-zinc-400">No transactions recorded yet.</p>
            <Link
              href="/dropzone"
              className="inline-block text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Drop your first bank statement CSV →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {allTransactions.slice(0, 5).map((tx) => {
              const isIncome = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between"
                >
                  <div className="truncate pr-2">
                    <p className="text-xs font-medium text-zinc-200 truncate">
                      {tx.cleanMerchant || tx.rawDescription}
                    </p>
                    <p className="text-[11px] text-zinc-400">{tx.date}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      isIncome ? 'text-emerald-400' : 'text-zinc-200'
                    }`}
                  >
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
