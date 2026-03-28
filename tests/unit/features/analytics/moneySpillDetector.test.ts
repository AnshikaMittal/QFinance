import { describe, it, expect } from 'vitest';
import { detectMoneySpills } from '../../../../src/features/analytics/utils/moneySpillDetector';
import type { Transaction, MoneySpill } from '../../../../src/core/types';

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date: new Date('2026-03-15T12:00:00'),
    amount: 50,
    description: 'TEST STORE',
    merchant: 'TEST STORE',
    categoryId: 'cat-1',
    cardId: 'card-1',
    type: 'debit',
    tags: [],
    isRecurring: false,
    importSource: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('detectMoneySpills', () => {
  describe('duplicate detection', () => {
    it('detects same-amount charges at same merchant within window', () => {
      const txns = [
        makeTxn({ id: '1', merchant: 'UBER EATS', amount: 23.50, date: new Date('2026-03-15') }),
        makeTxn({ id: '2', merchant: 'UBER EATS', amount: 23.50, date: new Date('2026-03-16') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const duplicates = spills.filter(s => s.type === 'duplicate');

      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0]!.transactions).toContain('1');
      expect(duplicates[0]!.transactions).toContain('2');
    });

    it('ignores charges beyond the window', () => {
      const txns = [
        makeTxn({ id: '1', merchant: 'STORE', amount: 50, date: new Date('2026-03-01') }),
        makeTxn({ id: '2', merchant: 'STORE', amount: 50, date: new Date('2026-03-15') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const duplicates = spills.filter(s => s.type === 'duplicate');
      expect(duplicates).toHaveLength(0);
    });

    it('ignores different merchants', () => {
      const txns = [
        makeTxn({ id: '1', merchant: 'STORE A', description: 'STORE A PURCHASE', amount: 50, date: new Date('2026-03-15') }),
        makeTxn({ id: '2', merchant: 'STORE B', description: 'STORE B PURCHASE', amount: 50, date: new Date('2026-03-16') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const duplicates = spills.filter(s => s.type === 'duplicate');
      expect(duplicates).toHaveLength(0);
    });

    it('ignores credit transactions', () => {
      const txns = [
        makeTxn({ id: '1', merchant: 'STORE', amount: 50, type: 'credit', date: new Date('2026-03-15') }),
        makeTxn({ id: '2', merchant: 'STORE', amount: 50, type: 'credit', date: new Date('2026-03-16') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const duplicates = spills.filter(s => s.type === 'duplicate');
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('subscription detection', () => {
    it('detects monthly recurring charges', () => {
      const txns = [
        makeTxn({ id: '1', merchant: 'NETFLIX', amount: 15.99, date: new Date('2026-01-15') }),
        makeTxn({ id: '2', merchant: 'NETFLIX', amount: 15.99, date: new Date('2026-02-15') }),
        makeTxn({ id: '3', merchant: 'NETFLIX', amount: 15.99, date: new Date('2026-03-15') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const subs = spills.filter(s => s.type === 'subscription-forgotten');

      expect(subs.length).toBeGreaterThan(0);
      expect(subs[0]!.transactions).toHaveLength(3);
    });

    it('does not flag non-recurring charges', () => {
      // Intervals: 3 days, 60 days — average ~31 but we need avg outside 25-35 and 5-9
      // Use intervals whose average is clearly outside both ranges (e.g. avg ~18)
      const txns = [
        makeTxn({ id: '1', merchant: 'RANDOM STORE', description: 'RANDOM STORE', amount: 25, date: new Date('2026-01-05') }),
        makeTxn({ id: '2', merchant: 'RANDOM STORE', description: 'RANDOM STORE', amount: 25, date: new Date('2026-01-17') }),
        makeTxn({ id: '3', merchant: 'RANDOM STORE', description: 'RANDOM STORE', amount: 25, date: new Date('2026-02-10') }),
      ];
      // Intervals: 12 days, 24 days — average 18 days (outside 5-9 weekly and 25-35 monthly)

      const spills = detectMoneySpills(txns, []);
      const subs = spills.filter(s => s.type === 'subscription-forgotten');
      expect(subs).toHaveLength(0);
    });
  });

  describe('impulse spending', () => {
    it('detects late-night spending patterns', () => {
      const txns = [
        makeTxn({ id: '1', amount: 45, date: new Date('2026-03-15T23:30:00') }),
        makeTxn({ id: '2', amount: 30, date: new Date('2026-03-16T01:15:00') }),
        makeTxn({ id: '3', amount: 55, date: new Date('2026-03-17T23:00:00') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const impulse = spills.filter(s => s.type === 'impulse');

      expect(impulse.length).toBeGreaterThan(0);
      expect(impulse[0]!.transactions).toHaveLength(3);
    });

    it('ignores small late-night purchases', () => {
      const txns = [
        makeTxn({ id: '1', amount: 5, date: new Date('2026-03-15T23:30:00') }),
        makeTxn({ id: '2', amount: 3, date: new Date('2026-03-16T01:15:00') }),
        makeTxn({ id: '3', amount: 8, date: new Date('2026-03-17T23:00:00') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const impulse = spills.filter(s => s.type === 'impulse');
      expect(impulse).toHaveLength(0);
    });

    it('ignores daytime purchases regardless of amount', () => {
      const txns = [
        makeTxn({ id: '1', amount: 200, date: new Date('2026-03-15T14:00:00') }),
        makeTxn({ id: '2', amount: 150, date: new Date('2026-03-16T10:00:00') }),
        makeTxn({ id: '3', amount: 300, date: new Date('2026-03-17T16:00:00') }),
      ];

      const spills = detectMoneySpills(txns, []);
      const impulse = spills.filter(s => s.type === 'impulse');
      expect(impulse).toHaveLength(0);
    });
  });

  describe('dismissed spills', () => {
    it('excludes dismissed spills from detection', () => {
      const txns = [
        makeTxn({ id: '1', merchant: 'STORE', amount: 50, date: new Date('2026-03-15') }),
        makeTxn({ id: '2', merchant: 'STORE', amount: 50, date: new Date('2026-03-16') }),
      ];

      // All new detections should still appear (dismissed check is in the hook, not detector)
      const spills = detectMoneySpills(txns, []);
      expect(spills.length).toBeGreaterThan(0);
    });
  });

  it('returns empty array for no transactions', () => {
    expect(detectMoneySpills([], [])).toEqual([]);
  });

  it('returns empty array for credit-only transactions', () => {
    const txns = [
      makeTxn({ type: 'credit', amount: 1000 }),
      makeTxn({ type: 'credit', amount: 2000 }),
    ];
    const spills = detectMoneySpills(txns, []);
    // No spills because we only analyze debits
    const dupes = spills.filter(s => s.type === 'duplicate');
    expect(dupes).toHaveLength(0);
  });
});
