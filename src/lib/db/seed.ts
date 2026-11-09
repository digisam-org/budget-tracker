import { db } from './index';
import { 
  appSettings, 
  accounts, 
  categories, 
  budgetPlans, 
  transactions, 
  categorizationRules,
  importBatches 
} from './schema';
import excelData from './excel-seed-data.json';
import { generateFingerprint } from '../ingestion/fingerprint';

export async function seedDatabase() {
  console.log('🌱 Seeding database from Excel budget blueprint...');

  // 1. Settings
  await db
    .insert(appSettings)
    .values({
      id: 'default',
      startingYear: excelData.settings.startingYear,
      shiftLateIncome: excelData.settings.shiftLateIncome,
      lateIncomeDay: excelData.settings.lateIncomeDay,
      savingsRateType: excelData.settings.savingsRateType as 'active' | 'passive',
    })
    .onConflictDoNothing();

  // 2. Default Accounts
  const defaultAccounts = [
    {
      id: 'acc_main_checking',
      name: 'Main Current Account',
      type: 'checking' as const,
      institution: 'Monzo / Barclays',
      currency: 'GBP',
      balance: 0,
    },
    {
      id: 'acc_rental',
      name: 'Rental Property Account',
      type: 'rental' as const,
      institution: 'Glasgow Flat Account',
      currency: 'GBP',
      balance: 0,
    },
    {
      id: 'acc_isa',
      name: 'Stocks & Shares ISA / Portfolio',
      type: 'investment' as const,
      institution: 'IKBR / Vanguard',
      currency: 'GBP',
      balance: 0,
    },
    {
      id: 'acc_credit_card',
      name: 'Rewards Credit Card',
      type: 'credit_card' as const,
      institution: 'American Express',
      currency: 'GBP',
      balance: 0,
    },
  ];

  for (const acc of defaultAccounts) {
    await db.insert(accounts).values(acc).onConflictDoNothing();
  }

  // 3. Categories from Excel
  for (const cat of excelData.categories) {
    await db
      .insert(categories)
      .values({
        id: cat.id,
        name: cat.name,
        type: cat.type as 'income' | 'expenses' | 'savings',
        subgroup: cat.subgroup,
        isSavingsTransfer: cat.isSavingsTransfer,
        sortOrder: cat.sortOrder,
      })
      .onConflictDoNothing();
  }

  // 4. Budget Plans from Excel (All 12 Months)
  for (const plan of excelData.budgetPlans) {
    const planId = `plan_${plan.year}_${plan.month}_${plan.categoryId}`;
    await db
      .insert(budgetPlans)
      .values({
        id: planId,
        year: plan.year,
        month: plan.month,
        categoryId: plan.categoryId,
        plannedAmount: plan.plannedAmount,
      })
      .onConflictDoNothing();
  }

  // 5. Create Seed Batch & Historical Transactions from Excel
  const seedBatchId = 'batch_excel_initial_import';
  await db
    .insert(importBatches)
    .values({
      id: seedBatchId,
      filename: 'Ultimate Personal Budget Extended.xlsx',
      accountId: 'acc_main_checking',
      totalRows: excelData.transactions.length,
      importedCount: excelData.transactions.length,
      duplicateCount: 0,
    })
    .onConflictDoNothing();

  for (let i = 0; i < excelData.transactions.length; i++) {
    const tx = excelData.transactions[i];
    const accountId = tx.categoryName.toLowerCase().includes('glasgow')
      ? 'acc_rental'
      : tx.type === 'savings'
      ? 'acc_isa'
      : 'acc_main_checking';

    const fingerprint = generateFingerprint({
      accountId,
      date: tx.date || '2026-01-01',
      amount: tx.amount,
      rawDescription: tx.details || tx.categoryName,
    });

    await db
      .insert(transactions)
      .values({
        id: `tx_excel_${i + 1}`,
        fingerprint,
        date: tx.date || '2026-01-01',
        effectiveDate: tx.effectiveDate || tx.date,
        type: tx.type as 'income' | 'expenses' | 'savings',
        amount: tx.amount,
        accountId,
        categoryId: tx.categoryId,
        rawDescription: tx.details || tx.categoryName,
        cleanMerchant: tx.details || tx.categoryName,
        status: 'reviewed',
        batchId: seedBatchId,
        confidenceScore: 100,
      })
      .onConflictDoNothing();
  }

  // 6. Common Learned Rules based on Excel
  const rules = [
    { id: 'rule_nationwide', pattern: 'NATIONWIDE', patternType: 'contains' as const, categoryId: 'cat_housing', cleanMerchant: 'Nationwide Mortgage', priority: 20 },
    { id: 'rule_council_tax', pattern: 'COUNCIL TAX', patternType: 'contains' as const, categoryId: 'cat_taxes', cleanMerchant: 'Council Tax', priority: 20 },
    { id: 'rule_glasgow_flat', pattern: 'GLASGOW FLAT', patternType: 'contains' as const, categoryId: 'cat_housing', cleanMerchant: 'Glasgow Flat', priority: 20 },
    { id: 'rule_edinburgh_rent', pattern: 'EDINBURGH RENT', patternType: 'contains' as const, categoryId: 'cat_housing', cleanMerchant: 'Edinburgh Rent', priority: 20 },
    { id: 'rule_octopus', pattern: 'OCTOPUS', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'Octopus Energy', priority: 20 },
    { id: 'rule_ovo', pattern: 'OVO', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'OVO Energy', priority: 20 },
    { id: 'rule_vodafone', pattern: 'VODAFONE', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'Vodafone', priority: 20 },
    { id: 'rule_apple', pattern: 'APPLE', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'Apple Subscription', priority: 15 },
    { id: 'rule_spotify', pattern: 'SPOTIFY', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'Spotify', priority: 15 },
    { id: 'rule_claude', pattern: 'CLAUDE', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'Claude AI', priority: 15 },
    { id: 'rule_snoop', pattern: 'SNOOP', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'Snoop App', priority: 15 },
    { id: 'rule_google_one', pattern: 'GOOGLE ONE', patternType: 'contains' as const, categoryId: 'cat_utilities', cleanMerchant: 'Google One', priority: 15 },
    { id: 'rule_tesco', pattern: 'TESCO', patternType: 'contains' as const, categoryId: 'cat_groceries', cleanMerchant: 'Tesco', priority: 10 },
    { id: 'rule_sainsburys', pattern: 'SAINSBURY', patternType: 'contains' as const, categoryId: 'cat_groceries', cleanMerchant: "Sainsbury's", priority: 10 },
    { id: 'rule_uber', pattern: 'UBER', patternType: 'contains' as const, categoryId: 'cat_transport', cleanMerchant: 'Uber', priority: 10 },
    { id: 'rule_deliveroo', pattern: 'DELIVEROO', patternType: 'contains' as const, categoryId: 'cat_eating_out', cleanMerchant: 'Deliveroo', priority: 10 },
    { id: 'rule_chitra', pattern: 'CHITRA', patternType: 'contains' as const, categoryId: 'cat_chitra_payback', cleanMerchant: 'Chitra Payback', priority: 20 },
    { id: 'rule_digisam', pattern: 'DIGISAM', patternType: 'contains' as const, categoryId: 'cat_digisam_foundation', cleanMerchant: 'DigiSam Foundation', priority: 20 },
    { id: 'rule_max_life', pattern: 'MAX LIFE', patternType: 'contains' as const, categoryId: 'cat_max_life_growth_fund', cleanMerchant: 'Max Life Growth Fund', priority: 20 },
    { id: 'rule_st_james', pattern: 'ST JAMES', patternType: 'contains' as const, categoryId: 'cat_retirement_investment', cleanMerchant: 'St James Place', priority: 20 },
  ];

  for (const rule of rules) {
    await db.insert(categorizationRules).values(rule).onConflictDoNothing();
  }

  console.log('✅ Excel blueprint database seed completed successfully!');
}

if (process.env.RUN_SEED === 'true') {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
