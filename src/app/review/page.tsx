import { connection } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Review Queue</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Fast 1-tap confirmation for newly ingested transactions. Tap to confirm or reassign category.
        </p>
      </div>

      <ReviewQueueClient
        initialTransactions={pendingTransactions}
        categories={allCategories}
      />
    </div>
  );
}
