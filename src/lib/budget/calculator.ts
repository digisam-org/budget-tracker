export interface CategoryBudgetSummary {
  categoryId: string;
  categoryName: string;
  type: 'income' | 'expenses' | 'savings';
  subgroup?: string | null;
  isSavingsTransfer: boolean;
  plannedAmount: number; // in pence
  actualAmount: number; // in pence (absolute magnitude)
  delta: number; // actual - planned (for expenses/savings: positive = over-budget; for income: positive = surplus)
  percentageSpent: number; // actual / planned * 100
}

export interface ZeroBasedBudgetReport {
  year: number;
  month: number | null; // null represents 'Total Year'

  // Planned totals
  totalPlannedIncome: number;
  totalPlannedExpenses: number;
  totalPlannedSavings: number;

  // Zero-Based target for planning: Income - (Expenses + Savings)
  toBeAllocated: number;

  // Actual (Tracked) totals
  totalActualIncome: number;
  totalActualExpenses: number;
  totalActualSavings: number;

  // Actual Tracking Balance: Tracked Income - (Tracked Expenses + Tracked Savings)
  periodTrackingBalance: number;
  balanceAnalysisText: string;

  // Savings rate KPI (% of Income)
  savingsRate: number;
  savingsRateFormula: string;

  // Subgroup summaries (e.g. Rental Property, Living Costs, Fixed Bills)
  rentalNetProfit: number;
  rentalIncome: number;
  rentalExpenses: number;

  // Detailed categories
  categories: CategoryBudgetSummary[];
}

export interface BudgetInputCategory {
  id: string;
  name: string;
  type: 'income' | 'expenses' | 'savings';
  subgroup?: string | null;
  isSavingsTransfer: boolean;
}

export interface BudgetInputPlan {
  categoryId: string;
  year: number;
  month: number;
  plannedAmount: number;
}

export interface BudgetInputTransaction {
  categoryId: string | null;
  date: string;
  effectiveDate?: string | null;
  type?: 'income' | 'expenses' | 'savings';
  amount: number; // Minor units (in pence)
}

export function calculateMonthlyBudget(params: {
  year: number;
  month: number | null; // null = Total Year
  categories: BudgetInputCategory[];
  plans: BudgetInputPlan[];
  transactions: BudgetInputTransaction[];
  shiftLateIncome?: boolean;
  lateIncomeDay?: number;
  savingsRateType?: 'active' | 'passive';
}): ZeroBasedBudgetReport {
  const {
    year,
    month,
    categories,
    plans,
    transactions,
    savingsRateType = 'active',
  } = params;

  // 1. Filter plans by year and month (or sum across all 12 months for Total Year)
  const planMap = new Map<string, number>();
  for (const p of plans) {
    if (p.year !== year) continue;
    if (month !== null && p.month !== month) continue;

    const current = planMap.get(p.categoryId) || 0;
    planMap.set(p.categoryId, current + p.plannedAmount);
  }

  // 2. Filter transactions by period using effectiveDate (or fallback to date)
  const actualMap = new Map<string, number>();
  for (const t of transactions) {
    if (!t.categoryId) continue;

    const targetDate = t.effectiveDate || t.date;
    const [txYearStr, txMonthStr] = targetDate.split('-');
    const txYear = parseInt(txYearStr, 10);
    const txMonth = parseInt(txMonthStr, 10);

    if (txYear !== year) continue;
    if (month !== null && txMonth !== month) continue;

    const current = actualMap.get(t.categoryId) || 0;
    actualMap.set(t.categoryId, current + t.amount);
  }

  // 3. Compute per-category summaries
  const categorySummaries: CategoryBudgetSummary[] = categories.map((cat) => {
    const planned = planMap.get(cat.id) || 0;
    const rawActual = actualMap.get(cat.id) || 0;

    // In minor units: Income is recorded positive; Expenses & Savings are negative
    const actual = cat.type === 'income' ? Math.max(0, rawActual) : Math.abs(rawActual);
    const delta = actual - planned;
    const percentageSpent = planned > 0 ? Math.round((actual / planned) * 100) : 0;

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      type: cat.type,
      subgroup: cat.subgroup,
      isSavingsTransfer: cat.isSavingsTransfer,
      plannedAmount: planned,
      actualAmount: actual,
      delta,
      percentageSpent,
    };
  });

  // 4. Totals for Planned
  const totalPlannedIncome = categorySummaries
    .filter((c) => c.type === 'income')
    .reduce((sum, c) => sum + c.plannedAmount, 0);

  const totalPlannedExpenses = categorySummaries
    .filter((c) => c.type === 'expenses')
    .reduce((sum, c) => sum + c.plannedAmount, 0);

  const totalPlannedSavings = categorySummaries
    .filter((c) => c.type === 'savings')
    .reduce((sum, c) => sum + c.plannedAmount, 0);

  // Zero-Based Target: Income - (Expenses + Savings)
  const toBeAllocated = totalPlannedIncome - (totalPlannedExpenses + totalPlannedSavings);

  // 5. Totals for Actual (Tracked)
  const totalActualIncome = categorySummaries
    .filter((c) => c.type === 'income')
    .reduce((sum, c) => sum + c.actualAmount, 0);

  const totalActualExpenses = categorySummaries
    .filter((c) => c.type === 'expenses')
    .reduce((sum, c) => sum + c.actualAmount, 0);

  const totalActualSavings = categorySummaries
    .filter((c) => c.type === 'savings')
    .reduce((sum, c) => sum + c.actualAmount, 0);

  // Period Tracking Balance
  const periodTrackingBalance = totalActualIncome - (totalActualExpenses + totalActualSavings);
  const balanceAnalysisText =
    periodTrackingBalance >= 0
      ? 'of tracked income left to be allocated'
      : 'allocated not covered by income';

  // Savings Rate KPI calculation (Active vs Passive from Excel Settings)
  let savingsRate = 0;
  let savingsRateFormula = 'Savings / Income';

  if (savingsRateType === 'active') {
    savingsRateFormula = 'Tracked Savings / Tracked Income';
    if (totalActualIncome > 0) {
      savingsRate = Math.round((totalActualSavings / totalActualIncome) * 100);
    }
  } else {
    savingsRateFormula = '(Tracked Income - Tracked Expenses) / Tracked Income';
    if (totalActualIncome > 0) {
      savingsRate = Math.round(
        ((totalActualIncome - totalActualExpenses) / totalActualIncome) * 100
      );
    }
  }

  // Rental Property Segregated Performance (Glasgow Flat)
  const rentalIncomeCat = categorySummaries.find(
    (c) => c.categoryName.toLowerCase().includes('glasgow') || c.categoryName.toLowerCase().includes('rental')
  );
  const rentalIncome = rentalIncomeCat ? rentalIncomeCat.actualAmount : 0;
  const rentalExpensesCat = categorySummaries.find(
    (c) => c.categoryId === 'cat_housing' && c.categoryName.toLowerCase().includes('glasgow')
  );
  const rentalExpenses = rentalExpensesCat ? rentalExpensesCat.actualAmount : 0;
  const rentalNetProfit = rentalIncome - rentalExpenses;

  return {
    year,
    month,
    totalPlannedIncome,
    totalPlannedExpenses,
    totalPlannedSavings,
    toBeAllocated,
    totalActualIncome,
    totalActualExpenses,
    totalActualSavings,
    periodTrackingBalance,
    balanceAnalysisText,
    savingsRate,
    savingsRateFormula,
    rentalNetProfit,
    rentalIncome,
    rentalExpenses,
    categories: categorySummaries,
  };
}
