'use client';

import { useLocalAppData } from '@/lib/storage/use-local-app-data';
import { BudgetPlannerClient } from '@/components/budget/budget-planner-client';
import { Loader2 } from 'lucide-react';

export default function BudgetPage() {
  const { data, error } = useLocalAppData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Multi-Period Planner</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Zero-based budgeting across Income, Expenses, and Savings. Target £0.00 to allocate for each month.
        </p>
      </div>

      {error ? (
        <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {error}
        </div>
      ) : !data ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <p className="text-xs">Loading budget plans...</p>
        </div>
      ) : (
        <BudgetPlannerClient
          initialYear={data.settings.startingYear || 2026}
          initialMonth={9}
          categories={data.categories}
          initialPlans={data.plans}
          transactions={data.transactions}
          settings={data.settings}
        />
      )}
    </div>
  );
}
