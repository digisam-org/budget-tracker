export interface CategoryBudgetSummary {
  categoryId: string;
  categoryName: string;
  group: 'income' | 'fixed_expense' | 'variable_expense' | 'rental_property' | 'savings_transfer';
  isSavingsTransfer: boolean;
  plannedAmount: number; // in pence
  actualAmount: number; // in pence (absolute positive magnitude for spend/inflow)
  delta: number; // actual - planned (for expenses: positive = over-budget; for income: positive = surplus)
  percentageSpent: number; // actual / planned * 100
}

export interface ZeroBasedBudgetReport {
  year: number;
  month: number;

  // Planned totals
  totalPlannedIncome: number;
  totalPlannedExpenses: number; // Living consumption (fixed + variable)
  totalPlannedSavings: number; // Capital transfers (ISA, Pension, etc.)
  totalPlannedRentalExpenses: number;

  // Zero-based core target (Planned Income - Expenses - Savings)
  toBeAllocated: number;

  // Actual totals
  totalActualIncome: number;
  totalActualExpenses: number;
  totalActualSavings: number;
  totalActualRentalInflow: number;
  totalActualRentalOutflow: number;

  // Financial health KPIs
  actualNetLivingCashflow: number; // Actual Income - Actual Living Expenses
  savingsRate: number; // (Savings / Total Income) * 100
  rentalNetProfit: number; // Rental Inflow - Rental Outflow

  // Detailed breakdown
  categories: CategoryBudgetSummary[];
}

export interface BudgetInputCategory {
  id: string;
  name: string;
  group: 'income' | 'fixed_expense' | 'variable_expense' | 'rental_property' | 'savings_transfer';
  isSavingsTransfer: boolean;
}

export interface BudgetInputPlan {
  categoryId: string;
  plannedAmount: number;
}

export interface BudgetInputTransaction {
  categoryId: string | null;
  amount: number; // In pence (negative = outflow, positive = inflow)
}

export function calculateMonthlyBudget(params: {
  year: number;
  month: number;
  categories: BudgetInputCategory[];
  plans: BudgetInputPlan[];
  transactions: BudgetInputTransaction[];
}): ZeroBasedBudgetReport {
  const { year, month, categories, plans, transactions } = params;

  const planMap = new Map<string, number>();
  for (const p of plans) {
    planMap.set(p.categoryId, p.plannedAmount);
  }

  // Aggregate actuals by category
  const actualMap = new Map<string, number>();
  for (const t of transactions) {
    if (!t.categoryId) continue;
    const current = actualMap.get(t.categoryId) || 0;
    actualMap.set(t.categoryId, current + t.amount);
  }

  const categorySummaries: CategoryBudgetSummary[] = categories.map((cat) => {
    const planned = planMap.get(cat.id) || 0;
    const rawActual = actualMap.get(cat.id) || 0;
    // For expenses, amounts are recorded negative; convert to positive magnitude for reporting
    const actual = cat.group === 'income' ? Math.max(0, rawActual) : Math.abs(rawActual);
    const delta = actual - planned;
    const percentageSpent = planned > 0 ? Math.round((actual / planned) * 100) : 0;

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      group: cat.group,
      isSavingsTransfer: cat.isSavingsTransfer,
      plannedAmount: planned,
      actualAmount: actual,
      delta,
      percentageSpent,
    };
  });

  // Calculate planned aggregates
  const totalPlannedIncome = categorySummaries
    .filter((c) => c.group === 'income')
    .reduce((sum, c) => sum + c.plannedAmount, 0);

  const totalPlannedExpenses = categorySummaries
    .filter((c) => c.group === 'fixed_expense' || c.group === 'variable_expense')
    .reduce((sum, c) => sum + c.plannedAmount, 0);

  const totalPlannedSavings = categorySummaries
    .filter((c) => c.group === 'savings_transfer')
    .reduce((sum, c) => sum + c.plannedAmount, 0);

  const totalPlannedRentalExpenses = categorySummaries
    .filter((c) => c.group === 'rental_property')
    .reduce((sum, c) => sum + c.plannedAmount, 0);

  // Zero-based allocation target
  const toBeAllocated = totalPlannedIncome - (totalPlannedExpenses + totalPlannedSavings + totalPlannedRentalExpenses);

  // Calculate actual aggregates
  const totalActualIncome = categorySummaries
    .filter((c) => c.group === 'income')
    .reduce((sum, c) => sum + c.actualAmount, 0);

  const totalActualExpenses = categorySummaries
    .filter((c) => c.group === 'fixed_expense' || c.group === 'variable_expense')
    .reduce((sum, c) => sum + c.actualAmount, 0);

  const totalActualSavings = categorySummaries
    .filter((c) => c.group === 'savings_transfer')
    .reduce((sum, c) => sum + c.actualAmount, 0);

  const rentalCategories = categorySummaries.filter((c) => c.group === 'rental_property');
  const totalActualRentalOutflow = rentalCategories.reduce((sum, c) => sum + c.actualAmount, 0);
  const rentalIncomeCategory = categorySummaries.find((c) => c.categoryId === 'cat_rental_income');
  const totalActualRentalInflow = rentalIncomeCategory ? rentalIncomeCategory.actualAmount : 0;

  const actualNetLivingCashflow = totalActualIncome - totalActualExpenses;
  const savingsRate =
    totalActualIncome > 0
      ? Math.round((totalActualSavings / totalActualIncome) * 100)
      : 0;

  const rentalNetProfit = totalActualRentalInflow - totalActualRentalOutflow;

  return {
    year,
    month,
    totalPlannedIncome,
    totalPlannedExpenses,
    totalPlannedSavings,
    totalPlannedRentalExpenses,
    toBeAllocated,
    totalActualIncome,
    totalActualExpenses,
    totalActualSavings,
    totalActualRentalInflow,
    totalActualRentalOutflow,
    actualNetLivingCashflow,
    savingsRate,
    rentalNetProfit,
    categories: categorySummaries,
  };
}
