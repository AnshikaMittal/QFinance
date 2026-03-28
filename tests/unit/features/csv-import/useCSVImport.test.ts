import { describe, it, expect } from 'vitest';
import { parseCSVText } from '../../../../src/features/csv-import/utils/csvReader';
import { parseCSV, detectCSVFormat } from '../../../../src/features/csv-import/parsers';

describe('CSV Import Integration', () => {
  it('parses Chase CSV text end-to-end', () => {
    const text = 'Transaction Date,Post Date,Description,Category,Type,Amount\n03/15/2026,03/16/2026,WHOLE FOODS,Groceries,Sale,-45.67';
    const rows = parseCSVText(text);
    const headers = rows[0] ?? [];

    expect(detectCSVFormat(headers)).toBe('chase');

    const result = parseCSV(rows, 'chase-card');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.amount).toBe(45.67);
    expect(result.transactions[0]!.type).toBe('debit');
    expect(result.parserUsed).toBe('chase');
  });

  it('handles multi-row Chase CSV', () => {
    const text = [
      'Transaction Date,Post Date,Description,Category,Type,Amount',
      '03/15/2026,03/16/2026,WHOLE FOODS,Groceries,Sale,-45.67',
      '03/14/2026,03/15/2026,UBER *EATS,Food & Drink,Sale,-23.50',
      '03/13/2026,03/14/2026,PAYMENT RECEIVED,Payment,Payment,500.00',
    ].join('\n');

    const rows = parseCSVText(text);
    const result = parseCSV(rows, 'chase-card');

    expect(result.transactions).toHaveLength(3);

    // Verify debits
    const debits = result.transactions.filter(t => t.type === 'debit');
    expect(debits).toHaveLength(2);

    // Verify credit (payment)
    const credits = result.transactions.filter(t => t.type === 'credit');
    expect(credits).toHaveLength(1);
    expect(credits[0]!.amount).toBe(500);
  });

  it('returns error for unrecognized format', () => {
    const text = 'Date,Amount,Note\n2026-03-15,50,test';
    const rows = parseCSVText(text);
    const result = parseCSV(rows, 'card');

    expect(result.transactions).toHaveLength(0);
    expect(result.parseErrors.length).toBeGreaterThan(0);
    expect(result.parserUsed).toBe('generic');
  });
});
