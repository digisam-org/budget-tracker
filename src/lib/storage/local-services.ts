import Papa from 'papaparse';
import {
  AppSettings,
  Account,
  Category,
  BudgetPlan,
  Transaction,
  CategorizationRule,
  ImportBatch,
} from '@/lib/types';
import {
  ensureLocalDbSeeded,
  getAllFromStore,
  getById,
  putItem,
  putMany,
  deleteById,
} from './local-db';
import { detectBankFormat } from '@/lib/ingestion/detector';
import { normalizeBankRow, NormalizedTransaction } from '@/lib/ingestion/normalizer';
import {
  parseBankScreenshotText,
  extractTransactionsWithGeminiVision,
} from '@/lib/ingestion/screenshot-parser';
import { generateFingerprint } from '@/lib/ingestion/fingerprint';
import { matchRule } from '@/lib/classifier/rules-engine';
import { findTransferPairs, CandidateTransaction } from '@/lib/classifier/transfer-matcher';
import {
  classifyTransactionsBatchWithLLM,
  ClassificationInputItem,
} from '@/lib/classifier/llm-classifier';
import { buildUltimateBudgetWorkbook } from '@/lib/backup/xlsx-builder';

const GEMINI_KEY_STORAGE = 'budget_tracker_gemini_api_key';

export function getLocalGeminiKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(GEMINI_KEY_STORAGE) || '';
}

export function setLocalGeminiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (trimmed) {
    window.localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
  } else {
    window.localStorage.removeItem(GEMINI_KEY_STORAGE);
  }
}

export interface LocalAppData {
  settings: AppSettings;
  accounts: Account[];
  categories: Category[];
  plans: BudgetPlan[];
  transactions: Transaction[];
  rules: CategorizationRule[];
  batches: ImportBatch[];
}

export async function loadAppData(): Promise<LocalAppData> {
  await ensureLocalDbSeeded();

  const [settingsList, accounts, categories, plans, transactions, rules, batches] =
    await Promise.all([
      getAllFromStore('appSettings'),
      getAllFromStore('accounts'),
      getAllFromStore('categories'),
      getAllFromStore('budgetPlans'),
      getAllFromStore('transactions'),
      getAllFromStore('categorizationRules'),
      getAllFromStore('importBatches'),
    ]);

  const settings: AppSettings = settingsList[0] || {
    id: 'default',
    startingYear: 2026,
    shiftLateIncome: false,
    lateIncomeDay: 20,
    savingsRateType: 'active',
    updatedAt: new Date().toISOString(),
  };

  categories.sort((a, b) => a.sortOrder - b.sortOrder);
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  rules.sort((a, b) => b.priority - a.priority);

  return {
    settings,
    accounts,
    categories,
    plans,
    transactions,
    rules,
    batches,
  };
}

// ---- Settings ----

export async function updateLocalSettings(
  patch: Partial<Pick<AppSettings, 'startingYear' | 'shiftLateIncome' | 'lateIncomeDay' | 'savingsRateType'>>
): Promise<AppSettings> {
  await ensureLocalDbSeeded();
  const existing = await getById('appSettings', 'default');

  const updated: AppSettings = {
    id: 'default',
    startingYear:
      typeof patch.startingYear === 'number' && patch.startingYear >= 2000 && patch.startingYear <= 2100
        ? patch.startingYear
        : existing?.startingYear ?? 2026,
    shiftLateIncome:
      typeof patch.shiftLateIncome === 'boolean'
        ? patch.shiftLateIncome
        : existing?.shiftLateIncome ?? false,
    lateIncomeDay:
      typeof patch.lateIncomeDay === 'number' && patch.lateIncomeDay >= 1 && patch.lateIncomeDay <= 28
        ? patch.lateIncomeDay
        : existing?.lateIncomeDay ?? 20,
    savingsRateType:
      patch.savingsRateType === 'active' || patch.savingsRateType === 'passive'
        ? patch.savingsRateType
        : existing?.savingsRateType ?? 'active',
    updatedAt: new Date().toISOString(),
  };

  await putItem('appSettings', updated);
  return updated;
}

// ---- Budget Plans ----

export async function saveLocalBudgetPlan(params: {
  year: number;
  month: number;
  categoryId: string;
  plannedAmount: number;
}): Promise<BudgetPlan> {
  await ensureLocalDbSeeded();
  const plan: BudgetPlan = {
    id: `plan_${params.year}_${params.month}_${params.categoryId}`,
    year: params.year,
    month: params.month,
    categoryId: params.categoryId,
    plannedAmount: params.plannedAmount,
    notes: null,
  };
  await putItem('budgetPlans', plan);
  return plan;
}

export async function copyLocalBudgetPlans(params: {
  sourceYear?: number;
  sourceMonth?: number;
  targetYear: number;
  targetMonths: number[];
  overrides?: Array<{ categoryId: string; plannedAmount: number }>;
}): Promise<{ upsertedCount: number; plans: BudgetPlan[] }> {
  await ensureLocalDbSeeded();
  const existingPlans = await getAllFromStore('budgetPlans');

  let entries: Array<{ categoryId: string; plannedAmount: number }> = [];
  if (Array.isArray(params.overrides) && params.overrides.length > 0) {
    entries = params.overrides;
  } else if (params.sourceYear && params.sourceMonth) {
    entries = existingPlans
      .filter((p) => p.year === params.sourceYear && p.month === params.sourceMonth)
      .map((p) => ({ categoryId: p.categoryId, plannedAmount: p.plannedAmount }));
  }

  if (entries.length === 0) {
    throw new Error('No planned allocations found in the source month to copy.');
  }

  const toWrite: BudgetPlan[] = [];
  for (const month of params.targetMonths) {
    if (month < 1 || month > 12) continue;
    for (const entry of entries) {
      toWrite.push({
        id: `plan_${params.targetYear}_${month}_${entry.categoryId}`,
        year: params.targetYear,
        month,
        categoryId: entry.categoryId,
        plannedAmount: entry.plannedAmount,
        notes: null,
      });
    }
  }

  await putMany('budgetPlans', toWrite);
  const allPlans = await getAllFromStore('budgetPlans');
  return { upsertedCount: toWrite.length, plans: allPlans };
}

// ---- Categorization Rules ----

export async function createLocalRule(params: {
  pattern: string;
  patternType: 'contains' | 'regex' | 'exact';
  categoryId: string;
  cleanMerchant?: string | null;
  priority?: number;
}): Promise<CategorizationRule> {
  await ensureLocalDbSeeded();
  const trimmed = params.pattern.trim();
  if (!trimmed || !params.categoryId) {
    throw new Error('Pattern and category are required.');
  }
  if (params.patternType === 'regex') {
    try {
      new RegExp(trimmed, 'i');
    } catch {
      throw new Error('Invalid regular expression pattern.');
    }
  }

  const rule: CategorizationRule = {
    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    pattern: trimmed,
    patternType: params.patternType,
    categoryId: params.categoryId,
    cleanMerchant: params.cleanMerchant?.trim() || null,
    priority: typeof params.priority === 'number' && !Number.isNaN(params.priority) ? params.priority : 10,
  };

  await putItem('categorizationRules', rule);
  return rule;
}

export async function updateLocalRule(params: {
  id: string;
  pattern?: string;
  patternType?: 'contains' | 'regex' | 'exact';
  categoryId?: string;
  cleanMerchant?: string | null;
  priority?: number;
}): Promise<CategorizationRule> {
  await ensureLocalDbSeeded();
  const existing = await getById('categorizationRules', params.id);
  if (!existing) throw new Error('Rule not found.');

  const nextPattern = params.pattern !== undefined ? params.pattern.trim() : existing.pattern;
  const nextType = params.patternType || existing.patternType;
  if (!nextPattern) throw new Error('Pattern cannot be empty.');

  if (nextType === 'regex') {
    try {
      new RegExp(nextPattern, 'i');
    } catch {
      throw new Error('Invalid regular expression pattern.');
    }
  }

  const updated: CategorizationRule = {
    id: existing.id,
    pattern: nextPattern,
    patternType: nextType,
    categoryId: params.categoryId || existing.categoryId,
    cleanMerchant:
      params.cleanMerchant !== undefined
        ? params.cleanMerchant?.trim() || null
        : existing.cleanMerchant,
    priority:
      typeof params.priority === 'number' && !Number.isNaN(params.priority)
        ? params.priority
        : existing.priority,
  };

  await putItem('categorizationRules', updated);
  return updated;
}

export async function deleteLocalRule(id: string): Promise<void> {
  await ensureLocalDbSeeded();
  await deleteById('categorizationRules', id);
}

export async function applyLocalRulesToPending(autoApprove: boolean = true): Promise<{
  scannedCount: number;
  matchedCount: number;
  autoReviewedCount: number;
}> {
  await ensureLocalDbSeeded();
  const [allRules, allCategories, allTransactions] = await Promise.all([
    getAllFromStore('categorizationRules'),
    getAllFromStore('categories'),
    getAllFromStore('transactions'),
  ]);

  const catMap = new Map(allCategories.map((c) => [c.id, c]));
  const pendingTxs = allTransactions.filter((t) => t.status === 'pending');

  let matchedCount = 0;
  let autoReviewedCount = 0;
  const toUpdate: Transaction[] = [];

  for (const tx of pendingTxs) {
    const matched = matchRule(tx.rawDescription, allRules);
    if (!matched) continue;

    matchedCount++;
    const cat = catMap.get(matched.categoryId);
    const newStatus: 'reviewed' | 'pending' = autoApprove ? 'reviewed' : 'pending';
    if (newStatus === 'reviewed') autoReviewedCount++;

    const existingMeta =
      tx.metadata && typeof tx.metadata === 'object'
        ? (tx.metadata as Record<string, unknown>)
        : {};

    toUpdate.push({
      ...tx,
      categoryId: matched.categoryId,
      cleanMerchant: matched.cleanMerchant || tx.cleanMerchant || tx.rawDescription,
      type: cat?.type || tx.type,
      confidenceScore: matched.confidence,
      status: newStatus,
      metadata: {
        ...existingMeta,
        aiReasoning: `Matched merchant rule (${matched.matchedRuleId})`,
        classificationSource: 'rule',
      },
    });
  }

  await putMany('transactions', toUpdate);

  return {
    scannedCount: pendingTxs.length,
    matchedCount,
    autoReviewedCount,
  };
}

// ---- Review & Split Transactions ----

export async function reviewLocalTransaction(params: {
  transactionId: string;
  categoryId?: string;
  cleanMerchant?: string;
  createRule?: boolean;
  rulePattern?: string;
  status?: 'reviewed' | 'ignored';
}): Promise<Transaction> {
  await ensureLocalDbSeeded();
  const tx = await getById('transactions', params.transactionId);
  if (!tx) throw new Error('Transaction not found.');

  let nextType = tx.type;
  if (params.categoryId) {
    const cat = await getById('categories', params.categoryId);
    if (cat) nextType = cat.type;
  }

  const updated: Transaction = {
    ...tx,
    categoryId: params.categoryId ?? tx.categoryId,
    cleanMerchant: params.cleanMerchant ?? tx.cleanMerchant,
    type: nextType,
    status: params.status || 'reviewed',
  };

  await putItem('transactions', updated);

  if (params.createRule && params.rulePattern && params.categoryId) {
    await createLocalRule({
      pattern: params.rulePattern.trim(),
      patternType: 'contains',
      categoryId: params.categoryId,
      cleanMerchant: params.cleanMerchant || params.rulePattern.trim(),
      priority: 10,
    });
  }

  return updated;
}

export async function splitLocalTransaction(params: {
  transactionId: string;
  splits: Array<{ categoryId: string; amountInPence: number; note?: string }>;
}): Promise<{ parentId: string; splits: Transaction[] }> {
  await ensureLocalDbSeeded();
  const parent = await getById('transactions', params.transactionId);
  if (!parent) throw new Error('Transaction not found.');

  if (!Array.isArray(params.splits) || params.splits.length < 2) {
    throw new Error('At least 2 split rows are required.');
  }

  const totalAbsParent = Math.abs(parent.amount);
  const sumAbsSplits = params.splits.reduce((acc, s) => acc + Math.abs(s.amountInPence), 0);
  if (Math.abs(totalAbsParent - sumAbsSplits) > 1) {
    throw new Error('Split amounts must equal the parent transaction total.');
  }

  const sign = parent.amount < 0 ? -1 : 1;
  const allCategories = await getAllFromStore('categories');
  const catMap = new Map(allCategories.map((c) => [c.id, c]));

  const existingMeta =
    parent.metadata && typeof parent.metadata === 'object'
      ? (parent.metadata as Record<string, unknown>)
      : {};

  // Mark parent as ignored so its SHA-256 fingerprint stays intact against future CSV re-imports
  const updatedParent: Transaction = {
    ...parent,
    status: 'ignored',
    metadata: {
      ...existingMeta,
      isSplitParent: true,
      splitCount: params.splits.length,
    },
  };
  await putItem('transactions', updatedParent);

  const createdSplits: Transaction[] = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < params.splits.length; i++) {
    const part = params.splits[i];
    const signedAmount = sign * Math.abs(part.amountInPence);
    const cat = catMap.get(part.categoryId);
    const splitType: 'income' | 'expenses' | 'savings' =
      cat?.type || (signedAmount > 0 ? 'income' : 'expenses');

    const baseMerchant = parent.cleanMerchant || parent.rawDescription;
    const splitLabel = part.note ? `${baseMerchant} (${part.note})` : `${baseMerchant} [Split ${i + 1}/${params.splits.length}]`;

    const splitFp = generateFingerprint({
      accountId: parent.accountId,
      date: parent.date,
      amount: signedAmount,
      rawDescription: `${parent.rawDescription}__SPLIT_${i + 1}_${Date.now()}`,
    });

    const childTx: Transaction = {
      id: `tx_split_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      fingerprint: splitFp,
      date: parent.date,
      effectiveDate: parent.effectiveDate || parent.date,
      type: splitType,
      amount: signedAmount,
      accountId: parent.accountId,
      categoryId: part.categoryId,
      rawDescription: parent.rawDescription,
      cleanMerchant: splitLabel,
      status: 'reviewed',
      batchId: parent.batchId,
      confidenceScore: 100,
      metadata: {
        isSplitChild: true,
        parentTransactionId: parent.id,
        splitIndex: i + 1,
        splitTotal: params.splits.length,
        splitNote: part.note || null,
      },
      createdAt: nowIso,
    };

    createdSplits.push(childTx);
  }

  await putMany('transactions', createdSplits);

  return { parentId: parent.id, splits: createdSplits };
}

// ---- On-Demand AI / Smart Classify Pending Queue ----

export async function classifyLocalPendingTransactions(): Promise<{
  processedCount: number;
  autoReviewedCount: number;
  updatedTransactions: Transaction[];
}> {
  await ensureLocalDbSeeded();
  const [allCategories, allRules, allTransactions] = await Promise.all([
    getAllFromStore('categories'),
    getAllFromStore('categorizationRules'),
    getAllFromStore('transactions'),
  ]);

  const catMap = new Map(allCategories.map((c) => [c.id, c]));
  const pendingList = allTransactions.filter((t) => t.status === 'pending');

  if (pendingList.length === 0) {
    return { processedCount: 0, autoReviewedCount: 0, updatedTransactions: [] };
  }

  const llmBatchInput: ClassificationInputItem[] = [];
  const ruleMatches = new Map<
    number,
    { categoryId: string; cleanMerchant: string; confidence: number; ruleId: string }
  >();

  pendingList.forEach((tx, idx) => {
    const matched = matchRule(tx.rawDescription, allRules);
    if (matched) {
      ruleMatches.set(idx, {
        categoryId: matched.categoryId,
        cleanMerchant: matched.cleanMerchant || tx.cleanMerchant || tx.rawDescription,
        confidence: matched.confidence,
        ruleId: matched.matchedRuleId,
      });
    } else {
      llmBatchInput.push({
        index: idx,
        rawDescription: tx.rawDescription,
        amount: tx.amount,
      });
    }
  });

  const llmResults = await classifyTransactionsBatchWithLLM({
    items: llmBatchInput,
    categories: allCategories,
    existingRules: allRules,
    geminiApiKey: getLocalGeminiKey() || undefined,
  });

  const llmMap = new Map(llmResults.map((r) => [r.index, r]));
  let autoReviewedCount = 0;
  const updatedTransactions: Transaction[] = [];

  for (let idx = 0; idx < pendingList.length; idx++) {
    const tx = pendingList[idx];
    const rMatch = ruleMatches.get(idx);
    const aiMatch = llmMap.get(idx);

    const categoryId = rMatch?.categoryId || aiMatch?.categoryId || tx.categoryId;
    const cleanMerchant =
      rMatch?.cleanMerchant || aiMatch?.cleanMerchant || tx.cleanMerchant || tx.rawDescription;
    const confidenceScore = rMatch?.confidence ?? aiMatch?.confidence ?? tx.confidenceScore ?? 50;
    const reasoning = rMatch
      ? `Matched deterministic rule (${rMatch.ruleId})`
      : aiMatch?.reasoning || 'Smart classification';
    const classificationSource = rMatch ? 'rule' : aiMatch?.source || 'smart_heuristic';

    const matchedCat = categoryId ? catMap.get(categoryId) : null;
    const newType = matchedCat?.type || tx.type;
    const newStatus: 'reviewed' | 'pending' =
      confidenceScore >= 90 && categoryId ? 'reviewed' : 'pending';

    if (newStatus === 'reviewed') autoReviewedCount++;

    const existingMeta =
      tx.metadata && typeof tx.metadata === 'object'
        ? (tx.metadata as Record<string, unknown>)
        : {};

    updatedTransactions.push({
      ...tx,
      categoryId,
      cleanMerchant,
      confidenceScore,
      type: newType,
      status: newStatus,
      metadata: {
        ...existingMeta,
        aiReasoning: reasoning,
        classificationSource,
      },
    });
  }

  await putMany('transactions', updatedTransactions);

  return {
    processedCount: pendingList.length,
    autoReviewedCount,
    updatedTransactions,
  };
}

// ---- Local Statement / Screenshot / Text Ingestion ----

export interface StagedPreviewRow {
  tempId: string;
  date: string;
  effectiveDate: string;
  amount: number;
  type: 'income' | 'expenses' | 'savings';
  rawDescription: string;
  cleanMerchant: string;
  categoryId: string | null;
  confidenceScore: number;
  aiReasoning?: string;
  classificationSource?: 'rule' | 'gemini_llm' | 'openai_llm' | 'smart_heuristic';
  isDuplicate: boolean;
  isTransferCandidate: boolean;
  transferMatchedAccountId?: string;
}

function computeEffectiveDate(
  isoDate: string,
  txType: 'income' | 'expenses' | 'savings',
  shiftLateIncome?: boolean,
  lateIncomeDay?: number
): string {
  if (!shiftLateIncome || txType !== 'income') return isoDate;
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const threshold = lateIncomeDay || 20;

  if (day >= threshold) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  }
  return isoDate;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

export async function ingestLocalData(params: {
  accountId: string;
  mode: 'preview' | 'commit';
  file?: File | null;
  rawText?: string;
  manualRows?: Array<{
    date: string;
    amount: number;
    rawDescription: string;
    cleanMerchant?: string;
    categoryId?: string | null;
    isTransferCandidate?: boolean;
  }>;
}): Promise<{
  success: boolean;
  mode: 'preview' | 'commit';
  batchId?: string;
  detectedBank: string;
  confidence: number;
  totalRows: number;
  newCount?: number;
  importedCount?: number;
  duplicateCount: number;
  transferCount: number;
  stagedRows: StagedPreviewRow[];
}> {
  await ensureLocalDbSeeded();

  const [existingRules, existingCategories, existingTxs, settingsList] = await Promise.all([
    getAllFromStore('categorizationRules'),
    getAllFromStore('categories'),
    getAllFromStore('transactions'),
    getAllFromStore('appSettings'),
  ]);

  const settings = settingsList[0];
  const defaultYear = settings?.startingYear || 2026;
  const catMap = new Map(existingCategories.map((c) => [c.id, c]));
  const existingFingerprints = new Set(existingTxs.map((t) => t.fingerprint));

  // Mode A: Commit verified manual/staged rows directly
  if (params.manualRows && params.manualRows.length > 0 && params.mode === 'commit') {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let importedCount = 0;
    let duplicateCount = 0;
    const toInsert: Transaction[] = [];
    const nowIso = new Date().toISOString();

    for (const row of params.manualRows) {
      const rawDesc = (row.rawDescription || row.cleanMerchant || 'Unknown').trim();
      const fingerprint = generateFingerprint({
        accountId: params.accountId,
        date: row.date,
        amount: row.amount,
        rawDescription: rawDesc,
      });

      if (existingFingerprints.has(fingerprint)) {
        duplicateCount++;
        continue;
      }
      existingFingerprints.add(fingerprint);

      const ruleMatch = matchRule(rawDesc, existingRules);
      const finalCategoryId = row.categoryId || ruleMatch?.categoryId || null;
      const matchedCat = finalCategoryId ? catMap.get(finalCategoryId) : null;

      const txType: 'income' | 'expenses' | 'savings' =
        row.amount > 0
          ? 'income'
          : matchedCat?.type === 'savings' || row.isTransferCandidate
          ? 'savings'
          : 'expenses';

      const effectiveDate = computeEffectiveDate(
        row.date,
        txType,
        settings?.shiftLateIncome,
        settings?.lateIncomeDay
      );

      toInsert.push({
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        fingerprint,
        date: row.date,
        effectiveDate,
        type: txType,
        amount: row.amount,
        accountId: params.accountId,
        categoryId: finalCategoryId,
        rawDescription: rawDesc,
        cleanMerchant: row.cleanMerchant || ruleMatch?.cleanMerchant || rawDesc,
        status: finalCategoryId ? 'reviewed' : 'pending',
        batchId,
        confidenceScore: finalCategoryId ? 100 : 0,
        metadata: {
          source: 'staged_commit',
          isTransferCandidate: Boolean(row.isTransferCandidate),
        },
        createdAt: nowIso,
      });
      importedCount++;
    }

    await putItem('importBatches', {
      id: batchId,
      filename: 'Verified Staged Import',
      accountId: params.accountId,
      totalRows: params.manualRows.length,
      importedCount,
      duplicateCount,
      createdAt: nowIso,
    });
    await putMany('transactions', toInsert);

    return {
      success: true,
      mode: 'commit',
      batchId,
      detectedBank: 'verified_import',
      confidence: 100,
      totalRows: params.manualRows.length,
      importedCount,
      duplicateCount,
      transferCount: params.manualRows.filter((r) => r.isTransferCandidate).length,
      stagedRows: [],
    };
  }

  // Mode B: Parse CSV, Screenshot Image, or Pasted Feed Text
  let normalizedList: NormalizedTransaction[] = [];
  let detectedBank = 'generic';
  let detectionConfidence = 80;

  const isImageFile =
    params.file &&
    (params.file.type.startsWith('image/') ||
      /\.(png|jpe?g|webp|heic)$/i.test(params.file.name));

  if (params.rawText && params.rawText.trim().length > 0) {
    detectedBank = 'pasted_feed';
    detectionConfidence = 85;
    normalizedList = parseBankScreenshotText(params.rawText, defaultYear);
  } else if (isImageFile && params.file) {
    const geminiKey = getLocalGeminiKey();
    if (!geminiKey) {
      throw new Error(
        'On-phone screenshot image scanning needs an optional Gemini API Key in Rules & Settings — OR use iPhone/Android Live Text to copy text from your screenshot and paste it into the "Paste App Feed" tab (100% offline!).'
      );
    }

    const base64Image = await fileToBase64(params.file);
    const visionResult = await extractTransactionsWithGeminiVision({
      base64Image,
      mimeType: params.file.type || 'image/png',
      apiKey: geminiKey,
      defaultYear,
    });
    normalizedList = visionResult.transactions;
    detectedBank = visionResult.detectedBank;
    detectionConfidence = 95;
  } else if (params.file) {
    const text = await params.file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const headers = parsed.meta.fields || [];
    const detection = detectBankFormat(headers);
    detectedBank = detection.bank;
    detectionConfidence = detection.confidence;

    for (const row of parsed.data) {
      const norm = normalizeBankRow(row, detection.bank);
      if (norm) normalizedList.push(norm);
    }
  } else {
    throw new Error('Please provide a CSV file, banking screenshot, or pasted feed text.');
  }

  // Transfer Matching
  const candidatePool: CandidateTransaction[] = [
    ...existingTxs
      .filter((t) => t.status !== 'ignored')
      .map((t) => ({
        id: t.id,
        accountId: t.accountId,
        date: t.date,
        amount: t.amount,
        rawDescription: t.rawDescription,
      })),
    ...normalizedList.map((n, idx) => ({
      id: `staged_${idx}`,
      accountId: params.accountId,
      date: n.date,
      amount: n.amount,
      rawDescription: n.rawDescription,
    })),
  ];

  const transferPairs = findTransferPairs(candidatePool, 2);
  const transferMap = new Map<string, string>();
  for (const pair of transferPairs) {
    if (pair.outflow.id?.startsWith('staged_')) {
      transferMap.set(pair.outflow.id, pair.inflow.accountId);
    }
    if (pair.inflow.id?.startsWith('staged_')) {
      transferMap.set(pair.inflow.id, pair.outflow.accountId);
    }
  }

  const stagedRows: StagedPreviewRow[] = [];
  const unmatchedBatch: ClassificationInputItem[] = [];

  for (let i = 0; i < normalizedList.length; i++) {
    const normalized = normalizedList[i];
    const fingerprint = generateFingerprint({
      accountId: params.accountId,
      date: normalized.date,
      amount: normalized.amount,
      rawDescription: normalized.rawDescription,
    });

    const isDuplicate = existingFingerprints.has(fingerprint);
    const stagedKey = `staged_${i}`;
    const transferMatchedAcc = transferMap.get(stagedKey);

    const ruleMatch = matchRule(normalized.rawDescription, existingRules);
    const matchedCat = ruleMatch ? catMap.get(ruleMatch.categoryId) : null;

    if (!ruleMatch) {
      unmatchedBatch.push({
        index: i,
        rawDescription: normalized.rawDescription,
        amount: normalized.amount,
      });
    }

    const txType: 'income' | 'expenses' | 'savings' =
      normalized.amount > 0
        ? 'income'
        : matchedCat?.type === 'savings' || Boolean(transferMatchedAcc)
        ? 'savings'
        : 'expenses';

    const effectiveDate = computeEffectiveDate(
      normalized.date,
      txType,
      settings?.shiftLateIncome,
      settings?.lateIncomeDay
    );

    stagedRows.push({
      tempId: stagedKey,
      date: normalized.date,
      effectiveDate,
      amount: normalized.amount,
      type: txType,
      rawDescription: normalized.rawDescription,
      cleanMerchant:
        ruleMatch?.cleanMerchant ||
        normalized.suggestedMerchant ||
        normalized.rawDescription,
      categoryId: ruleMatch ? ruleMatch.categoryId : null,
      confidenceScore: ruleMatch ? ruleMatch.confidence : transferMatchedAcc ? 92 : 0,
      aiReasoning: ruleMatch ? 'Matched learned merchant rule' : undefined,
      classificationSource: ruleMatch ? 'rule' : undefined,
      isDuplicate,
      isTransferCandidate: Boolean(transferMatchedAcc),
      transferMatchedAccountId: transferMatchedAcc,
    });
  }

  // Run LLM + Smart Heuristic Fallback on unmatched rows
  if (unmatchedBatch.length > 0) {
    const aiResults = await classifyTransactionsBatchWithLLM({
      items: unmatchedBatch,
      categories: existingCategories,
      existingRules,
      geminiApiKey: getLocalGeminiKey() || undefined,
    });

    const aiMap = new Map(aiResults.map((r) => [`staged_${r.index}`, r]));
    for (const row of stagedRows) {
      const ai = aiMap.get(row.tempId);
      if (!ai) continue;

      row.cleanMerchant = ai.cleanMerchant || row.cleanMerchant;
      row.categoryId = ai.categoryId;
      row.confidenceScore = row.isTransferCandidate
        ? Math.max(92, ai.confidence)
        : ai.confidence;
      row.aiReasoning = ai.reasoning;
      row.classificationSource = ai.source;

      const aiCat = ai.categoryId ? catMap.get(ai.categoryId) : null;
      if (aiCat?.type === 'savings') {
        row.type = 'savings';
      } else if (aiCat?.type === 'income' && row.amount > 0) {
        row.type = 'income';
      }
    }
  }

  if (params.mode === 'preview') {
    return {
      success: true,
      mode: 'preview',
      detectedBank,
      confidence: detectionConfidence,
      totalRows: stagedRows.length,
      newCount: stagedRows.filter((r) => !r.isDuplicate).length,
      duplicateCount: stagedRows.filter((r) => r.isDuplicate).length,
      transferCount: stagedRows.filter((r) => r.isTransferCandidate).length,
      stagedRows,
    };
  }

  // Commit mode
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();
  let importedCount = 0;
  let duplicateCount = 0;
  const toInsert: Transaction[] = [];

  for (const row of stagedRows) {
    const fingerprint = generateFingerprint({
      accountId: params.accountId,
      date: row.date,
      amount: row.amount,
      rawDescription: row.rawDescription,
    });

    if (existingFingerprints.has(fingerprint)) {
      duplicateCount++;
      continue;
    }
    existingFingerprints.add(fingerprint);

    toInsert.push({
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      fingerprint,
      date: row.date,
      effectiveDate: row.effectiveDate,
      type: row.type,
      amount: row.amount,
      accountId: params.accountId,
      categoryId: row.categoryId,
      rawDescription: row.rawDescription,
      cleanMerchant: row.cleanMerchant,
      status: row.confidenceScore >= 90 && row.categoryId ? 'reviewed' : 'pending',
      batchId,
      confidenceScore: row.confidenceScore,
      metadata: {
        isTransferCandidate: row.isTransferCandidate,
        transferMatchedAccountId: row.transferMatchedAccountId || null,
        aiReasoning: row.aiReasoning || null,
        classificationSource: row.classificationSource || null,
      },
      createdAt: nowIso,
    });
    importedCount++;
  }

  await putItem('importBatches', {
    id: batchId,
    filename: params.file?.name || 'Pasted Statement',
    accountId: params.accountId,
    totalRows: stagedRows.length,
    importedCount,
    duplicateCount,
    createdAt: nowIso,
  });
  await putMany('transactions', toInsert);

  return {
    success: true,
    mode: 'commit',
    batchId,
    detectedBank,
    confidence: detectionConfidence,
    totalRows: stagedRows.length,
    importedCount,
    duplicateCount,
    transferCount: stagedRows.filter((r) => r.isTransferCandidate).length,
    stagedRows,
  };
}

// ---- Local Backup & Restore (100% On-Phone Offline) ----

export async function exportLocalJsonSnapshot(): Promise<string> {
  const data = await loadAppData();
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      tables: {
        appSettings: [data.settings],
        accounts: data.accounts,
        categories: data.categories,
        budgetPlans: data.plans,
        categorizationRules: data.rules,
        importBatches: data.batches,
        transactions: data.transactions,
      },
    },
    null,
    2
  );
}

export async function exportLocalExcelWorkbook(year: number): Promise<Uint8Array> {
  const data = await loadAppData();
  return buildUltimateBudgetWorkbook({
    year,
    settings: data.settings,
    accounts: data.accounts,
    categories: data.categories,
    plans: data.plans,
    transactions: data.transactions,
  });
}

export async function restoreLocalJsonSnapshot(jsonText: string): Promise<{
  appSettings: number;
  accounts: number;
  categories: number;
  budgetPlans: number;
  categorizationRules: number;
  importBatches: number;
  transactions: number;
}> {
  await ensureLocalDbSeeded();
  const parsed = JSON.parse(jsonText) as {
    tables?: {
      appSettings?: AppSettings[];
      accounts?: Account[];
      categories?: Category[];
      budgetPlans?: BudgetPlan[];
      categorizationRules?: CategorizationRule[];
      importBatches?: ImportBatch[];
      transactions?: Transaction[];
    };
  };

  if (!parsed?.tables || typeof parsed.tables !== 'object') {
    throw new Error('Invalid backup JSON: missing "tables" object.');
  }

  const t = parsed.tables;
  if (Array.isArray(t.appSettings)) await putMany('appSettings', t.appSettings);
  if (Array.isArray(t.accounts)) await putMany('accounts', t.accounts);
  if (Array.isArray(t.categories)) await putMany('categories', t.categories);
  if (Array.isArray(t.budgetPlans)) await putMany('budgetPlans', t.budgetPlans);
  if (Array.isArray(t.categorizationRules))
    await putMany('categorizationRules', t.categorizationRules);
  if (Array.isArray(t.importBatches)) await putMany('importBatches', t.importBatches);

  let txCount = 0;
  if (Array.isArray(t.transactions)) {
    // Deduplicate by fingerprint when merging into existing store
    const existing = await getAllFromStore('transactions');
    const byFingerprint = new Map(existing.map((e) => [e.fingerprint, e]));
    const toWrite: Transaction[] = [];

    for (const incoming of t.transactions) {
      const prev = byFingerprint.get(incoming.fingerprint);
      if (prev) {
        toWrite.push({
          ...prev,
          categoryId: incoming.categoryId,
          cleanMerchant: incoming.cleanMerchant,
          status: incoming.status,
          type: incoming.type,
          effectiveDate: incoming.effectiveDate,
          confidenceScore: incoming.confidenceScore,
          metadata: incoming.metadata,
        });
      } else {
        toWrite.push(incoming);
      }
      txCount++;
    }
    await putMany('transactions', toWrite);
  }

  return {
    appSettings: t.appSettings?.length || 0,
    accounts: t.accounts?.length || 0,
    categories: t.categories?.length || 0,
    budgetPlans: t.budgetPlans?.length || 0,
    categorizationRules: t.categorizationRules?.length || 0,
    importBatches: t.importBatches?.length || 0,
    transactions: txCount,
  };
}

export function triggerBrowserDownload(
  content: string | Uint8Array,
  filename: string,
  mimeType: string
): void {
  const blobPart: BlobPart =
    typeof content === 'string' ? content : new Uint8Array(content);
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
