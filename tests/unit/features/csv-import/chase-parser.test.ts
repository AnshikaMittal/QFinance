import { describe, it, expect } from 'vitest';
import { isChaseFormat, parseChaseCSV } from '../../../../src/features/csv-import/parsers/chase';

describe('Chase CSV Parser', () => {
  const CHASE_HEADERS = ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount'];

  describe('isChaseFormat', () => {
    it('detects valid Chase CSV headers', () => {
      expect(isChaseFormat(CHASE_HEADERS)).toBe(true);
    });

    it('handles case-insensitive headers', () => {
      expect(isChaseFormat(CHASE_HEADERS.map(h => h.toLowerCase()))).toBe(true);
    });

    it('rejects non-Chase headers', () => {
      expect(isChaseFormat(['Date', 'Amount', 'Merchant'])).toBe(false);
    });
  });

  describe('parseChaseCSV', () => {
    it('parses valid Chase CSV rows', () => {
      const rows = [
        CHASE_HEADERS,
        ['03/15/2026', '03/16/2026', 'WHOLE FOODS #1234', 'Groceries', 'Sale', '-45.67'],
        ['03/14/2026', '03/15/2026', 'UBER *EATS 800-123-4567', 'Food & Drink', 'Sale', '-23.50'],
      ];

      const result = parseChaseCSV(rows, 'chase-freedom');

      expect(result.transactions).toHaveLength(2);
      expect(result.parseErrors).toHaveLength(0);
      expect(result.parserUsed).toBe('chase');

      const first = result.transactions[0]!;
      expect(first.amount).toBe(45.67);
      expect(first.type).toBe('debit');
      expect(first.cardId).toBe('chase-freedom');
      expect(first.importSource).toBe('csv');
    });

    it('handles payments (positive amounts) as credits', () => {
      const rows = [
        CHASE_HEADERS,
        ['03/10/2026', '03/11/2026', 'PAYMENT RECEIVED', 'Payment', 'Payment', '500.00'],
      ];

      const result = parseChaseCSV(rows, 'chase-freedom');
      expect(result.transactions[0]!.type).toBe('credit');
      expect(result.transactions[0]!.amount).toBe(500);
    });

    it('reports errors for invalid dates', () => {
      const rows = [
        CHASE_HEADERS,
        ['not-a-date', '03/11/2026', 'STORE', 'Shopping', 'Sale', '-10.00'],
      ];

      const result = parseChaseCSV(rows, 'card1');
      expect(result.transactions).toHaveLength(0);
      expect(result.parseErrors).toHaveLength(1);
      expect(result.parseErrors[0]).toContain('invalid date');
    });

    it('reports errors for invalid amounts', () => {
      const rows = [
        CHASE_HEADERS,
        ['03/15/2026', '03/16/2026', 'STORE', 'Shopping', 'Sale', 'abc'],
      ];

      const result = parseChaseCSV(rows, 'card1');
      expect(result.transactions).toHaveLength(0);
      expect(result.parseErrors).toHaveLength(1);
      expect(result.parseErrors[0]).toContain('invalid amount');
    });

    it('skips empty rows', () => {
      const rows = [
        CHASE_HEADERS,
        ['', '', '', '', '', ''],
        ['03/15/2026', '03/16/2026', 'STORE', 'Shopping', 'Sale', '-10.00'],
      ];

      const result = parseChaseCSV(rows, 'card1');
      expect(result.transactions).toHaveLength(1);
    });

    it('cleans merchant names from descriptions', () => {
      const rows = [
        CHASE_HEADERS,
        ['03/15/2026', '03/16/2026', 'UBER *EATS 800-123-4567', 'Food', 'Sale', '-15.00'],
      ];

      const result = parseChaseCSV(rows, 'card1');
      expect(result.transactions[0]!.merchant).toBe('UBER EATS');
    });
  });
});
