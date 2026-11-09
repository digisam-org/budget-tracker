'use client';

import { useState } from 'react';
import { Category, BudgetPlan, Transaction, AppSettings } from '@/lib/db/schema';
import { calculateMonthlyBudget } from '@/lib/budget/calculator';
import { formatCurrency, parseToPence } from '@/lib/utils';
import { 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  PiggyBank, 
  ArrowDownLeft,
  Calendar,
  Check,
  TrendingUp,
  Scale
} from 'lucide-react';

interface BudgetPlannerClientProps {
  initialYear: number;
  initialMonth: number;
  categories: Category[];
  initialPlans: BudgetPlan[];
  transactions: Transaction[];
  settings: AppSettings | null;
}

export function BudgetPlannerClient({
  initialYear,
  initialMonth,
  categories,
  initialPlans,
  transactions,
  settings,
}: BudgetPlannerClientProps) {
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(initialMonth);
  const [plans, setPlans] = useState<BudgetPlan[]>(initialPlans);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

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

  const handlePlanChange = async (categoryId: string, rawValue: string) => {
    // Only allow editing plan when a specific month is selected
    if (selectedMonth === null) return;

    const pence = parseToPence(rawValue);
    const updatedPlans = plans.filter(
      (p) => !(p.categoryId === categoryId && p.year === selectedYear && p.month === selectedMonth)
    );
    updatedPlans.push({
      id: `plan_${selectedYear}_${selectedMonth}_${categoryId}`,
      year: selectedYear,
      month: selectedMonth,
      categoryId,
      plannedAmount: pence,
      notes: null,
    });
    setPlans(updatedPlans);

    setSavingCategory(categoryId);
    try {
      await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          categoryId,
          plannedAmount: pence,
        }),
      });
    } catch (e) {
      console.error('Failed to save budget plan:', e);
    } finally {
      setTimeout(() => setSavingCategory(null), 500);
    }
  };

  const sections = [
    { key: 'income', label: '1. Income', icon: DollarSign, color: 'text-emerald-400', totalPlanned: report.totalPlannedIncome, totalActual: report.totalActualIncome },
    { key: 'expenses', label: '2. Expenses', icon: ArrowDownLeft, color: 'text-rose-400', totalPlanned: report.totalPlannedExpenses, totalActual: report.totalActualExpenses },
    { key: 'savings', label: '3. Savings & Investments', icon: PiggyBank, color: 'text-sky-400', totalPlanned: report.totalPlannedSavings, totalActual: report.totalActualSavings },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Month & Period Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <span className="flex items-center gap-1 font-medium">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" /> Plan Period:
          </span>
          <button
            onClick={() => setSelectedMonth(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              selectedMonth === null
                ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800'
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

      {/* Zero-Based Status Hero Bar */}
      <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-emerald-400" /> Zero-Based Formula
          </span>
          {report.toBeAllocated === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> Balanced (£0 Target)
            </span>
          ) : report.toBeAllocated > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
              <AlertCircle className="w-3.5 h-3.5" /> Surplus to Assign
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
              <AlertCircle className="w-3.5 h-3.5" /> Over-Allocated
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span
            className={`text-3xl font-extrabold tracking-tight ${
              report.toBeAllocated === 0
                ? 'text-emerald-400'
                : report.toBeAllocated > 0
                ? 'text-sky-300'
                : 'text-rose-400'
            }`}
          >
            {formatCurrency(report.toBeAllocated)}
          </span>
          <span className="text-xs text-zinc-400">to be allocated</span>
        </div>

        <div className="pt-2 text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/80">
          <span>Income: <strong className="text-white">{formatCurrency(report.totalPlannedIncome)}</strong></span>
          <span>Expenses: <strong className="text-white">{formatCurrency(report.totalPlannedExpenses)}</strong></span>
          <span>Savings: <strong className="text-white">{formatCurrency(report.totalPlannedSavings)}</strong></span>
        </div>
      </div>

      {/* The 3 Core Sections (Income, Expenses, Savings) */}
      <div className="space-y-6">
        {sections.map((sec) => {
          const SecIcon = sec.icon;
          const itemsInSection = report.categories.filter((c) => c.type === sec.key);

          return (
            <div key={sec.key} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <SecIcon className={`w-4 h-4 ${sec.color}`} />
                  <h2 className="text-sm font-bold text-zinc-200">{sec.label}</h2>
                </div>
                <div className="text-xs text-zinc-400">
                  Plan: <strong className="text-white">{formatCurrency(sec.totalPlanned)}</strong>
                  {' • '}
                  Tracked: <strong className={sec.color}>{formatCurrency(sec.totalActual)}</strong>
                </div>
              </div>

              <div className="space-y-2">
                {itemsInSection.map((item) => {
                  const planPence = item.plannedAmount;
                  const actualPence = item.actualAmount;
                  const isOver = item.type !== 'income' && actualPence > planPence;

                  return (
                    <div
                      key={item.categoryId}
                      className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200 truncate pr-2">
                          {item.categoryName}
                        </span>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">
                            Tracked: <strong className="text-zinc-200">{formatCurrency(actualPence)}</strong>
                          </span>
                          {savingCategory === item.categoryId && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          )}
                        </div>
                      </div>

                      {/* Progress Bar & Inline Plan Input */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-zinc-950/80 rounded-full h-2 overflow-hidden border border-zinc-800">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isOver ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${Math.min(item.percentageSpent, 100)}%`,
                            }}
                          />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-zinc-500">Plan £</span>
                          <input
                            type="number"
                            step="10"
                            disabled={selectedMonth === null}
                            defaultValue={planPence > 0 ? (planPence / 100).toFixed(0) : ''}
                            placeholder="0"
                            onBlur={(e) => handlePlanChange(item.categoryId, e.target.value)}
                            className="w-20 bg-zinc-950 border border-zinc-800 text-right text-xs rounded-lg px-2 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
