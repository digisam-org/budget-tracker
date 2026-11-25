'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { parseToPence } from '@/lib/utils';
import { loadAppData, ingestLocalData, StagedPreviewRow } from '@/lib/storage/local-services';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  Camera,
  ShieldCheck,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  ClipboardPaste,
  ArrowLeftRight,
  Eye,
} from 'lucide-react';

interface AccountOption {
  id: string;
  name: string;
  type: string;
}

interface CategoryOption {
  id: string;
  name: string;
  type: 'income' | 'expenses' | 'savings';
}

interface StagedRowUI {
  tempId: string;
  selected: boolean;
  date: string;
  amountStr: string;
  isPositive: boolean;
  rawDescription: string;
  cleanMerchant: string;
  categoryId: string;
  confidenceScore?: number;
  aiReasoning?: string;
  classificationSource?: string;
  isDuplicate: boolean;
  isTransferCandidate: boolean;
}

interface IngestResult {
  success: boolean;
  batchId: string;
  detectedBank: string;
  confidence: number;
  totalRows: number;
  importedCount: number;
  duplicateCount: number;
}

export default function DropzonePage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('acc_main_checking');
  const [ingestTab, setIngestTab] = useState<'file' | 'paste'>('file');

  const [file, setFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Preview staging state
  const [stagedRows, setStagedRows] = useState<StagedRowUI[] | null>(null);
  const [detectedBank, setDetectedBank] = useState<string>('');
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAppData()
      .then((data) => {
        if (data.accounts.length > 0) {
          setAccounts(data.accounts);
          setSelectedAccount(data.accounts[0].id);
        }
        setCategories(data.categories);
      })
      .catch(() => {});
  }, []);

  const isScreenshotFile = (f: File | null) => {
    if (!f) return false;
    return (
      f.type.startsWith('image/') ||
      /\.(png|jpe?g|webp|heic)$/i.test(f.name)
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const chosen = e.target.files[0];
      setFile(chosen);
      setStagedRows(null);
      setResult(null);
      setError(null);

      if (isScreenshotFile(chosen)) {
        const url = URL.createObjectURL(chosen);
        setImagePreviewUrl(url);
      } else {
        setImagePreviewUrl(null);
      }
    }
  };

  const mapApiRowsToUI = (rows: StagedPreviewRow[]): StagedRowUI[] => {
    return rows.map((r, idx) => ({
      tempId: r.tempId || `row_${idx}_${Date.now()}`,
      selected: !r.isDuplicate,
      date: r.date || new Date().toISOString().split('T')[0],
      amountStr: (Math.abs(r.amount || 0) / 100).toFixed(2),
      isPositive: (r.amount || 0) > 0,
      rawDescription: r.rawDescription || '',
      cleanMerchant: r.cleanMerchant || r.rawDescription || '',
      categoryId: r.categoryId || '',
      confidenceScore: typeof r.confidenceScore === 'number' ? r.confidenceScore : undefined,
      aiReasoning: r.aiReasoning,
      classificationSource: r.classificationSource,
      isDuplicate: Boolean(r.isDuplicate),
      isTransferCandidate: Boolean(r.isTransferCandidate),
    }));
  };

  const handlePreviewExtract = async () => {
    if (!selectedAccount) return;
    if (ingestTab === 'file' && !file) return;
    if (ingestTab === 'paste' && !pastedText.trim()) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const data = await ingestLocalData({
        accountId: selectedAccount,
        mode: 'preview',
        file: ingestTab === 'file' ? file : null,
        rawText: ingestTab === 'paste' ? pastedText : undefined,
      });

      setDetectedBank(data.detectedBank || 'statement');
      const uiRows = mapApiRowsToUI(data.stagedRows || []);
      setStagedRows(uiRows);

      if (uiRows.length === 0) {
        setError(
          'No transactions were automatically detected. You can add rows manually below or try pasting copied text from your banking app.'
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during extraction');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectCsvImport = async () => {
    if (!file || !selectedAccount) return;

    setIsProcessing(true);
    setError(null);

    try {
      const data = await ingestLocalData({
        accountId: selectedAccount,
        mode: 'commit',
        file,
      });

      setResult({
        success: data.success,
        batchId: data.batchId || '',
        detectedBank: data.detectedBank,
        confidence: data.confidence,
        totalRows: data.totalRows,
        importedCount: data.importedCount ?? 0,
        duplicateCount: data.duplicateCount,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitStaged = async () => {
    if (!stagedRows || !selectedAccount) return;
    const selectedRows = stagedRows.filter((r) => r.selected);
    if (selectedRows.length === 0) {
      setError('Please select at least one transaction to import.');
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      const payloadRows = selectedRows.map((r) => {
        const absPence = Math.abs(parseToPence(r.amountStr || '0'));
        const signedPence = r.isPositive ? absPence : -absPence;
        return {
          date: r.date,
          amount: signedPence,
          rawDescription: r.rawDescription || r.cleanMerchant,
          cleanMerchant: r.cleanMerchant || r.rawDescription,
          categoryId: r.categoryId || null,
          isTransferCandidate: r.isTransferCandidate,
        };
      });

      const data = await ingestLocalData({
        accountId: selectedAccount,
        mode: 'commit',
        manualRows: payloadRows,
      });

      setResult({
        success: data.success,
        batchId: data.batchId || '',
        detectedBank: data.detectedBank,
        confidence: data.confidence,
        totalRows: data.totalRows,
        importedCount: data.importedCount ?? 0,
        duplicateCount: data.duplicateCount,
      });
      setStagedRows(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to commit transactions');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleAddBlankStagedRow = () => {
    const today = '2026-09-15';
    setStagedRows((prev) => [
      ...(prev || []),
      {
        tempId: `manual_${Date.now()}`,
        selected: true,
        date: today,
        amountStr: '0.00',
        isPositive: false,
        rawDescription: 'Manual Entry',
        cleanMerchant: '',
        categoryId: categories[0]?.id || '',
        isDuplicate: false,
        isTransferCandidate: false,
      },
    ]);
  };

  const loadSampleMidMonthFeed = () => {
    setIngestTab('paste');
    setPastedText(
      [
        '14 Sep 2026',
        "Sainsbury's Supermarkets   -£118.40",
        'Octopus Energy   -£34.36',
        '15 Sep 2026',
        'TfL Travel Charge   -£8.50',
        'Deliveroo   -£24.90',
        'Rent from Glasgow Flat   +£876.00',
      ].join('\n')
    );
    setStagedRows(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Frictionless Dropzone
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Upload end-of-month CSV statements or mid-month banking app screenshots. Automatically extracts, deduplicates, and categorizes your spend.
        </p>
      </div>

      {/* Target Account Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Target Account
        </label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({acc.type.replace('_', ' ')})
            </option>
          ))}
        </select>
      </div>

      {/* Mode Tabs: File/Screenshot Upload vs Paste Feed */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-zinc-900 border border-zinc-800">
        <button
          type="button"
          onClick={() => {
            setIngestTab('file');
            setError(null);
          }}
          className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            ingestTab === 'file'
              ? 'bg-emerald-500 text-zinc-950 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>CSV or Screenshot</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIngestTab('paste');
            setError(null);
          }}
          className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            ingestTab === 'paste'
              ? 'bg-emerald-500 text-zinc-950 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>Paste App Feed</span>
        </button>
      </div>

      {/* Tab 1: File / Screenshot Dropzone */}
      {ingestTab === 'file' && (
        <div className="space-y-4">
          <div
            className={`relative border-2 border-dashed rounded-3xl p-7 text-center transition-all duration-200 ${
              file
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/30'
            }`}
          >
            <input
              type="file"
              accept=".csv,.ofx,image/png,image/jpeg,image/webp,image/heic"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
              {imagePreviewUrl ? (
                <div className="w-24 h-32 rounded-2xl overflow-hidden border border-zinc-700 shadow-lg bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreviewUrl}
                    alt="Screenshot preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-zinc-800/80 text-emerald-400 flex items-center gap-2">
                  {file ? (
                    <FileSpreadsheet className="w-7 h-7" />
                  ) : (
                    <>
                      <UploadCloud className="w-7 h-7" />
                      <Camera className="w-6 h-6 text-sky-400" />
                    </>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-zinc-200">
                  {file
                    ? file.name
                    : 'Tap to upload Bank CSV or App Screenshot'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Supports PNG/JPG banking screenshots (Mid-month) & Monzo, Barclays, HSBC, Starling, Amex CSVs
                </p>
              </div>
            </div>
          </div>

          {file && !stagedRows && !result && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePreviewExtract}
                disabled={isProcessing}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {isScreenshotFile(file)
                        ? 'Running Vision OCR on Screenshot...'
                        : 'Analyzing Statement...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    <span>
                      {isScreenshotFile(file)
                        ? 'Extract & Verify Screenshot'
                        : 'Preview & Verify Rows'}
                    </span>
                  </>
                )}
              </button>

              {!isScreenshotFile(file) && (
                <button
                  type="button"
                  onClick={handleDirectCsvImport}
                  disabled={isProcessing}
                  className="py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>1-Tap Import</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Paste App Text / Sample Feed */}
      {ingestTab === 'paste' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Paste copied lines from your banking app or OCR text:
            </span>
            <button
              type="button"
              onClick={loadSampleMidMonthFeed}
              className="text-xs text-emerald-400 hover:underline font-medium"
            >
              Load sample mid-month feed
            </button>
          </div>

          <textarea
            rows={6}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={`Example:\n14 Sep 2026\nSainsbury's Supermarkets  -£118.40\nOctopus Energy  -£34.36`}
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 p-3.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />

          {pastedText.trim().length > 0 && !stagedRows && (
            <button
              type="button"
              onClick={handlePreviewExtract}
              disabled={isProcessing}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Parsing transactions...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Parse & Preview Transactions</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Interactive Staging & Verification Table */}
      {stagedRows && (
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div>
              <h2 className="text-sm font-bold text-white">
                Verify Extracted Transactions ({stagedRows.filter((r) => r.selected).length} selected)
              </h2>
              <p className="text-[11px] text-zinc-400">
                Review or tweak extracted amounts and categories before committing.
              </p>
            </div>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              {detectedBank}
            </span>
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {stagedRows.map((row, idx) => (
              <div
                key={row.tempId}
                className={`p-3 rounded-2xl border space-y-2 transition-colors ${
                  row.selected
                    ? 'bg-zinc-950/70 border-zinc-800'
                    : 'bg-zinc-950/30 border-zinc-900 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) => {
                        const updated = [...stagedRows];
                        updated[idx] = { ...updated[idx], selected: e.target.checked };
                        setStagedRows(updated);
                      }}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-800"
                    />
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => {
                        const updated = [...stagedRows];
                        updated[idx] = { ...updated[idx], date: e.target.value };
                        setStagedRows(updated);
                      }}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-0.5 text-[11px] font-mono text-zinc-300"
                    />
                  </label>

                  <div className="flex items-center gap-1.5">
                    {typeof row.confidenceScore === 'number' && row.confidenceScore > 0 && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          row.confidenceScore >= 85
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`}
                        title={row.aiReasoning || 'AI confidence score'}
                      >
                        {row.confidenceScore}%{' '}
                        {row.classificationSource === 'rule'
                          ? 'Rule'
                          : row.classificationSource === 'gemini_llm' ||
                            row.classificationSource === 'openai_llm'
                          ? 'AI'
                          : 'Smart'}
                      </span>
                    )}
                    {row.isDuplicate && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Duplicate (Skipped)
                      </span>
                    )}
                    {row.isTransferCandidate && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        <ArrowLeftRight className="w-2.5 h-2.5" /> Transfer
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setStagedRows(stagedRows.filter((_, i) => i !== idx))
                      }
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Merchant & Amount Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.cleanMerchant}
                    onChange={(e) => {
                      const updated = [...stagedRows];
                      updated[idx] = {
                        ...updated[idx],
                        cleanMerchant: e.target.value,
                        rawDescription: e.target.value,
                      };
                      setStagedRows(updated);
                    }}
                    placeholder="Merchant or description"
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-emerald-500"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...stagedRows];
                      updated[idx] = {
                        ...updated[idx],
                        isPositive: !updated[idx].isPositive,
                      };
                      setStagedRows(updated);
                    }}
                    className={`px-2 py-1.5 rounded-xl text-xs font-bold border ${
                      row.isPositive
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                    }`}
                    title="Toggle Outflow (-) vs Inflow (+)"
                  >
                    {row.isPositive ? '+£' : '-£'}
                  </button>

                  <input
                    type="number"
                    step="0.01"
                    value={row.amountStr}
                    onChange={(e) => {
                      const updated = [...stagedRows];
                      updated[idx] = { ...updated[idx], amountStr: e.target.value };
                      setStagedRows(updated);
                    }}
                    className="w-20 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs font-bold text-right text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Category Select */}
                <select
                  value={row.categoryId}
                  onChange={(e) => {
                    const updated = [...stagedRows];
                    updated[idx] = { ...updated[idx], categoryId: e.target.value };
                    setStagedRows(updated);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded-xl px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">— Needs Review in Queue —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.type.toUpperCase()}] {c.name}
                    </option>
                  ))}
                </select>

                {row.aiReasoning && (
                  <p className="text-[10px] text-zinc-500 px-1">
                    💡 {row.aiReasoning}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Add manual row button */}
          <button
            type="button"
            onClick={handleAddBlankStagedRow}
            className="w-full py-2 px-3 rounded-xl border border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-medium flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Missing Transaction Row</span>
          </button>

          {/* Commit Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStagedRows(null)}
              className="py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCommitStaged}
              disabled={isCommitting || stagedRows.filter((r) => r.selected).length === 0}
              className="flex-1 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving to Ledger...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Commit {stagedRows.filter((r) => r.selected).length} Transactions
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Ingestion Results Summary Card */}
      {result && (
        <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Ingestion Complete</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
              {result.detectedBank}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/60">
              <span className="text-xs text-zinc-400">Total Rows</span>
              <p className="text-lg font-bold text-white mt-1">{result.totalRows}</p>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xs text-emerald-400">Imported</span>
              <p className="text-lg font-bold text-emerald-300 mt-1">{result.importedCount}</p>
            </div>
            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/60">
              <span className="text-xs text-zinc-400">Duplicates Skipped</span>
              <p className="text-lg font-bold text-zinc-400 mt-1">{result.duplicateCount}</p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-zinc-950/40 border border-zinc-800/40 text-xs text-zinc-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Fingerprinted with SHA-256. Any mid-month screenshot entries will automatically deduplicate when you upload your end-of-month CSV!
            </span>
          </div>

          <div className="flex gap-2">
            <Link
              href="/review"
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors"
            >
              <span>Review Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/transactions"
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-white font-medium text-xs transition-colors"
            >
              <span>View Ledger</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
