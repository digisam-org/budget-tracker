'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Category, BudgetPlan, Transaction, AppSettings } from '@/lib/types';
import { saveLocalBudgetPlan, copyLocalBudgetPlans } from '@/lib/storage/local-services';
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
  Scale,
  Copy,
  CalendarRange,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';

interface BudgetPlannerClientProps {
  initialYear: number;
  initialMonth: number;
  categories: Category[];
  initialPlans: BudgetPlan[];
  transactions: Transaction[];
  settings: AppSettings | null;
}

const MONTHS = [
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
  const [isBulkWorking, setIsBulkWorking] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const savingsCategories = useMemo(
    () => categories.filter((c) => c.type === 'savings'),
    [categories]
  );
  const [autoBalanceTargetCat, setAutoBalanceTargetCat] = useState<string>(
    savingsCategories[0]?.id || ''
  );

  const report = useMemo(
    () =>
      calculateMonthlyBudget({
        year: selectedYear,
        month: selectedMonth,
        categories,
        plans,
        transactions,
        shiftLateIncome: settings?.shiftLateIncome,
        lateIncomeDay: settings?.lateIncomeDay,
        savingsRateType: settings?.savingsRateType || 'active',
      }),
    [selectedYear, selectedMonth, categories, plans, transactions, settings]
  );

  const plannedSavingsRate =
    report.totalPlannedIncome > 0
      ? Math.round((report.totalPlannedSavings / report.totalPlannedIncome) * 100)
      : 0;

  const showSuccess = (msg: string) => {
    setErrorBanner(null);
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const showError = (msg: string) => {
    setStatusBanner(null);
    setErrorBanner(msg);
  };

  const saveSinglePlan = async (categoryId: string, pence: number) => {
    if (selectedMonth === null) return;

    const updatedPlans = plans.filter(
      (p) =>
        !(
          p.categoryId === categoryId &&
          p.year === selectedYear &&
          p.month === selectedMonth
        )
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
      await saveLocalBudgetPlan({
        year: selectedYear,
        month: selectedMonth,
        categoryId,
        plannedAmount: pence,
      });
    } catch (e) {
      console.error('Failed to save budget plan:', e);
      showError('Could not save allocation. Please retry.');
    } finally {
      setTimeout(() => setSavingCategory(null), 500);
    }
  };

  const handlePlanChange = async (categoryId: string, rawValue: string) => {
    const pence = Math.max(0, parseToPence(rawValue));
    await saveSinglePlan(categoryId, pence);
  };

  const handleCopyFromPreviousMonth = async () => {
    if (selectedMonth === null) return;
    setIsBulkWorking(true);
    setErrorBanner(null);

    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    try {
      const data = await copyLocalBudgetPlans({
        sourceYear: prevYear,
        sourceMonth: prevMonth,
        targetYear: selectedYear,
        targetMonths: [selectedMonth],
      });
      setPlans(data.plans);
      const prevLabel = MONTHS.find((m) => m.num === prevMonth)?.label || '';
      const currLabel = MONTHS.find((m) => m.num === selectedMonth)?.label || '';
      showSuccess(`Copied ${prevLabel} ${prevYear} plan into ${currLabel} ${selectedYear}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to copy previous month');
    } finally {
      setIsBulkWorking(false);
    }
  };

  const handleApplyToRestOfYear = async () => {
    if (selectedMonth === null || selectedMonth >= 12) return;
    setIsBulkWorking(true);
    setErrorBanner(null);

    const targetMonths: number[] = [];
    for (let m = selectedMonth + 1; m <= 12; m++) {
      targetMonths.push(m);
    }

    try {
      const data = await copyLocalBudgetPlans({
        sourceYear: selectedYear,
        sourceMonth: selectedMonth,
        targetYear: selectedYear,
        targetMonths,
      });
      setPlans(data.plans);
      const currLabel = MONTHS.find((m) => m.num === selectedMonth)?.label || '';
      showSuccess(
        `Applied ${currLabel} plan to ${targetMonths.length} remaining month${
          targetMonths.length > 1 ? 's' : ''
        } in ${selectedYear}.`
      );
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to apply to rest of year');
    } finally {
      setIsBulkWorking(false);
    }
  };

  const handleFillFromActuals = async () => {
    if (selectedMonth === null) return;
    const overrides = report.categories
      .filter((c) => c.actualAmount > 0)
      .map((c) => ({
        categoryId: c.categoryId,
        plannedAmount: c.actualAmount,
      }));

    if (overrides.length === 0) {
      showError('No tracked actual transactions in this month to fill from.');
      return;
    }

    setIsBulkWorking(true);
    setErrorBanner(null);

    try {
      const data = await copyLocalBudgetPlans({
        targetYear: selectedYear,
        targetMonths: [selectedMonth],
        overrides,
      });
      setPlans(data.plans);
      showSuccess(`Synced ${overrides.length} categories to this month's tracked actuals.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to fill from actuals');
    } finally {
      setIsBulkWorking(false);
    }
  };

  const handleAutoBalanceToSavings = async () => {
    if (selectedMonth === null || report.toBeAllocated <= 0 || !autoBalanceTargetCat) return;
    const targetItem = report.categories.find((c) => c.categoryId === autoBalanceTargetCat);
    const currentPlanned = targetItem?.plannedAmount || 0;
    const nextPlanned = currentPlanned + report.toBeAllocated;
    await saveSinglePlan(autoBalanceTargetCat, nextPlanned);
    showSuccess(
      `Assigned ${formatCurrency(report.toBeAllocated)} surplus to ${
        targetItem?.categoryName || 'Savings'
      } — balanced to £0.00!`
    );
  };

  const sections = [
    {
      key: 'income',
      label: '1. Income',
      icon: DollarSign,
      color: 'text-emerald-400',
      totalPlanned: report.totalPlannedIncome,
      totalActual: report.totalActualIncome,
    },
    {
      key: 'expenses',
      label: '2. Expenses',
      icon: ArrowDownLeft,
      color: 'text-rose-400',
      totalPlanned: report.totalPlannedExpenses,
      totalActual: report.totalActualExpenses,
    },
    {
      key: 'savings',
      label: '3. Savings & Investments',
      icon: PiggyBank,
      color: 'text-sky-400',
      totalPlanned: report.totalPlannedSavings,
      totalActual: report.totalActualSavings,
    },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Month & Year Period Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <div className="inline-flex items-center rounded-lg bg-zinc-900 border border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedYear((y) => y - 1)}
                className="p-1 text-zinc-400 hover:text-white transition-colors"
                aria-label="Previous year"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-bold text-zinc-200">{selectedYear}</span>
              <button
                type="button"
                onClick={() => setSelectedYear((y) => y + 1)}
                className="p-1 text-zinc-400 hover:text-white transition-colors"
                aria-label="Next year"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedMonth(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedMonth === null
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800'
              }`}
            >
              Full Year
            </button>
            <Link
              href="/rules"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 transition-colors"
              title="Merchant Rules & Engine Settings"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Rules</span>
            </Link>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {MONTHS.map((m) => {
            const isSelected = selectedMonth === m.num;
            return (
              <button
                type="button"
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

      {/* Quick Bulk Actions Bar (when editing a specific month) */}
      {selectedMonth !== null && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            type="button"
            onClick={handleCopyFromPreviousMonth}
            disabled={isBulkWorking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-medium shrink-0 transition-colors disabled:opacity-50"
          >
            {isBulkWorking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Copy Prev Month</span>
          </button>

          {selectedMonth < 12 && (
            <button
              type="button"
              onClick={handleApplyToRestOfYear}
              disabled={isBulkWorking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-medium shrink-0 transition-colors disabled:opacity-50"
            >
              <CalendarRange className="w-3.5 h-3.5 text-sky-400" />
              <span>Apply to Rest of {selectedYear}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleFillFromActuals}
            disabled={isBulkWorking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-medium shrink-0 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Fill from Actuals</span>
          </button>
        </div>
      )}

      {/* Feedback Banners */}
      {statusBanner && (
        <div className="px-3.5 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
          <span>✓ {statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-400/70 hover:text-emerald-300 text-[11px] ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="px-3.5 py-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-400/70 hover:text-rose-300 text-[11px] ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

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

        <div className="flex items-baseline justify-between gap-2">
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

          <div className="text-right">
            <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400">
              <TrendingUp className="w-3 h-3" />
              <span>{report.savingsRate}% actual</span>
            </div>
            <p className="text-[10px] text-zinc-500">
              {plannedSavingsRate}% planned ({settings?.savingsRateType || 'active'})
            </p>
          </div>
        </div>

        {/* 1-Tap Auto-Balance Surplus to Savings */}
        {selectedMonth !== null &&
          report.toBeAllocated > 0 &&
          savingsCategories.length > 0 && (
            <div className="pt-2.5 border-t border-zinc-800/80 flex items-center gap-2">
              <select
                value={autoBalanceTargetCat}
                onChange={(e) => setAutoBalanceTargetCat(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                {savingsCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAutoBalanceToSavings}
                className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[11px] font-semibold whitespace-nowrap transition-colors"
              >
                Assign Surplus → £0
              </button>
            </div>
          )}

        <div className="pt-2 text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/80">
          <span>
            Income: <strong className="text-white">{formatCurrency(report.totalPlannedIncome)}</strong>
          </span>
          <span>
            Expenses: <strong className="text-white">{formatCurrency(report.totalPlannedExpenses)}</strong>
          </span>
          <span>
            Savings: <strong className="text-white">{formatCurrency(report.totalPlannedSavings)}</strong>
          </span>
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
                  const isOver = item.type === 'expenses' && actualPence > planPence && planPence > 0;
                  const deltaPence =
                    item.type === 'expenses'
                      ? planPence - actualPence
                      : actualPence - planPence;

                  return (
                    <div
                      key={item.categoryId}
                      className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {item.categoryName}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-zinc-400">
                            Actual: <strong className="text-zinc-200">{formatCurrency(actualPence)}</strong>
                          </span>
                          {planPence > 0 && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                isOver
                                  ? 'bg-rose-500/15 text-rose-400'
                                  : deltaPence >= 0
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {item.type === 'expenses'
                                ? deltaPence >= 0
                                  ? `${formatCurrency(deltaPence)} left`
                                  : `${formatCurrency(Math.abs(deltaPence))} over`
                                : deltaPence >= 0
                                ? `+${formatCurrency(deltaPence)}`
                                : formatCurrency(deltaPence)}
                            </span>
                          )}
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
                              isOver
                                ? 'bg-rose-500'
                                : item.type === 'savings'
                                ? 'bg-sky-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${Math.min(item.percentageSpent, 100)}%`,
                            }}
                          />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-zinc-500">Plan £</span>
                          <input
                            key={`${selectedYear}-${selectedMonth ?? 'all'}-${item.categoryId}-${planPence}`}
                            type="number"
                            step="10"
                            min="0"
                            disabled={selectedMonth === null}
                            defaultValue={planPence > 0 ? (planPence / 100).toFixed(0) : ''}
                            placeholder="0"
                            onBlur={(e) => handlePlanChange(item.categoryId, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
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
