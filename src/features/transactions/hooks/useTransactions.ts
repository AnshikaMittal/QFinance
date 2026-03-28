import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from '../../../core/types';

export function useTransactions(options?: { limit?: number; cardId?: string; categoryId?: string }) {
  const transactions = useLiveQuery(async () => {
    const query = db.transactions.orderBy('date').reverse();

    const all = await query.toArray();

    let filtered = all;
    if (options?.cardId) {
      filtered = filtered.filter((t) => t.cardId === options.cardId);
    }
    if (options?.categoryId) {
      filtered = filtered.filter((t) => t.categoryId === options.categoryId);
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }, [options?.limit, options?.cardId, options?.categoryId]);

  const addTransaction = async (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date();
    await db.transactions.add({
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    });
  };

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    await db.transactions.update(id, { ...data, updatedAt: new Date() });
  };

  const deleteTransaction = async (id: string) => {
    await db.transactions.delete(id);
  };

  return { transactions: transactions ?? [], addTransaction, updateTransaction, deleteTransaction };
}
