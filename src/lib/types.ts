export interface AppSettings {
  id: string;
  startingYear: number;
  shiftLateIncome: boolean;
  lateIncomeDay: number;
  savingsRateType: 'active' | 'passive';
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'rental';
  institution: string | null;
  currency: string;
  balance: number; // Minor units (pence)
  isActive: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expenses' | 'savings';
  subgroup: string | null;
  isSavingsTransfer: boolean;
  color: string | null;
  icon: string | null;
  sortOrder: number;
}

export interface BudgetPlan {
  id: string;
  year: number;
  month: number; // 1 - 12
  categoryId: string;
  plannedAmount: number; // Minor units (pence)
  notes: string | null;
}

export interface ImportBatch {
  id: string;
  filename: string;
  accountId: string;
  totalRows: number;
  importedCount: number;
  duplicateCount: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  fingerprint: string;
  date: string; // ISO YYYY-MM-DD
  effectiveDate: string | null;
  type: 'income' | 'expenses' | 'savings';
  amount: number; // Minor units: positive = inflow, negative = outflow
  accountId: string;
  categoryId: string | null;
  rawDescription: string;
  cleanMerchant: string | null;
  status: 'pending' | 'reviewed' | 'ignored';
  batchId: string | null;
  confidenceScore: number | null;
  metadata: unknown;
  createdAt: string;
}

export interface CategorizationRule {
  id: string;
  pattern: string;
  patternType: 'contains' | 'regex' | 'exact';
  categoryId: string;
  cleanMerchant: string | null;
  priority: number;
}
