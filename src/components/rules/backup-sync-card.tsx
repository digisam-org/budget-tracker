'use client';

import { useState, useRef } from 'react';
import {
  exportLocalJsonSnapshot,
  exportLocalExcelWorkbook,
  restoreLocalJsonSnapshot,
  triggerBrowserDownload,
} from '@/lib/storage/local-services';
import { resetLocalDbToSeed } from '@/lib/storage/local-db';
import {
  Database,
  FileJson,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCcw,
} from 'lucide-react';

interface BackupSyncCardProps {
  defaultYear?: number;
  onRestored?: () => void;
}

export function BackupSyncCard({ defaultYear = 2026, onRestored }: BackupSyncCardProps) {
  const [exportYear, setExportYear] = useState<number>(defaultYear);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const handleExportExcel = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const bytes = await exportLocalExcelWorkbook(exportYear);
      triggerBrowserDownload(
        bytes,
        `Ultimate-Personal-Budget-${exportYear}-${today}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      setFeedback({
        type: 'success',
        text: `Downloaded ${exportYear} Excel archive directly from your device.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Excel export failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const jsonStr = await exportLocalJsonSnapshot();
      triggerBrowserDownload(
        jsonStr,
        `budget-tracker-snapshot-${today}.json`,
        'application/json; charset=utf-8'
      );
      setFeedback({
        type: 'success',
        text: 'Downloaded full JSON snapshot (save to iCloud Drive / Files for safekeeping).',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'JSON export failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setFeedback(null);

    try {
      const rawText = await file.text();
      const c = await restoreLocalJsonSnapshot(rawText);
      setFeedback({
        type: 'success',
        text: `Restored ${c.transactions} transactions, ${c.budgetPlans} plans, ${c.categorizationRules} rules, and ${c.categories} categories.`,
      });
      onRestored?.();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Restore failed',
      });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleResetSeed = async () => {
    if (
      !window.confirm(
        'Reset on-device data back to your initial Ultimate Personal Budget Excel seed? (Export a JSON backup first if you want to keep newer edits.)'
      )
    ) {
      return;
    }
    setIsRestoring(true);
    try {
      await resetLocalDbToSeed();
      setFeedback({ type: 'success', text: 'Device storage reset to initial Excel seed.' });
      onRestored?.();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Reset failed',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">On-Device Backup &amp; Sync</h2>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          100% Local
        </span>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        All your data lives strictly inside your phone&apos;s IndexedDB storage. Export offline
        snapshots to iCloud Drive / Files as JSON or as a 4-sheet Excel workbook matching{' '}
        <span className="text-zinc-200 font-medium">Ultimate Personal Budget Extended.xlsx</span>.
      </p>

      {feedback && (
        <div
          className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 1. Excel Workbook Export (100% Client-Side Offline!) */}
      <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">Excel Workbook Archive (.xlsx)</p>
              <p className="text-[10px] text-zinc-400">
                4 sheets with GBP formatting &amp; live SUM formulas
              </p>
            </div>
          </div>

          <input
            type="number"
            min={2020}
            max={2100}
            value={exportYear}
            onChange={(e) => {
              const y = parseInt(e.target.value, 10);
              if (!Number.isNaN(y)) setExportYear(y);
            }}
            className="w-16 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1 text-xs font-bold text-center text-white focus:outline-none focus:border-emerald-500"
            aria-label="Excel export year"
          />
        </div>

        <button
          type="button"
          onClick={handleExportExcel}
          disabled={isExporting}
          className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-3.5 h-3.5" />
          )}
          <span>Download {exportYear} Excel Workbook</span>
        </button>
      </div>

      {/* 2. JSON Snapshot & Restore */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExportJson}
          disabled={isExporting}
          className="p-3 rounded-2xl bg-zinc-950/70 hover:bg-zinc-800/80 border border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-center transition-colors disabled:opacity-50"
        >
          <FileJson className="w-5 h-5 text-sky-400" />
          <span className="text-xs font-semibold text-zinc-200">Export JSON</span>
          <span className="text-[10px] text-zinc-500">Save to Files / iCloud</span>
        </button>

        <label className="p-3 rounded-2xl bg-zinc-950/70 hover:bg-zinc-800/80 border border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-colors">
          {isRestoring ? (
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          ) : (
            <Upload className="w-5 h-5 text-emerald-400" />
          )}
          <span className="text-xs font-semibold text-zinc-200">
            {isRestoring ? 'Restoring...' : 'Restore JSON'}
          </span>
          <span className="text-[10px] text-zinc-500">Merge snapshot cleanly</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRestoreFile}
            disabled={isRestoring}
            className="hidden"
          />
        </label>
      </div>

      {/* 3. Reset to Initial Seed */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3">
        <span className="text-[11px] text-zinc-500">
          Need a fresh start from your initial Excel workbook?
        </span>
        <button
          type="button"
          onClick={handleResetSeed}
          disabled={isRestoring}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-rose-400 text-[11px] font-medium shrink-0 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Seed</span>
        </button>
      </div>
    </div>
  );
}
