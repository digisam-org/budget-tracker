'use client';

import Link from 'next/link';
import { SlidersHorizontal, Loader2 } from 'lucide-react';
import { useLocalAppData } from '@/lib/storage/use-local-app-data';
import { ReviewQueueClient } from '@/components/review/review-queue-client';

export default function ReviewPage() {
  const { data, error } = useLocalAppData();

  const pendingTransactions = data
    ? data.transactions.filter((t) => t.status === 'pending')
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Review Queue</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Fast 1-tap confirmation for newly ingested transactions. Tap to confirm or reassign category.
          </p>
        </div>
        <Link
          href="/rules"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium shrink-0 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Rules</span>
        </Link>
      </div>

      {error ? (
        <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {error}
        </div>
      ) : !data ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <p className="text-xs">Loading pending queue...</p>
        </div>
      ) : (
        <ReviewQueueClient
          initialTransactions={pendingTransactions}
          categories={data.categories}
        />
      )}
    </div>
  );
}
