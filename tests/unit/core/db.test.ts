import { describe, it, expect, beforeEach } from 'vitest';
import { QuickFinanceDB } from '../../../src/core/db/schema';

describe('QuickFinanceDB', () => {
  let db: QuickFinanceDB;

  beforeEach(() => {
    db = new QuickFinanceDB();
  });

  it('creates database with correct name', () => {
    expect(db.name).toBe('QuickFinanceDB');
  });

  it('has all required tables', () => {
    expect(db.transactions).toBeDefined();
    expect(db.categories).toBeDefined();
    expect(db.cards).toBeDefined();
    expect(db.budgets).toBeDefined();
    expect(db.moneySpills).toBeDefined();
    expect(db.settings).toBeDefined();
  });
});
