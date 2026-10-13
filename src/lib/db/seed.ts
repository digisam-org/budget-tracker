import { db } from './index';
import { accounts, categories, categorizationRules } from './schema';

export async function seedDatabase() {
  console.log('🌱 Seeding database...');

  // Default UK accounts
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
      institution: 'Barclays Rental',
      currency: 'GBP',
      balance: 0,
    },
    {
      id: 'acc_isa',
      name: 'Stocks & Shares ISA',
      type: 'investment' as const,
      institution: 'Vanguard',
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

  // Default Categories
  const defaultCategories = [
    // Income
    { id: 'cat_salary', name: 'Primary Salary (Net)', group: 'income' as const, isSavingsTransfer: false, icon: 'Briefcase', sortOrder: 1 },
    { id: 'cat_rental_income', name: 'Rental Property Inflow', group: 'income' as const, isSavingsTransfer: false, icon: 'Home', sortOrder: 2 },
    { id: 'cat_dividend_interest', name: 'Dividends & Interest', group: 'income' as const, isSavingsTransfer: false, icon: 'TrendingUp', sortOrder: 3 },
    { id: 'cat_other_income', name: 'Other Income / Bonus', group: 'income' as const, isSavingsTransfer: false, icon: 'PlusCircle', sortOrder: 4 },

    // Fixed Expenses
    { id: 'cat_mortgage_rent', name: 'Mortgage / Rent', group: 'fixed_expense' as const, isSavingsTransfer: false, icon: 'Building', sortOrder: 10 },
    { id: 'cat_council_tax', name: 'Council Tax', group: 'fixed_expense' as const, isSavingsTransfer: false, icon: 'Landmark', sortOrder: 11 },
    { id: 'cat_utilities', name: 'Energy & Water', group: 'fixed_expense' as const, isSavingsTransfer: false, icon: 'Zap', sortOrder: 12 },
    { id: 'cat_broadband_phone', name: 'Broadband & Mobile', group: 'fixed_expense' as const, isSavingsTransfer: false, icon: 'Wifi', sortOrder: 13 },
    { id: 'cat_insurance', name: 'Insurances', group: 'fixed_expense' as const, isSavingsTransfer: false, icon: 'Shield', sortOrder: 14 },

    // Variable Living Costs
    { id: 'cat_groceries', name: 'Groceries & Household', group: 'variable_expense' as const, isSavingsTransfer: false, icon: 'ShoppingCart', sortOrder: 20 },
    { id: 'cat_dining_out', name: 'Dining Out & Coffee', group: 'variable_expense' as const, isSavingsTransfer: false, icon: 'Utensils', sortOrder: 21 },
    { id: 'cat_transport', name: 'Transport & Fuel', group: 'variable_expense' as const, isSavingsTransfer: false, icon: 'Car', sortOrder: 22 },
    { id: 'cat_shopping_leisure', name: 'Shopping & Leisure', group: 'variable_expense' as const, isSavingsTransfer: false, icon: 'ShoppingBag', sortOrder: 23 },

    // Rental Property Costs (Segregated from personal living costs)
    { id: 'cat_rental_mortgage', name: 'Rental Mortgage Interest', group: 'rental_property' as const, isSavingsTransfer: false, icon: 'Building2', sortOrder: 30 },
    { id: 'cat_rental_agency', name: 'Letting Agent Fees', group: 'rental_property' as const, isSavingsTransfer: false, icon: 'Users', sortOrder: 31 },
    { id: 'cat_rental_maintenance', name: 'Property Repairs & Maintenance', group: 'rental_property' as const, isSavingsTransfer: false, icon: 'Wrench', sortOrder: 32 },

    // Savings & Transfers (Not treated as consumption expenses)
    { id: 'cat_isa_investments', name: 'Vanguard / ISA Contributions', group: 'savings_transfer' as const, isSavingsTransfer: true, icon: 'PiggyBank', sortOrder: 40 },
    { id: 'cat_pension_sipp', name: 'Pension / SIPP', group: 'savings_transfer' as const, isSavingsTransfer: true, icon: 'Coins', sortOrder: 41 },
    { id: 'cat_emergency_fund', name: 'Emergency Fund Savings', group: 'savings_transfer' as const, isSavingsTransfer: true, icon: 'Lock', sortOrder: 42 },
    { id: 'cat_internal_transfer', name: 'Internal Account Transfer', group: 'savings_transfer' as const, isSavingsTransfer: true, icon: 'ArrowLeftRight', sortOrder: 43 },
  ];

  for (const cat of defaultCategories) {
    await db.insert(categories).values(cat).onConflictDoNothing();
  }

  // Common UK Merchant Rules
  const defaultRules = [
    { id: 'rule_tesco', pattern: 'TESCO', patternType: 'contains' as const, categoryId: 'cat_groceries', cleanMerchant: 'Tesco', priority: 10 },
    { id: 'rule_sainsburys', pattern: 'SAINSBURY', patternType: 'contains' as const, categoryId: 'cat_groceries', cleanMerchant: "Sainsbury's", priority: 10 },
    { id: 'rule_asda', pattern: 'ASDA', patternType: 'contains' as const, categoryId: 'cat_groceries', cleanMerchant: 'Asda', priority: 10 },
    { id: 'rule_waitrose', pattern: 'WAITROSE', patternType: 'contains' as const, categoryId: 'cat_groceries', cleanMerchant: 'Waitrose', priority: 10 },
    { id: 'rule_mands', pattern: 'MARKS & SPENCER|M&S', patternType: 'regex' as const, categoryId: 'cat_groceries', cleanMerchant: 'M&S', priority: 10 },
    { id: 'rule_tfl', pattern: 'TFL TRAVEL CH|TRANSPORT FOR LONDON', patternType: 'regex' as const, categoryId: 'cat_transport', cleanMerchant: 'TfL', priority: 10 },
    { id: 'rule_uber', pattern: 'UBER', patternType: 'contains' as const, categoryId: 'cat_transport', cleanMerchant: 'Uber', priority: 10 },
    { id: 'rule_deliveroo', pattern: 'DELIVEROO', patternType: 'contains' as const, categoryId: 'cat_dining_out', cleanMerchant: 'Deliveroo', priority: 10 },
    { id: 'rule_vanguard', pattern: 'VANGUARD', patternType: 'contains' as const, categoryId: 'cat_isa_investments', cleanMerchant: 'Vanguard', priority: 20 },
  ];

  for (const rule of defaultRules) {
    await db.insert(categorizationRules).values(rule).onConflictDoNothing();
  }

  console.log('✅ Seed completed successfully.');
}

if (process.env.RUN_SEED === 'true') {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
