'use client';

import { useLocalAppData } from '@/lib/storage/use-local-app-data';
import { TransactionsListClient } from '@/components/transactions/transactions-list-client';
import { Loader2 } from 'lucide-react';

export default function TransactionsPage() {
  const { data, error } = useLocalAppData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Transaction Ledger</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Historical ledger of all imported bank statement entries stored locally on your device.
        </p>
      </div>

      {error ? (
        <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {error}
        </div>
      ) : !data ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <p className="text-xs">Loading transaction ledger...</p>
        </div>
      ) : (
        <TransactionsListClient
          initialTransactions={data.transactions}
          categories={data.categories}
          accounts={data.accounts}
        />
      )}
    </div>
  );
}
