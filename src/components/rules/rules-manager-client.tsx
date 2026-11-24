'use client';

import { useState, useMemo } from 'react';
import { CategorizationRule, Category, AppSettings } from '@/lib/db/schema';
import { matchRule } from '@/lib/classifier/rules-engine';
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  Sparkles,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  SlidersHorizontal,
  Play,
  X,
} from 'lucide-react';

interface RulesManagerClientProps {
  initialRules: CategorizationRule[];
  categories: Category[];
  initialSettings: AppSettings;
  pendingCount: number;
}

export function RulesManagerClient({
  initialRules,
  categories,
  initialSettings,
  pendingCount: initialPendingCount,
}: RulesManagerClientProps) {
  const [rules, setRules] = useState<CategorizationRule[]>(initialRules);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [pendingCount, setPendingCount] = useState<number>(initialPendingCount);

  // Filter & Tester state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [testInput, setTestInput] = useState('');

  // Add / Edit Rule form state
  const [showForm, setShowForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [patternType, setPatternType] = useState<'contains' | 'regex' | 'exact'>('contains');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [cleanMerchant, setCleanMerchant] = useState('');
  const [priority, setPriority] = useState('10');

  // Async action states
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  // Live rule tester result
  const liveTestMatch = useMemo(() => {
    if (!testInput.trim()) return null;
    return matchRule(testInput.trim(), rules);
  }, [testInput, rules]);

  const filteredRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rules.filter((r) => {
      if (filterCategoryId && r.categoryId !== filterCategoryId) return false;
      if (!q) return true;
      const catName = catMap.get(r.categoryId)?.name.toLowerCase() || '';
      return (
        r.pattern.toLowerCase().includes(q) ||
        (r.cleanMerchant || '').toLowerCase().includes(q) ||
        catName.includes(q)
      );
    });
  }, [rules, searchQuery, filterCategoryId, catMap]);

  const resetForm = () => {
    setEditingRuleId(null);
    setPattern('');
    setPatternType('contains');
    setCategoryId(categories[0]?.id || '');
    setCleanMerchant('');
    setPriority('10');
    setShowForm(false);
  };

  const openEditForm = (rule: CategorizationRule) => {
    setEditingRuleId(rule.id);
    setPattern(rule.pattern);
    setPatternType(rule.patternType);
    setCategoryId(rule.categoryId);
    setCleanMerchant(rule.cleanMerchant || '');
    setPriority(String(rule.priority));
    setShowForm(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim() || !categoryId) return;

    setIsSavingRule(true);
    setBanner(null);

    try {
      const payload = {
        id: editingRuleId || undefined,
        pattern: pattern.trim(),
        patternType,
        categoryId,
        cleanMerchant: cleanMerchant.trim() || null,
        priority: Number.parseInt(priority, 10) || 10,
      };

      const res = await fetch('/api/rules', {
        method: editingRuleId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save rule');
      }

      if (editingRuleId) {
        setRules((prev) =>
          prev
            .map((r) => (r.id === editingRuleId ? data.rule : r))
            .sort((a, b) => b.priority - a.priority)
        );
        setBanner({ type: 'success', text: `Updated rule "${data.rule.pattern}".` });
      } else {
        setRules((prev) =>
          [data.rule, ...prev].sort((a, b) => b.priority - a.priority)
        );
        setBanner({ type: 'success', text: `Created rule "${data.rule.pattern}".` });
      }
      resetForm();
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save rule',
      });
    } finally {
      setIsSavingRule(false);
    }
  };

  const handleDeleteRule = async (id: string, rulePattern: string) => {
    setBanner(null);
    try {
      const res = await fetch(`/api/rules?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete rule');
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      setBanner({ type: 'success', text: `Deleted rule "${rulePattern}".` });
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not delete rule',
      });
    }
  };

  const handleApplyRulesToPending = async () => {
    setIsApplyingRules(true);
    setBanner(null);

    try {
      const res = await fetch('/api/rules/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApprove: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply rules');
      }

      setPendingCount((prev) => Math.max(0, prev - (data.autoReviewedCount || 0)));
      setBanner({
        type: 'success',
        text: `Scanned ${data.scannedCount} pending items — ${data.matchedCount} matched rules & ${data.autoReviewedCount} auto-approved!`,
      });
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to apply rules',
      });
    } finally {
      setIsApplyingRules(false);
    }
  };

  const handleUpdateSettings = async (patch: Partial<AppSettings>) => {
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    setIsSavingSettings(true);
    setBanner(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }
      if (data.settings) {
        setSettings(data.settings);
      }
      setBanner({ type: 'success', text: 'Budget engine settings saved.' });
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {banner && (
        <div
          className={`px-3.5 py-2.5 rounded-2xl border text-xs flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            {banner.text}
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="opacity-70 hover:opacity-100 ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Live Rule Tester */}
      <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
            <FlaskConical className="w-4 h-4 text-emerald-400" />
            Live Rule Tester
          </span>
          <span className="text-[10px] text-zinc-500">
            Tests against {rules.length} active rule{rules.length === 1 ? '' : 's'}
          </span>
        </div>

        <input
          type="text"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder="Paste raw bank text (e.g. TESCO STORES 2918 EDINBURGH)"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
        />

        {testInput.trim() && (
          <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-xs">
            {liveTestMatch ? (
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Rule Matched ({liveTestMatch.confidence}% confidence)
                  </p>
                  <p className="text-zinc-300">
                    Category:{' '}
                    <strong className="text-white">
                      {catMap.get(liveTestMatch.categoryId)?.name || liveTestMatch.categoryId}
                    </strong>
                    {liveTestMatch.cleanMerchant && (
                      <>
                        {' • '}Merchant:{' '}
                        <strong className="text-white">{liveTestMatch.cleanMerchant}</strong>
                      </>
                    )}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold shrink-0">
                  Auto-Approved
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>No deterministic rule matched — will use LLM / Smart Match fallback.</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleId(null);
                    setPattern(testInput.trim().slice(0, 24));
                    setShowForm(true);
                  }}
                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 shrink-0"
                >
                  + Create Rule
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Merchant Rules Header & Actions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">
            Learned Merchant Rules ({rules.length})
          </h2>

          <div className="flex items-center gap-1.5">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={handleApplyRulesToPending}
                disabled={isApplyingRules}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[11px] font-semibold transition-colors disabled:opacity-50"
              >
                {isApplyingRules ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                <span>Apply to {pendingCount} Pending</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (showForm) {
                  resetForm();
                } else {
                  setShowForm(true);
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[11px] font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Rule</span>
            </button>
          </div>
        </div>

        {/* Create / Edit Rule Form */}
        {showForm && (
          <form
            onSubmit={handleSaveRule}
            className="p-4 rounded-3xl bg-zinc-900 border border-emerald-500/30 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">
                {editingRuleId ? 'Edit Merchant Rule' : 'Add New Merchant Rule'}
              </span>
              <button
                type="button"
                onClick={resetForm}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] text-zinc-400">Match Pattern</label>
                <input
                  type="text"
                  required
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="e.g. TESCO or ^SQ \*"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">Match Type</label>
                <select
                  value={patternType}
                  onChange={(e) =>
                    setPatternType(e.target.value as 'contains' | 'regex' | 'exact')
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exact</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400">Target Category</label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.type.toUpperCase()}] {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] text-zinc-400">
                  Clean Merchant Name (optional)
                </label>
                <input
                  type="text"
                  value={cleanMerchant}
                  onChange={(e) => setCleanMerchant(e.target.value)}
                  placeholder="e.g. Tesco"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">Priority</label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white text-right focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingRule}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingRule && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editingRuleId ? 'Save Changes' : 'Create Rule'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Search & Category Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patterns or merchants..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <select
            value={filterCategoryId}
            onChange={(e) => setFilterCategoryId(e.target.value)}
            className="w-36 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Rule Cards */}
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {filteredRules.length === 0 ? (
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center text-xs text-zinc-500">
              No matching merchant rules found.
            </div>
          ) : (
            filteredRules.map((rule) => {
              const cat = catMap.get(rule.categoryId);
              return (
                <div
                  key={rule.id}
                  className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono font-bold text-white truncate">
                        {rule.pattern}
                      </span>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {rule.patternType}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        P{rule.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span
                        className={`font-semibold ${
                          cat?.type === 'income'
                            ? 'text-emerald-400'
                            : cat?.type === 'savings'
                            ? 'text-sky-400'
                            : 'text-rose-300'
                        }`}
                      >
                        {cat?.name || rule.categoryId}
                      </span>
                      {rule.cleanMerchant && (
                        <>
                          <span className="text-zinc-600">→</span>
                          <span className="text-zinc-300 truncate">{rule.cleanMerchant}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditForm(rule)}
                      className="p-2 rounded-xl text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
                      title="Edit rule"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id, rule.pattern)}
                      className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                      title="Delete rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Zero-Based Budget Engine Settings */}
      <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Budget Engine Settings</h2>
          </div>
          {isSavingSettings && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          )}
        </div>

        {/* Shift Late Income Toggle */}
        <div className="flex items-start justify-between gap-3 pt-1 border-t border-zinc-800/80">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-zinc-200">
              Shift Late-Month Income to Next Month
            </p>
            <p className="text-[11px] text-zinc-400">
              Salary received on or after the cutoff day funds next month&apos;s zero-based budget.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              handleUpdateSettings({ shiftLateIncome: !settings.shiftLateIncome })
            }
            className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
              settings.shiftLateIncome ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
            aria-label="Toggle shift late income"
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                settings.shiftLateIncome ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {settings.shiftLateIncome && (
          <div className="flex items-center justify-between gap-3 bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800">
            <span className="text-xs text-zinc-300">Late Income Cutoff Day (1–28)</span>
            <input
              type="number"
              min={1}
              max={28}
              value={settings.lateIncomeDay}
              onChange={(e) => {
                const day = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(day) && day >= 1 && day <= 28) {
                  handleUpdateSettings({ lateIncomeDay: day });
                }
              }}
              className="w-16 bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1 text-xs font-bold text-right text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {/* Savings Rate Mode Toggle */}
        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-zinc-200">Savings Rate Formula</p>
            <p className="text-[11px] text-zinc-400">
              Choose how your monthly savings rate KPI is calculated.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleUpdateSettings({ savingsRateType: 'active' })}
              className={`p-2.5 rounded-2xl border text-left transition-all ${
                settings.savingsRateType === 'active'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <p className="text-xs font-bold">Active</p>
              <p className="text-[10px] opacity-80">Savings ÷ Income</p>
            </button>
            <button
              type="button"
              onClick={() => handleUpdateSettings({ savingsRateType: 'passive' })}
              className={`p-2.5 rounded-2xl border text-left transition-all ${
                settings.savingsRateType === 'passive'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <p className="text-xs font-bold">Passive</p>
              <p className="text-[10px] opacity-80">(Income − Expenses) ÷ Income</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
