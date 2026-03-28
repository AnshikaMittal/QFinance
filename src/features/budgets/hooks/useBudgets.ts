import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../core/db';
import type { Budget } from '../../../core/types';

interface BudgetWithSpent extends Budget {
  spent: number;
  remaining: number;
  percentUsed: number;
  categoryName: string;
  categoryColor: string;
}

export function useBudgets() {
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? [];

  const budgetsWithSpent: BudgetWithSpent[] = budgets
    .filter(b => b.isActive)
    .map(budget => {
      const category = categories.find(c => c.id === budget.categoryId);
      const { start, end } = getBudgetPeriodRange(budget);

      const spent = transactions
        .filter(t => t.type === 'debit' && t.categoryId === budget.categoryId && t.date >= start && t.date <= end)
        .reduce((sum, t) => sum + t.amount, 0);

      const remaining = Math.max(0, budget.amount - spent);
      const percentUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

      return {
        ...budget,
        spent,
        remaining,
        percentUsed: Math.min(percentUsed, 100),
        categoryName: category?.name ?? 'Unknown',
        categoryColor: category?.color ?? '#6b7280',
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);

  const addBudget = useCallback(async (data: { categoryId: string; amount: number; period: Budget['period'] }) => {
    const now = new Date();
    await db.budgets.add({
      id: uuidv4(),
      ...data,
      startDate: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }, []);

  const removeBudget = useCallback(async (id: string) => {
    await db.budgets.update(id, { isActive: false, updatedAt: new Date() });
  }, []);

  const updateBudget = useCallback(async (id: string, amount: number) => {
    await db.budgets.update(id, { amount, updatedAt: new Date() });
  }, []);

  return { budgets: budgetsWithSpent, categories, addBudget, removeBudget, updateBudget };
}

function getBudgetPeriodRange(budget: Budget): { start: Date; end: Date } {
  const now = new Date();
  switch (budget.period) {
    case 'weekly': {
      const dayOfWeek = now.getDay();
      const start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'monthly': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'yearly': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
  }
}
