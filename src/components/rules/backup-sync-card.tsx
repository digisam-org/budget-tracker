'use client';

import { useState, useRef } from 'react';
import {
  Database,
  FileJson,
  FileSpreadsheet,
  HardDriveDownload,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface BackupSyncCardProps {
  defaultYear?: number;
}

export function BackupSyncCard({ defaultYear = 2026 }: BackupSyncCardProps) {
  const [exportYear, setExportYear] = useState<number>(defaultYear);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore snapshot');
      }

      const c = data.restoredCounts;
      setFeedback({
        type: 'success',
        text: `Restored ${c.transactions} transactions, ${c.budgetPlans} plans, ${c.categorizationRules} rules, and ${c.categories} categories.`,
      });
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

  return (
    <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Backup &amp; Bi-directional Sync</h2>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Offline Archive
        </span>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Export a full snapshot to JSON or raw SQLite, or generate an Excel workbook matching your{' '}
        <span className="text-zinc-200 font-medium">Ultimate Personal Budget Extended.xlsx</span>{' '}
        layout (Settings, Budget Planning with live formulas, Budget Tracking, and Monthly Summary).
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

      {/* 1. Excel Workbook Export */}
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

        <a
          href={`/api/backup/export?format=xlsx&year=${exportYear}`}
          download
          className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Download {exportYear} Excel Workbook</span>
        </a>
      </div>

      {/* 2. Database Snapshots (JSON & SQLite) */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href="/api/backup/export?format=json"
          download
          className="p-3 rounded-2xl bg-zinc-950/70 hover:bg-zinc-800/80 border border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
        >
          <FileJson className="w-5 h-5 text-sky-400" />
          <span className="text-xs font-semibold text-zinc-200">JSON Snapshot</span>
          <span className="text-[10px] text-zinc-500">Portable &amp; restorable</span>
        </a>

        <a
          href="/api/backup/export?format=sqlite"
          download
          className="p-3 rounded-2xl bg-zinc-950/70 hover:bg-zinc-800/80 border border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
        >
          <HardDriveDownload className="w-5 h-5 text-indigo-400" />
          <span className="text-xs font-semibold text-zinc-200">SQLite (.db)</span>
          <span className="text-[10px] text-zinc-500">Raw database binary</span>
        </a>
      </div>

      {/* 3. Bi-directional Restore from JSON Snapshot */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-zinc-200">Restore / Sync JSON Snapshot</p>
          <p className="text-[11px] text-zinc-400">
            Merge a previous backup back into SQLite without duplicating transactions.
          </p>
        </div>

        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer shrink-0 transition-colors">
          {isRestoring ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          ) : (
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>{isRestoring ? 'Restoring...' : 'Import JSON'}</span>
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
    </div>
  );
}
