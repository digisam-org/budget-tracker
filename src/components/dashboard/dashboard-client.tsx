'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Category, 
  BudgetPlan, 
  Transaction, 
  Account, 
  AppSettings 
} from '@/lib/db/schema';
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
  CheckCircle2,
  Calendar,
  Wallet,
  Scale
} from 'lucide-react';

interface DashboardClientProps {
  initialYear: number;
  initialMonth: number;
  categories: Category[];
  plans: BudgetPlan[];
  transactions: Transaction[];
  accounts: Account[];
  settings: AppSettings | null;
}

export function DashboardClient({
  initialYear,
  initialMonth,
  categories,
  plans,
  transactions,
  accounts,
  settings,
}: DashboardClientProps) {
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(initialMonth);

  const months = [
    { num: 1, label: 'Jan' },
    { num: 2, label: 'Feb' },
    { num: 3, label: 'Mar' },
    { num: 4, label: 'Apr' },
    { num: 5, label: 'May' },
    { num: 6, label: 'Jun' },
    { num: 7, label: 'Jul' },
    { num: 8, label: 'Aug' },
    { num: 9, label: 'Sep' },
    { num: 10, label: 'Oct' },
    { num: 11, label: 'Nov' },
    { num: 12, label: 'Dec' },
  ];

  const report = calculateMonthlyBudget({
    year: selectedYear,
    month: selectedMonth,
    categories,
    plans,
    transactions,
    shiftLateIncome: settings?.shiftLateIncome,
    lateIncomeDay: settings?.lateIncomeDay,
    savingsRateType: settings?.savingsRateType || 'active',
  });

  const periodTitle =
    selectedMonth === null
      ? `Full Year ${selectedYear}`
      : `${months[selectedMonth - 1]?.label} ${selectedYear}`;

  const pendingCount = transactions.filter((t) => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header & Upload Action */}
      <header className="flex items-center justify-between pt-1">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">
            {periodTitle}
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">Budget Dashboard</h1>
        </div>
        <Link
          href="/dropzone"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors shadow-sm"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Upload CSV</span>
        </Link>
      </header>

      {/* Period Switcher (Jan - Dec + Total Year) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <span className="flex items-center gap-1 font-medium">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" /> Select Period:
          </span>
          <button
            onClick={() => setSelectedMonth(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              selectedMonth === null
                ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/80 border border-zinc-800'
            }`}
          >
            Total Year
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {months.map((m) => {
            const isSelected = selectedMonth === m.num;
            return (
              <button
                key={m.num}
                onClick={() => setSelectedMonth(m.num)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-md shadow-emerald-500/20'
                    : 'bg-zinc-900 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending Items Banner (if any) */}
      {pendingCount > 0 && (
        <Link
          href="/review"
          className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:bg-amber-500/15 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{pendingCount} transactions awaiting review</p>
              <p className="text-xs text-amber-300/80">Confirm category mapping in staging queue</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* Core KPI Hero 1: Zero-Based Target (Planned) & Period Tracking Balance (Actual) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Zero-Based Planning Card */}
        <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                Planned Allocation
              </span>
              <Scale className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight text-white">
              {formatCurrency(report.toBeAllocated)}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {report.toBeAllocated === 0
                ? '✓ Every pound allocated'
                : report.toBeAllocated > 0
                ? 'left to allocate'
                : 'over-allocated'}
            </p>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2 border-t border-zinc-800/60 pt-2">
            Target: £0.00
          </p>
        </div>

        {/* Actual Tracking Balance Card */}
        <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                Actual Net Balance
              </span>
              <Wallet className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <p
              className={`text-2xl font-extrabold tracking-tight ${
                report.periodTrackingBalance >= 0 ? 'text-indigo-300' : 'text-rose-400'
              }`}
            >
              {formatCurrency(report.periodTrackingBalance)}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1 truncate">
              {report.balanceAnalysisText}
            </p>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2 border-t border-zinc-800/60 pt-2">
            Tracked Net Cashflow
          </p>
        </div>
      </div>

      {/* The 3 Pillars: Income, Expenses, Savings Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Income Pillar */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-400 font-medium">Income</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-base font-bold text-emerald-300">
            {formatCurrency(report.totalActualIncome)}
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Plan: {formatCurrency(report.totalPlannedIncome)}
          </p>
        </div>

        {/* Expenses Pillar */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-400 font-medium">Expenses</span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <p className="text-base font-bold text-rose-300">
            {formatCurrency(report.totalActualExpenses)}
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Plan: {formatCurrency(report.totalPlannedExpenses)}
          </p>
        </div>

        {/* Savings Pillar */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-400 font-medium">Savings</span>
            <PiggyBank className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <p className="text-base font-bold text-sky-300">
            {formatCurrency(report.totalActualSavings)}
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Plan: {formatCurrency(report.totalPlannedSavings)}
          </p>
        </div>
      </div>

      {/* Savings Rate Gauge Card */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 font-medium">Savings Rate ({report.savingsRateFormula})</p>
            <p className="text-lg font-bold text-white">{report.savingsRate}% of income</p>
          </div>
        </div>
        <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 font-semibold">
          {formatCurrency(report.totalActualSavings)} saved
        </span>
      </div>

      {/* Rental Property (Glasgow Flat Segregated Performance) */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 font-medium">Glasgow Flat (Rental Segregated)</p>
            <p className="text-base font-bold text-white">
              {formatCurrency(report.rentalNetProfit)} Net Yield
            </p>
          </div>
        </div>
        <div className="text-right text-[11px] text-zinc-400">
          <p>Inflow: <span className="text-emerald-400">{formatCurrency(report.rentalIncome)}</span></p>
          <p>Outflow: <span className="text-rose-400">{formatCurrency(report.rentalExpenses)}</span></p>
        </div>
      </div>

      {/* Top Tracked Categories Breakdown */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-zinc-200">Category Performance</h2>
          <Link href="/budget" className="text-xs text-emerald-400 hover:underline">
            Budget Planner →
          </Link>
        </div>

        <div className="space-y-2">
          {report.categories
            .filter((c) => c.actualAmount > 0 || c.plannedAmount > 0)
            .sort((a, b) => b.actualAmount - a.actualAmount)
            .slice(0, 8)
            .map((cat) => {
              const isOver = cat.type !== 'income' && cat.actualAmount > cat.plannedAmount;
              const typeColor =
                cat.type === 'income'
                  ? 'text-emerald-400'
                  : cat.type === 'savings'
                  ? 'text-sky-400'
                  : 'text-zinc-200';

              return (
                <div
                  key={cat.categoryId}
                  className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between gap-3"
                >
                  <div className="truncate">
                    <p className="text-xs font-semibold text-zinc-200 truncate">
                      {cat.categoryName}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Planned: {formatCurrency(cat.plannedAmount)}
                      {cat.plannedAmount > 0 && ` (${cat.percentageSpent}% spent)`}
                    </p>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${typeColor}`}>
                    {formatCurrency(cat.actualAmount)}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
