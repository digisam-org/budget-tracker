'use client';

import { useState } from 'react';
import { Category, BudgetPlan, Transaction } from '@/lib/db/schema';
import { calculateMonthlyBudget } from '@/lib/budget/calculator';
import { formatCurrency, parseToPence } from '@/lib/utils';
import { 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  PiggyBank, 
  Building2, 
  ShoppingCart, 
  Home, 
  HelpCircle,
  Save,
  Check
} from 'lucide-react';

interface BudgetPlannerClientProps {
  initialYear: number;
  initialMonth: number;
  categories: Category[];
  initialPlans: BudgetPlan[];
  transactions: Transaction[];
}

export function BudgetPlannerClient({
  initialYear,
  initialMonth,
  categories,
  initialPlans,
  transactions,
}: BudgetPlannerClientProps) {
  const [plans, setPlans] = useState<BudgetPlan[]>(initialPlans);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  // Compute live budget summary
  const report = calculateMonthlyBudget({
    year: initialYear,
    month: initialMonth,
    categories,
    plans,
    transactions,
  });

  const handlePlanChange = async (categoryId: string, rawValue: string) => {
    const pence = parseToPence(rawValue);
    const updatedPlans = plans.filter((p) => p.categoryId !== categoryId);
    updatedPlans.push({
      id: `plan_${initialYear}_${initialMonth}_${categoryId}`,
      year: initialYear,
      month: initialMonth,
      categoryId,
      plannedAmount: pence,
      notes: null,
    });
    setPlans(updatedPlans);

    // Save to API
    setSavingCategory(categoryId);
    try {
      await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: initialYear,
          month: initialMonth,
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

  const groupLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    income: { label: 'Income & Inflows', icon: DollarSign },
    fixed_expense: { label: 'Fixed Bills & Commitments', icon: Home },
    variable_expense: { label: 'Variable Living Costs', icon: ShoppingCart },
    rental_property: { label: 'Rental Property (Segregated)', icon: Building2 },
    savings_transfer: { label: 'Savings & Investment Transfers', icon: PiggyBank },
  };

  const groups = ['income', 'fixed_expense', 'variable_expense', 'rental_property', 'savings_transfer'] as const;

  return (
    <div className="space-y-6">
      {/* Zero-Based Status Hero Bar */}
      <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Zero-Based Budget Target
          </span>
          {report.toBeAllocated === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> £0 To Allocate (Perfect)
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

        {/* Progress formula bar */}
        <div className="pt-2 text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/80">
          <span>Income: <strong className="text-white">{formatCurrency(report.totalPlannedIncome)}</strong></span>
          <span>Expenses: <strong className="text-white">{formatCurrency(report.totalPlannedExpenses)}</strong></span>
          <span>Savings: <strong className="text-white">{formatCurrency(report.totalPlannedSavings)}</strong></span>
          <span>Rental: <strong className="text-white">{formatCurrency(report.totalPlannedRentalExpenses)}</strong></span>
        </div>
      </div>

      {/* Category Groups Breakdown */}
      <div className="space-y-6">
        {groups.map((groupKey) => {
          const groupMeta = groupLabels[groupKey];
          const GroupIcon = groupMeta.icon;
          const itemsInGroup = report.categories.filter((c) => c.group === groupKey);

          if (itemsInGroup.length === 0) return null;

          return (
            <div key={groupKey} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <GroupIcon className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-200">{groupMeta.label}</h2>
              </div>

              <div className="space-y-2">
                {itemsInGroup.map((item) => {
                  const planPence = item.plannedAmount;
                  const actualPence = item.actualAmount;
                  const isOver = item.group !== 'income' && actualPence > planPence;

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
                            Actual: <strong className="text-zinc-200">{formatCurrency(actualPence)}</strong>
                          </span>
                          {savingCategory === item.categoryId && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          )}
                        </div>
                      </div>

                      {/* Inline Plan Input & Progress */}
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
                            defaultValue={planPence > 0 ? (planPence / 100).toFixed(0) : ''}
                            placeholder="0"
                            onBlur={(e) => handlePlanChange(item.categoryId, e.target.value)}
                            className="w-20 bg-zinc-950 border border-zinc-800 text-right text-xs rounded-lg px-2 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500"
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
