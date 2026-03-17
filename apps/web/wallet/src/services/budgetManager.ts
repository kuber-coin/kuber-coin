// Budget Manager Service
// Track spending limits and budgets

export interface Budget {
  id: string;
  name: string;
  category: string;
  limit: number;
  period: 'daily' | 'weekly' | 'monthly';
  spent: number;
  startDate: number;
  endDate: number;
  alertThreshold: number; // Percentage (e.g., 80)
}

class BudgetManagerService {
  private budgets: Map<string, Budget> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_budgets';

  constructor() {
    this.loadBudgets();
  }

  private loadBudgets() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      const budgets = JSON.parse(stored);
      budgets.forEach((b: Budget) => this.budgets.set(b.id, b));
    }
  }

  private saveBudgets() {
    const budgets = Array.from(this.budgets.values());
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(budgets));
  }

  createBudget(
    name: string,
    category: string,
    limit: number,
    period: 'daily' | 'weekly' | 'monthly',
    alertThreshold: number = 80
  ): Budget {
    const now = Date.now();
    const budget: Budget = {
      id: `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      category,
      limit,
      period,
      spent: 0,
      startDate: now,
      endDate: this.calculateEndDate(now, period),
      alertThreshold,
    };

    this.budgets.set(budget.id, budget);
    this.saveBudgets();
    return budget;
  }

  private calculateEndDate(startDate: number, period: 'daily' | 'weekly' | 'monthly'): number {
    const date = new Date(startDate);
    switch (period) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
    }
    return date.getTime();
  }

  getBudgets(): Budget[] {
    return Array.from(this.budgets.values());
  }

  addSpending(budgetId: string, amount: number): void {
    const budget = this.budgets.get(budgetId);
    if (!budget) throw new Error('Budget not found');

    budget.spent += amount;
    this.saveBudgets();

    // Check if alert threshold reached
    const percentageUsed = (budget.spent / budget.limit) * 100;
    if (percentageUsed >= budget.alertThreshold) {
      console.warn(`Budget "${budget.name}" has reached ${percentageUsed.toFixed(0)}% of limit`);
    }
  }

  deleteBudget(id: string): void {
    this.budgets.delete(id);
    this.saveBudgets();
  }

  resetBudget(id: string): void {
    const budget = this.budgets.get(id);
    if (!budget) throw new Error('Budget not found');

    budget.spent = 0;
    budget.startDate = Date.now();
    budget.endDate = this.calculateEndDate(budget.startDate, budget.period);
    this.saveBudgets();
  }
}

const budgetManager = new BudgetManagerService();
export default budgetManager;
