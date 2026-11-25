'use client';

import { useState } from 'react';
import { Transaction, Category } from '@/lib/types';
import { splitLocalTransaction } from '@/lib/storage/local-services';
import { formatCurrency, parseToPence } from '@/lib/utils';
import {
  Split,
  Plus,
  Trash2,
  Check,
  X,
  Wand2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface SplitRowState {
  id: string;
  categoryId: string;
  amountStr: string;
  note: string;
}

interface SplitTransactionModalProps {
  transaction: Transaction;
  categories: Category[];
  onClose: () => void;
  onSplitSuccess: (parentId: string, createdSplits: Transaction[]) => void;
}

export function SplitTransactionModal({
  transaction,
  categories,
  onClose,
  onSplitSuccess,
}: SplitTransactionModalProps) {
  const totalAbsPence = Math.abs(transaction.amount);
  const defaultCat1 = transaction.categoryId || categories[0]?.id || '';
  const defaultCat2 =
    categories.find((c) => c.id !== defaultCat1 && c.type === transaction.type)?.id ||
    categories[1]?.id ||
    defaultCat1;

  const halfPence1 = Math.floor(totalAbsPence / 2);
  const halfPence2 = totalAbsPence - halfPence1;

  const [rows, setRows] = useState<SplitRowState[]>([
    {
      id: 'split_1',
      categoryId: defaultCat1,
      amountStr: (halfPence1 / 100).toFixed(2),
      note: '',
    },
    {
      id: 'split_2',
      categoryId: defaultCat2,
      amountStr: (halfPence2 / 100).toFixed(2),
      note: '',
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAllocatedPence = rows.reduce(
    (sum, r) => sum + Math.abs(parseToPence(r.amountStr || '0')),
    0
  );
  const remainingPence = totalAbsPence - currentAllocatedPence;
  const isBalanced = Math.abs(remainingPence) <= 1;

  const handleAmountChange = (index: number, val: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], amountStr: val };

    // If there are exactly 2 rows and the user edits Row 0, auto-adjust Row 1 to the remainder
    if (updated.length === 2 && index === 0) {
      const firstPence = Math.abs(parseToPence(val || '0'));
      const rem = Math.max(0, totalAbsPence - firstPence);
      updated[1] = { ...updated[1], amountStr: (rem / 100).toFixed(2) };
    }

    setRows(updated);
    setError(null);
  };

  const handleFillRemainder = (index: number) => {
    const otherSum = rows.reduce(
      (sum, r, idx) => (idx === index ? sum : sum + Math.abs(parseToPence(r.amountStr || '0'))),
      0
    );
    const rem = Math.max(0, totalAbsPence - otherSum);
    const updated = [...rows];
    updated[index] = { ...updated[index], amountStr: (rem / 100).toFixed(2) };
    setRows(updated);
    setError(null);
  };

  const handleAddRow = () => {
    const rem = Math.max(0, remainingPence);
    setRows([
      ...rows,
      {
        id: `split_${Date.now()}`,
        categoryId: defaultCat2,
        amountStr: (rem / 100).toFixed(2),
        note: '',
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length <= 2) return;
    setRows(rows.filter((_, idx) => idx !== index));
  };

  const handleEqualSplit = () => {
    const count = rows.length;
    const base = Math.floor(totalAbsPence / count);
    const remainder = totalAbsPence - base * count;

    setRows(
      rows.map((r, idx) => ({
        ...r,
        amountStr: ((base + (idx === 0 ? remainder : 0)) / 100).toFixed(2),
      }))
    );
    setError(null);
  };

  const handleSubmit = async () => {
    if (!isBalanced) {
      setError('Split amounts must add up to the exact transaction total.');
      return;
    }

    const splitsPayload = rows
      .map((r) => ({
        categoryId: r.categoryId,
        amountInPence: Math.abs(parseToPence(r.amountStr)),
        note: r.note.trim(),
      }))
      .filter((s) => s.amountInPence > 0);

    if (splitsPayload.length < 2) {
      setError('At least 2 non-zero split lines are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const data = await splitLocalTransaction({
        transactionId: transaction.id,
        splits: splitsPayload,
      });

      onSplitSuccess(transaction.id, data.splits || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error splitting transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Split className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Split Transaction</h3>
              <p className="text-[11px] text-zinc-400 truncate max-w-[210px]">
                {transaction.cleanMerchant || transaction.rawDescription}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white">
              {formatCurrency(transaction.amount)}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Presets & Balance Status Bar */}
        <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-xs">
          <div>
            {isBalanced ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> £0.00 remaining (Balanced)
              </span>
            ) : remainingPence > 0 ? (
              <span className="text-amber-400 font-semibold">
                {formatCurrency(remainingPence)} left to assign
              </span>
            ) : (
              <span className="text-rose-400 font-semibold">
                {formatCurrency(Math.abs(remainingPence))} over total
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleEqualSplit}
            className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-lg"
          >
            <Wand2 className="w-3 h-3" /> Split Equally
          </button>
        </div>

        {/* Split Lines */}
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Part {idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  {!isBalanced && (
                    <button
                      type="button"
                      onClick={() => handleFillRemainder(idx)}
                      className="text-[10px] text-sky-400 hover:underline"
                    >
                      Fill remainder
                    </button>
                  )}
                  {rows.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* Category Select */}
                <div className="col-span-2">
                  <select
                    value={row.categoryId}
                    onChange={(e) => {
                      const updated = [...rows];
                      updated[idx] = { ...updated[idx], categoryId: e.target.value };
                      setRows(updated);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded-xl px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <optgroup label="Expenses">
                      {categories
                        .filter((c) => c.type === 'expenses')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Savings & Investments">
                      {categories
                        .filter((c) => c.type === 'savings')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Income">
                      {categories
                        .filter((c) => c.type === 'income')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                {/* Amount Input */}
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                    £
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.amountStr}
                    onChange={(e) => handleAmountChange(idx, e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-xs font-semibold text-right rounded-xl pl-6 pr-2.5 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Optional Memo / Split Note */}
              <input
                type="text"
                placeholder="Optional note (e.g. Glasgow flat supplies, household...)"
                value={row.note}
                onChange={(e) => {
                  const updated = [...rows];
                  updated[idx] = { ...updated[idx], note: e.target.value };
                  setRows(updated);
                }}
                className="w-full bg-zinc-900/60 border border-zinc-800/60 text-xs rounded-xl px-3 py-1.5 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          ))}
        </div>

        {/* Add Split Line Button */}
        <button
          type="button"
          onClick={handleAddRow}
          className="w-full py-2 px-3 rounded-xl border border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Another Split Part</span>
        </button>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isBalanced || isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Split className="w-3.5 h-3.5" />
                <span>Confirm {rows.length}-Way Split</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

