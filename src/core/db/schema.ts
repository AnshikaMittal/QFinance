import Dexie, { type EntityTable } from 'dexie';
import type { Transaction, Category, Card, Budget, MoneySpill, AppSettings } from '../types';

export class QuickFinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  moneySpills!: EntityTable<MoneySpill, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('QuickFinanceDB');

    this.version(1).stores({
      transactions: 'id, date, categoryId, cardId, type, isRecurring, importSource, merchant, [cardId+date], [categoryId+date]',
      categories: 'id, name, parentId, isDefault',
      cards: 'id, issuer, name',
      budgets: 'id, categoryId, period, isActive',
      moneySpills: 'id, type, isDismissed, detectedAt',
      settings: 'id',
    });

    // v2: Add resolution tracking to money spills
    this.version(2).stores({
      transactions: 'id, date, categoryId, cardId, type, isRecurring, importSource, merchant, [cardId+date], [categoryId+date]',
      categories: 'id, name, parentId, isDefault',
      cards: 'id, issuer, name',
      budgets: 'id, categoryId, period, isActive',
      moneySpills: 'id, type, isDismissed, detectedAt, resolution',
      settings: 'id',
    }).upgrade(tx => {
      return tx.table('moneySpills').toCollection().modify(spill => {
        if (!spill.resolution) {
          spill.resolution = spill.isDismissed ? 'resolved' : 'unresolved';
        }
      });
    });
  }
}

export const db = new QuickFinanceDB();
