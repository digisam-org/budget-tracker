import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { 
    enum: ['checking', 'savings', 'credit_card', 'investment', 'rental'] 
  }).notNull(),
  institution: text('institution'), // e.g. Barclays, HSBC, Monzo, Vanguard, Amex
  currency: text('currency').default('GBP').notNull(),
  balance: integer('balance').default(0).notNull(), // Minor units (pence)
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  group: text('group', { 
    enum: ['income', 'fixed_expense', 'variable_expense', 'rental_property', 'savings_transfer'] 
  }).notNull(),
  isSavingsTransfer: integer('is_savings_transfer', { mode: 'boolean' }).default(false).notNull(),
  color: text('color'),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
});

export const budgetPlans = sqliteTable('budget_plans', {
  id: text('id').primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(), // 1 - 12
  categoryId: text('category_id').notNull().references(() => categories.id),
  plannedAmount: integer('planned_amount').notNull(), // Minor units (pence)
  notes: text('notes'),
}, (table) => [
  uniqueIndex('month_year_category_idx').on(table.year, table.month, table.categoryId),
]);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  totalRows: integer('total_rows').notNull(),
  importedCount: integer('imported_count').notNull(),
  duplicateCount: integer('duplicate_count').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull().unique(), // SHA-256 (account_id + date + amount + raw_description)
  date: text('date').notNull(), // ISO YYYY-MM-DD
  amount: integer('amount').notNull(), // Minor units: positive = inflow (+£10.00 is 1000), negative = outflow (-£10.00 is -1000)
  accountId: text('account_id').notNull().references(() => accounts.id),
  categoryId: text('category_id').references(() => categories.id),
  rawDescription: text('raw_description').notNull(),
  cleanMerchant: text('clean_merchant'),
  status: text('status', { 
    enum: ['pending', 'reviewed', 'ignored'] 
  }).default('pending').notNull(),
  batchId: text('batch_id').references(() => importBatches.id),
  confidenceScore: integer('confidence_score'), // 0 - 100
  metadata: text('metadata', { mode: 'json' }), // extra parsed fields or LLM reasoning
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const categorizationRules = sqliteTable('categorization_rules', {
  id: text('id').primaryKey(),
  pattern: text('pattern').notNull(),
  patternType: text('pattern_type', { 
    enum: ['contains', 'regex', 'exact'] 
  }).default('contains').notNull(),
  categoryId: text('category_id').notNull().references(() => categories.id),
  cleanMerchant: text('clean_merchant'),
  priority: integer('priority').default(1).notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type BudgetPlan = typeof budgetPlans.$inferSelect;
export type NewBudgetPlan = typeof budgetPlans.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type CategorizationRule = typeof categorizationRules.$inferSelect;
export type NewCategorizationRule = typeof categorizationRules.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
