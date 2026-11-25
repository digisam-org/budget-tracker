'use client';

import { useLocalAppData } from '@/lib/storage/use-local-app-data';
import { DashboardClient } from '@/components/dashboard/dashboard-client';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { data, error } = useLocalAppData();

  if (error) {
    return (
      <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        <p className="text-xs">Loading local vault...</p>
      </div>
    );
  }

  const defaultYear = data.settings.startingYear || 2026;
  const defaultMonth = 9;

  return (
    <DashboardClient
      initialYear={defaultYear}
      initialMonth={defaultMonth}
      categories={data.categories}
      plans={data.plans}
      transactions={data.transactions}
      accounts={data.accounts}
      settings={data.settings}
    />
  );
}
