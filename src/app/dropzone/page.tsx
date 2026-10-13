'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  FileSpreadsheet, 
  ShieldCheck, 
  Sparkles,
  Loader2
} from 'lucide-react';

interface AccountOption {
  id: string;
  name: string;
  type: string;
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
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load accounts on mount
  useEffect(() => {
    fetch('/api/accounts')
      .then((res) => res.json())
      .then((data) => {
        if (data.accounts && data.accounts.length > 0) {
          setAccounts(data.accounts);
          setSelectedAccount(data.accounts[0].id);
        }
      })
      .catch(() => {
        // Fallback accounts if endpoint is loading
        setAccounts([
          { id: 'acc_main_checking', name: 'Main Current Account', type: 'checking' },
          { id: 'acc_rental', name: 'Rental Property Account', type: 'rental' },
          { id: 'acc_credit_card', name: 'Rewards Credit Card', type: 'credit_card' },
          { id: 'acc_isa', name: 'Stocks & Shares ISA', type: 'investment' },
        ]);
        setSelectedAccount('acc_main_checking');
      });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedAccount) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('accountId', selectedAccount);

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to ingest statement');
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during upload');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Frictionless Dropzone</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Drop raw bank statement CSV exports. The engine will auto-detect your bank, deduplicate overlapping rows, and run auto-categorization.
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

      {/* Dropzone Box */}
      <div
        className={`relative border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-200 ${
          file
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/30'
        }`}
      >
        <input
          type="file"
          accept=".csv,.ofx"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
          <div className="p-3.5 rounded-2xl bg-zinc-800/80 text-emerald-400">
            {file ? <FileSpreadsheet className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-200">
              {file ? file.name : 'Tap to browse or drop CSV statement'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Supports Monzo, Barclays, HSBC, Starling, Amex, Lloyds, & generic CSVs
            </p>
          </div>
        </div>
      </div>

      {/* Upload Action Button */}
      {file && !result && (
        <button
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Parsing, Deduplicating & Classifying...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Process Statement</span>
            </>
          )}
        </button>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
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
              {result.detectedBank} format
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
            <span>Fingerprinted with SHA-256 to prevent duplicate charges across overlapping exports.</span>
          </div>

          <Link
            href="/review"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-white font-medium text-xs transition-colors"
          >
            <span>Go to Staging & Review Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
