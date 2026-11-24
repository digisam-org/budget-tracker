import Link from 'next/link';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { SlidersHorizontal } from 'lucide-react';
import { ReviewQueueClient } from '@/components/review/review-queue-client';

export const instant = false;

export default async function ReviewPage() {
  await connection();
  const pendingTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.status, 'pending'));

  const allCategories = await db.select().from(categories);

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

      <ReviewQueueClient
        initialTransactions={pendingTransactions}
        categories={allCategories}
      />
    </div>
  );
}
