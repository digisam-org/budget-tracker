'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Transaction, Category } from '@/lib/db/schema';
import { formatCurrency } from '@/lib/utils';
import { SplitTransactionModal } from '@/components/transactions/split-transaction-modal';
import {
  Check,
  Sparkles,
  PartyPopper,
  ArrowRight,
  BookmarkCheck,
  Loader2,
  Split,
  EyeOff,
  ArrowLeftRight,
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
  const [customMerchant, setCustomMerchant] = useState<string>('');
  const [saveAsRule, setSaveAsRule] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [splittingTx, setSplittingTx] = useState<Transaction | null>(null);

  const currentItem = items[currentIndex];

  const advanceQueue = (removedId: string) => {
    const remaining = items.filter((t) => t.id !== removedId);
    setItems(remaining);
    if (currentIndex >= remaining.length && remaining.length > 0) {
      setCurrentIndex(0);
    }
    setSelectedCategory('');
    setCustomMerchant('');
  };

  const handleConfirm = async (categoryIdToUse?: string) => {
    if (!currentItem) return;

    const catId =
      categoryIdToUse ||
      selectedCategory ||
      currentItem.categoryId ||
      categories[0]?.id;
    if (!catId) return;

    setIsSubmitting(true);
    const merchantToSave =
      customMerchant.trim() || currentItem.cleanMerchant || currentItem.rawDescription;

    try {
      await fetch('/api/transactions/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: currentItem.id,
          categoryId: catId,
          cleanMerchant: merchantToSave,
          createRule: saveAsRule,
          rulePattern:
            merchantToSave.slice(0, 20) || currentItem.rawDescription.slice(0, 15),
          status: 'reviewed',
        }),
      });

      advanceQueue(currentItem.id);
    } catch (err) {
      console.error('Review error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIgnore = async () => {
    if (!currentItem) return;
    setIsSubmitting(true);
    try {
      await fetch('/api/transactions/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: currentItem.id,
          status: 'ignored',
        }),
      });
      advanceQueue(currentItem.id);
    } catch (err) {
      console.error('Ignore error:', err);
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
            All bank and screenshot transactions have been categorized and confirmed.
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
            Upload another statement or screenshot
          </Link>
        </div>
      </div>
    );
  }

  const currentCat = categories.find(
    (c) => c.id === (selectedCategory || currentItem.categoryId)
  );

  const meta =
    currentItem.metadata && typeof currentItem.metadata === 'object'
      ? (currentItem.metadata as Record<string, unknown>)
      : {};
  const isTransferCandidate = Boolean(meta.isTransferCandidate);

  return (
    <div className="space-y-4">
      {/* Progress pill */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span>
          Item {currentIndex + 1} of {items.length}
        </span>
        <span className="font-semibold text-emerald-400">
          {items.length} remaining
        </span>
      </div>

      {/* Primary Review Card */}
      <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800/90 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500">
                {currentItem.date}
              </span>
              {isTransferCandidate && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  <ArrowLeftRight className="w-3 h-3" /> Matched Transfer
                </span>
              )}
            </div>

            <input
              type="text"
              value={
                customMerchant !== ''
                  ? customMerchant
                  : currentItem.cleanMerchant || currentItem.rawDescription
              }
              onChange={(e) => setCustomMerchant(e.target.value)}
              placeholder="Merchant name..."
              className="w-full text-lg font-bold text-white mt-1 bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-emerald-500 focus:outline-none pb-0.5 transition-colors"
            />

            <p className="text-xs text-zinc-400 font-mono mt-1.5 break-all bg-zinc-950/60 p-2 rounded-xl border border-zinc-800/50">
              {currentItem.rawDescription}
            </p>
          </div>
          <span
            className={`text-xl font-bold shrink-0 ${
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
                {currentCat?.name || 'Select a category below'}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">
            {currentCat?.type || currentItem.type}
          </span>
        </div>

        {/* Quick Category Chips Selector */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Quick Reassign Category:
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
            {categories.map((cat) => {
              const isSelected =
                (selectedCategory || currentItem.categoryId) === cat.id;
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
        <div className="pt-2 space-y-2">
          <div className="flex gap-2">
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
              type="button"
              onClick={() => setSplittingTx(currentItem)}
              disabled={isSubmitting}
              className="py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
              title="Split this receipt across multiple categories"
            >
              <Split className="w-4 h-4" />
              <span>Split</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleIgnore}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Ignore / Duplicate Transfer</span>
            </button>

            {items.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('');
                  setCustomMerchant('');
                  setCurrentIndex((prev) => (prev + 1) % items.length);
                }}
                className="py-2.5 px-4 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 text-xs font-medium transition-colors"
              >
                Skip for now →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Split Modal */}
      {splittingTx && (
        <SplitTransactionModal
          transaction={splittingTx}
          categories={categories}
          onClose={() => setSplittingTx(null)}
          onSplitSuccess={(parentId) => {
            setSplittingTx(null);
            advanceQueue(parentId);
          }}
        />
      )}
    </div>
  );
}
