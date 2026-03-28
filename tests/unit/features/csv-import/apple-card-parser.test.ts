import { describe, it, expect } from 'vitest';
import { isAppleCardFormat, parseAppleCardCSV } from '../../../../src/features/csv-import/parsers/apple-card';

describe('Apple Card CSV Parser', () => {
  const APPLE_HEADERS = ['Transaction Date', 'Clearing Date', 'Description', 'Merchant', 'Category', 'Type', 'Amount'];

  describe('isAppleCardFormat', () => {
    it('detects valid Apple Card headers', () => {
      expect(isAppleCardFormat(APPLE_HEADERS)).toBe(true);
    });

    it('detects Apple Card headers with Amount (USD) variant', () => {
      const headers = [...APPLE_HEADERS.slice(0, -1), 'Amount (USD)'];
      expect(isAppleCardFormat(headers)).toBe(true);
    });

    it('rejects non-Apple headers', () => {
      expect(isAppleCardFormat(['Date', 'Amount', 'Vendor'])).toBe(false);
    });
  });

  describe('parseAppleCardCSV', () => {
    it('parses valid Apple Card rows', () => {
      const rows = [
        APPLE_HEADERS,
        ['03/15/2026', '03/16/2026', 'Apple Store Purchase', 'Apple Store', 'Shopping', 'Purchase', '129.99'],
      ];

      const result = parseAppleCardCSV(rows, 'apple-card');
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]!.amount).toBe(129.99);
      expect(result.transactions[0]!.type).toBe('debit');
      expect(result.transactions[0]!.merchant).toBe('Apple Store');
      expect(result.parserUsed).toBe('apple-card');
    });

    it('handles payment rows as credits', () => {
      const rows = [
        APPLE_HEADERS,
        ['03/10/2026', '03/11/2026', 'Payment', '', 'Payment', 'Payment', '-500.00'],
      ];

      const result = parseAppleCardCSV(rows, 'apple-card');
      expect(result.transactions[0]!.type).toBe('credit');
    });

    it('reports invalid dates', () => {
      const rows = [
        APPLE_HEADERS,
        ['bad-date', '03/11/2026', 'Store', 'Store', 'Shopping', 'Purchase', '10.00'],
      ];

      const result = parseAppleCardCSV(rows, 'apple-card');
      expect(result.transactions).toHaveLength(0);
      expect(result.parseErrors.length).toBeGreaterThan(0);
    });
  });
});
