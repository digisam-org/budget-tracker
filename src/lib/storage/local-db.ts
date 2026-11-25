import {
  AppSettings,
  Account,
  Category,
  BudgetPlan,
  Transaction,
  CategorizationRule,
  ImportBatch,
} from '@/lib/types';
import excelData from '@/lib/db/excel-seed-data.json';
import { generateFingerprint } from '@/lib/ingestion/fingerprint';

export type StoreName =
  | 'appSettings'
  | 'accounts'
  | 'categories'
  | 'budgetPlans'
  | 'transactions'
  | 'categorizationRules'
  | 'importBatches';

export interface StoreTypeMap {
  appSettings: AppSettings;
  accounts: Account;
  categories: Category;
  budgetPlans: BudgetPlan;
  transactions: Transaction;
  categorizationRules: CategorizationRule;
  importBatches: ImportBatch;
}

const DB_NAME = 'budget_tracker_local_v1';
const DB_VERSION = 1;
const ALL_STORES: StoreName[] = [
  'appSettings',
  'accounts',
  'categories',
  'budgetPlans',
  'transactions',
  'categorizationRules',
  'importBatches',
];

// In-memory fallback for Node/automated unit testing (never used in browser when IndexedDB is present)
const memoryStores: Record<StoreName, Map<string, unknown>> = {
  appSettings: new Map(),
  accounts: new Map(),
  categories: new Map(),
  budgetPlans: new Map(),
  transactions: new Map(),
  categorizationRules: new Map(),
  importBatches: new Map(),
};

let dbPromise: Promise<IDBDatabase> | null = null;
let seedPromise: Promise<void> | null = null;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of ALL_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath: 'id' });
          if (store === 'transactions') {
            os.createIndex('fingerprint', 'fingerprint', { unique: true });
            os.createIndex('status', 'status', { unique: false });
            os.createIndex('date', 'date', { unique: false });
          } else if (store === 'budgetPlans') {
            os.createIndex('year_month_category', ['year', 'month', 'categoryId'], {
              unique: true,
            });
          }
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}

export async function getAllFromStore<K extends StoreName>(
  storeName: K
): Promise<StoreTypeMap[K][]> {
  if (!hasIndexedDB()) {
    return Array.from(memoryStores[storeName].values()) as StoreTypeMap[K][];
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as StoreTypeMap[K][]);
    req.onerror = () => reject(req.error);
  });
}

export async function getById<K extends StoreName>(
  storeName: K,
  id: string
): Promise<StoreTypeMap[K] | undefined> {
  if (!hasIndexedDB()) {
    return memoryStores[storeName].get(id) as StoreTypeMap[K] | undefined;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoreTypeMap[K] | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putItem<K extends StoreName>(
  storeName: K,
  item: StoreTypeMap[K]
): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores[storeName].set(item.id, item);
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putMany<K extends StoreName>(
  storeName: K,
  items: StoreTypeMap[K][]
): Promise<void> {
  if (items.length === 0) return;

  if (!hasIndexedDB()) {
    for (const item of items) {
      memoryStores[storeName].set(item.id, item);
    }
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteById(storeName: StoreName, id: string): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores[storeName].delete(id);
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStore(storeName: StoreName): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStores[storeName].clear();
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function buildExcelSeedDataset(): {
  settings: AppSettings;
  accounts: Account[];
  categories: Category[];
  budgetPlans: BudgetPlan[];
  transactions: Transaction[];
  categorizationRules: CategorizationRule[];
  importBatches: ImportBatch[];
} {
  const nowIso = new Date().toISOString();

  const settings: AppSettings = {
    id: 'default',
    startingYear: excelData.settings.startingYear,
    shiftLateIncome: excelData.settings.shiftLateIncome,
    lateIncomeDay: excelData.settings.lateIncomeDay,
    savingsRateType: excelData.settings.savingsRateType as 'active' | 'passive',
    updatedAt: nowIso,
  };

  const accounts: Account[] = [
    {
      id: 'acc_main_checking',
      name: 'Main Current Account',
      type: 'checking',
      institution: 'Monzo / Barclays',
      currency: 'GBP',
      balance: 0,
      isActive: true,
      createdAt: nowIso,
    },
    {
      id: 'acc_rental',
      name: 'Rental Property Account',
      type: 'rental',
      institution: 'Glasgow Flat Account',
      currency: 'GBP',
      balance: 0,
      isActive: true,
      createdAt: nowIso,
    },
    {
      id: 'acc_isa',
      name: 'Stocks & Shares ISA / Portfolio',
      type: 'investment',
      institution: 'IKBR / Vanguard',
      currency: 'GBP',
      balance: 0,
      isActive: true,
      createdAt: nowIso,
    },
    {
      id: 'acc_credit_card',
      name: 'Rewards Credit Card',
      type: 'credit_card',
      institution: 'American Express',
      currency: 'GBP',
      balance: 0,
      isActive: true,
      createdAt: nowIso,
    },
  ];

  const categories: Category[] = excelData.categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    type: cat.type as 'income' | 'expenses' | 'savings',
    subgroup: cat.subgroup || null,
    isSavingsTransfer: Boolean(cat.isSavingsTransfer),
    color: null,
    icon: null,
    sortOrder: cat.sortOrder,
  }));

  const budgetPlans: BudgetPlan[] = excelData.budgetPlans.map((plan) => ({
    id: `plan_${plan.year}_${plan.month}_${plan.categoryId}`,
    year: plan.year,
    month: plan.month,
    categoryId: plan.categoryId,
    plannedAmount: plan.plannedAmount,
    notes: null,
  }));

  const seedBatchId = 'batch_excel_initial_import';
  const importBatches: ImportBatch[] = [
    {
      id: seedBatchId,
      filename: 'Ultimate Personal Budget Extended.xlsx',
      accountId: 'acc_main_checking',
      totalRows: excelData.transactions.length,
      importedCount: excelData.transactions.length,
      duplicateCount: 0,
      createdAt: nowIso,
    },
  ];

  const seenFingerprints = new Set<string>();
  const transactions: Transaction[] = [];

  for (let i = 0; i < excelData.transactions.length; i++) {
    const tx = excelData.transactions[i];
    const accountId = tx.categoryName.toLowerCase().includes('glasgow')
      ? 'acc_rental'
      : tx.type === 'savings'
      ? 'acc_isa'
      : 'acc_main_checking';

    const rawDesc = tx.details || tx.categoryName;
    let fingerprint = generateFingerprint({
      accountId,
      date: tx.date || '2026-01-01',
      amount: tx.amount,
      rawDescription: rawDesc,
    });

    // Guard against duplicate fingerprints inside seed data
    if (seenFingerprints.has(fingerprint)) {
      fingerprint = generateFingerprint({
        accountId,
        date: tx.date || '2026-01-01',
        amount: tx.amount,
        rawDescription: `${rawDesc} #${i + 1}`,
      });
    }
    seenFingerprints.add(fingerprint);

    transactions.push({
      id: `tx_excel_${i + 1}`,
      fingerprint,
      date: tx.date || '2026-01-01',
      effectiveDate: tx.effectiveDate || tx.date || '2026-01-01',
      type: tx.type as 'income' | 'expenses' | 'savings',
      amount: tx.amount,
      accountId,
      categoryId: tx.categoryId,
      rawDescription: rawDesc,
      cleanMerchant: rawDesc,
      status: 'reviewed',
      batchId: seedBatchId,
      confidenceScore: 100,
      metadata: null,
      createdAt: nowIso,
    });
  }

  const categorizationRules: CategorizationRule[] = [
    { id: 'rule_nationwide', pattern: 'NATIONWIDE', patternType: 'contains', categoryId: 'cat_housing', cleanMerchant: 'Nationwide Mortgage', priority: 20 },
    { id: 'rule_council_tax', pattern: 'COUNCIL TAX', patternType: 'contains', categoryId: 'cat_taxes', cleanMerchant: 'Council Tax', priority: 20 },
    { id: 'rule_glasgow_flat', pattern: 'GLASGOW FLAT', patternType: 'contains', categoryId: 'cat_housing', cleanMerchant: 'Glasgow Flat', priority: 20 },
    { id: 'rule_edinburgh_rent', pattern: 'EDINBURGH RENT', patternType: 'contains', categoryId: 'cat_housing', cleanMerchant: 'Edinburgh Rent', priority: 20 },
    { id: 'rule_octopus', pattern: 'OCTOPUS', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'Octopus Energy', priority: 20 },
    { id: 'rule_ovo', pattern: 'OVO', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'OVO Energy', priority: 20 },
    { id: 'rule_vodafone', pattern: 'VODAFONE', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'Vodafone', priority: 20 },
    { id: 'rule_apple', pattern: 'APPLE', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'Apple Subscription', priority: 15 },
    { id: 'rule_spotify', pattern: 'SPOTIFY', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'Spotify', priority: 15 },
    { id: 'rule_claude', pattern: 'CLAUDE', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'Claude AI', priority: 15 },
    { id: 'rule_snoop', pattern: 'SNOOP', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'Snoop App', priority: 15 },
    { id: 'rule_google_one', pattern: 'GOOGLE ONE', patternType: 'contains', categoryId: 'cat_utilities', cleanMerchant: 'Google One', priority: 15 },
    { id: 'rule_tesco', pattern: 'TESCO', patternType: 'contains', categoryId: 'cat_groceries', cleanMerchant: 'Tesco', priority: 10 },
    { id: 'rule_sainsburys', pattern: 'SAINSBURY', patternType: 'contains', categoryId: 'cat_groceries', cleanMerchant: "Sainsbury's", priority: 10 },
    { id: 'rule_uber', pattern: 'UBER', patternType: 'contains', categoryId: 'cat_transport', cleanMerchant: 'Uber', priority: 10 },
    { id: 'rule_deliveroo', pattern: 'DELIVEROO', patternType: 'contains', categoryId: 'cat_eating_out', cleanMerchant: 'Deliveroo', priority: 10 },
    { id: 'rule_chitra', pattern: 'CHITRA', patternType: 'contains', categoryId: 'cat_chitra_payback', cleanMerchant: 'Chitra Payback', priority: 20 },
    { id: 'rule_digisam', pattern: 'DIGISAM', patternType: 'contains', categoryId: 'cat_digisam_foundation', cleanMerchant: 'DigiSam Foundation', priority: 20 },
    { id: 'rule_max_life', pattern: 'MAX LIFE', patternType: 'contains', categoryId: 'cat_max_life_growth_fund', cleanMerchant: 'Max Life Growth Fund', priority: 20 },
    { id: 'rule_st_james', pattern: 'ST JAMES', patternType: 'contains', categoryId: 'cat_retirement_investment', cleanMerchant: 'St James Place', priority: 20 },
  ];

  return {
    settings,
    accounts,
    categories,
    budgetPlans,
    transactions,
    categorizationRules,
    importBatches,
  };
}

/**
 * Ensures on-device IndexedDB is initialized and seeded on first launch.
 * Also requests persistent storage on mobile browsers (iOS/Android) to prevent eviction.
 */
export async function ensureLocalDbSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    // Request durable storage on iOS/Android
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      navigator.storage.persist().catch(() => {});
    }

    const existingCats = await getAllFromStore('categories');
    if (existingCats.length > 0) return;

    const seed = buildExcelSeedDataset();
    await putItem('appSettings', seed.settings);
    await putMany('accounts', seed.accounts);
    await putMany('categories', seed.categories);
    await putMany('budgetPlans', seed.budgetPlans);
    await putMany('importBatches', seed.importBatches);
    await putMany('transactions', seed.transactions);
    await putMany('categorizationRules', seed.categorizationRules);
  })();

  return seedPromise;
}

export async function resetLocalDbToSeed(): Promise<void> {
  for (const store of ALL_STORES) {
    await clearStore(store);
  }
  seedPromise = null;
  await ensureLocalDbSeeded();
}
