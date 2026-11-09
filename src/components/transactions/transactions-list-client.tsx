'use client';

import { useState } from 'react';
import { Transaction, Category, Account } from '@/lib/db/schema';
import { formatCurrency } from '@/lib/utils';
import { Search, CheckCircle2, Clock, Calendar } from 'lucide-react';

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
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expenses' | 'savings'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed'>('all');

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));

  const filtered = initialTransactions.filter((tx) => {
    const matchesSearch =
      tx.rawDescription.toLowerCase().includes(search.toLowerCase()) ||
      (tx.cleanMerchant && tx.cleanMerchant.toLowerCase().includes(search.toLowerCase())) ||
      (tx.categoryId && catMap.get(tx.categoryId)?.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ? true : tx.status === statusFilter;

    const matchesType =
      typeFilter === 'all' ? true : tx.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by details, merchant or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded-2xl pl-9 pr-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="flex-1 bg-zinc-900 border border-zinc-800 text-xs rounded-2xl px-3 py-2 text-zinc-300 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="income">Income</option>
            <option value="expenses">Expenses</option>
            <option value="savings">Savings & Investments</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-800 text-xs rounded-2xl px-3 py-2 text-zinc-300 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="reviewed">Reviewed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Row counter */}
      <div className="text-[11px] text-zinc-500 px-1">
        Showing {filtered.length} of {initialTransactions.length} tracked records
      </div>

      {/* Transactions List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
            No matching transactions found.
          </div>
        ) : (
          filtered.map((tx) => {
            const isIncome = tx.type === 'income' || tx.amount > 0;
            const isSavings = tx.type === 'savings';
            const categoryName = tx.categoryId ? catMap.get(tx.categoryId) : 'Uncategorized';
            const accountName = accMap.get(tx.accountId) || 'Account';
            const hasShiftedDate = tx.effectiveDate && tx.effectiveDate !== tx.date;

            return (
              <div
                key={tx.id}
                className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between gap-3 transition-colors hover:bg-zinc-900/90"
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

                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5 flex-wrap">
                    <span className="font-mono">{tx.date}</span>
                    {hasShiftedDate && (
                      <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                        Shifted: {tx.effectiveDate}
                      </span>
                    )}
                    <span>•</span>
                    <span className="text-zinc-300 font-medium truncate">{categoryName}</span>
                    <span>•</span>
                    <span className="truncate">{accountName}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`text-xs font-bold block ${
                      isIncome
                        ? 'text-emerald-400'
                        : isSavings
                        ? 'text-sky-400'
                        : 'text-zinc-200'
                    }`}
                  >
                    {formatCurrency(tx.amount)}
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                      isIncome
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : isSavings
                        ? 'bg-sky-500/10 text-sky-400'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {tx.type}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
