'use client';

import { useState } from 'react';
import { Transaction, Category, Account } from '@/lib/db/schema';
import { formatCurrency } from '@/lib/utils';
import { Search, Filter, CheckCircle2, Clock } from 'lucide-react';

interface TransactionsListClientProps {
  initialTransactions: Transaction[];
  categories: Category[];
  accounts: Account[];
}

export function TransactionsListClient({
  initialTransactions,
  categories,
  accounts,
}: TransactionsListClientProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed'>('all');

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));

  const filtered = initialTransactions.filter((tx) => {
    const matchesSearch =
      tx.rawDescription.toLowerCase().includes(search.toLowerCase()) ||
      (tx.cleanMerchant && tx.cleanMerchant.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ? true : tx.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded-2xl pl-9 pr-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'reviewed')}
          className="bg-zinc-900 border border-zinc-800 text-xs rounded-2xl px-3 py-2 text-zinc-300 focus:outline-none"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </div>

      {/* Transactions Count */}
      <div className="text-[11px] text-zinc-500 px-1">
        Showing {filtered.length} transactions
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
            No matching transactions found.
          </div>
        ) : (
          filtered.map((tx) => {
            const isIncome = tx.amount > 0;
            const categoryName = tx.categoryId ? catMap.get(tx.categoryId) : 'Uncategorized';
            const accountName = accMap.get(tx.accountId) || 'Account';

            return (
              <div
                key={tx.id}
                className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between gap-3"
              >
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-zinc-200 truncate">
                      {tx.cleanMerchant || tx.rawDescription}
                    </p>
                    {tx.status === 'reviewed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                    <span>{tx.date}</span>
                    <span>•</span>
                    <span className="text-zinc-400 truncate">{categoryName}</span>
                    <span>•</span>
                    <span className="truncate">{accountName}</span>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold shrink-0 ${
                    isIncome ? 'text-emerald-400' : 'text-zinc-200'
                  }`}
                >
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
