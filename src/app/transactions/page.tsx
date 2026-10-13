import { connection } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories, accounts } from '@/lib/db/schema';
import { TransactionsListClient } from '@/components/transactions/transactions-list-client';

export const instant = false;

export default async function TransactionsPage() {
  await connection();
  const allTransactions = await db.select().from(transactions);
  const allCategories = await db.select().from(categories);
  const allAccounts = await db.select().from(accounts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Transaction Ledger</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Historical ledger of all imported bank statement entries across your accounts.
        </p>
      </div>

      <TransactionsListClient
        initialTransactions={allTransactions}
        categories={allCategories}
        accounts={allAccounts}
      />
    </div>
  );
}
