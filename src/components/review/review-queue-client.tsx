'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Transaction, Category } from '@/lib/db/schema';
import { formatCurrency } from '@/lib/utils';
import { 
  Check, 
  ChevronRight, 
  Sparkles, 
  PartyPopper, 
  ArrowRight,
  BookmarkCheck,
  Loader2
} from 'lucide-react';

interface ReviewQueueClientProps {
  initialTransactions: Transaction[];
  categories: Category[];
}

export function ReviewQueueClient({
  initialTransactions,
  categories,
}: ReviewQueueClientProps) {
  const [items, setItems] = useState<Transaction[]>(initialTransactions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [saveAsRule, setSaveAsRule] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const currentItem = items[currentIndex];

  const handleConfirm = async (categoryIdToUse?: string) => {
    if (!currentItem) return;

    const catId = categoryIdToUse || selectedCategory || currentItem.categoryId || categories[0]?.id;
    if (!catId) return;

    setIsSubmitting(true);

    try {
      await fetch('/api/transactions/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: currentItem.id,
          categoryId: catId,
          cleanMerchant: currentItem.cleanMerchant,
          createRule: saveAsRule,
          rulePattern: currentItem.cleanMerchant || currentItem.rawDescription.slice(0, 15),
        }),
      });

      // Remove from list
      const remaining = items.filter((_, idx) => idx !== currentIndex);
      setItems(remaining);
      setSelectedCategory('');
    } catch (err) {
      console.error('Review error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-8 rounded-3xl bg-zinc-900/60 border border-zinc-800 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
          <PartyPopper className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">All Caught Up!</h3>
          <p className="text-xs text-zinc-400 mt-1">
            All bank transactions have been categorized and confirmed.
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2">
          <Link
            href="/budget"
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors"
          >
            <span>View Zero-Based Budget</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/dropzone"
            className="py-2.5 px-4 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
          >
            Upload another statement
          </Link>
        </div>
      </div>
    );
  }

  const currentCat = categories.find(
    (c) => c.id === (selectedCategory || currentItem.categoryId)
  );

  return (
    <div className="space-y-4">
      {/* Progress pill */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span>Queue Progress</span>
        <span className="font-semibold text-emerald-400">
          {items.length} remaining
        </span>
      </div>

      {/* Primary Review Card */}
      <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800/90 shadow-2xl space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-500">{currentItem.date}</span>
            <h2 className="text-xl font-bold text-white mt-0.5">
              {currentItem.cleanMerchant || 'Unknown Merchant'}
            </h2>
            <p className="text-xs text-zinc-400 font-mono mt-1 break-all bg-zinc-950/60 p-2 rounded-xl border border-zinc-800/50">
              {currentItem.rawDescription}
            </p>
          </div>
          <span
            className={`text-xl font-bold shrink-0 ml-3 ${
              currentItem.amount > 0 ? 'text-emerald-400' : 'text-zinc-100'
            }`}
          >
            {formatCurrency(currentItem.amount)}
          </span>
        </div>

        {/* Suggested Category Badge */}
        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-zinc-400">Assigned Category</p>
              <p className="text-sm font-semibold text-emerald-300">
                {currentCat?.name || 'Uncategorized'}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">
            {currentCat?.group.replace('_', ' ')}
          </span>
        </div>

        {/* Quick Category Chips Selector */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Quick Reassign Category:
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
            {categories.map((cat) => {
              const isSelected = (selectedCategory || currentItem.categoryId) === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all border shrink-0 ${
                    isSelected
                      ? 'bg-emerald-500 text-zinc-950 font-semibold border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/60 hover:bg-zinc-750'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Learning rule checkbox */}
        <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={saveAsRule}
            onChange={(e) => setSaveAsRule(e.target.checked)}
            className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900 bg-zinc-800"
          />
          <div className="flex items-center gap-1.5">
            <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Remember rule for future imports of this merchant</span>
          </div>
        </label>

        {/* Fast Action Buttons */}
        <div className="pt-2 flex gap-2">
          <button
            onClick={() => handleConfirm()}
            disabled={isSubmitting}
            className="flex-1 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Confirm (1-Tap)</span>
              </>
            )}
          </button>

          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % items.length)}
            className="py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-medium transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
