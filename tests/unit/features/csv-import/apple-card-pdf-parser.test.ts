/**
 * Tests for Apple Card PDF statement parser.
 */

import { describe, it, expect } from 'vitest';
import { isAppleCardPDF, parseAppleCardPDF } from '../../../../src/features/csv-import/parsers/pdf/apple-card-pdf';

describe('Apple Card PDF Detection', () => {
  it('detects an Apple Card statement', () => {
    const lines = [
      'Apple Card',
      'Goldman Sachs Bank USA',
      'Monthly Statement — March 2026',
      'Daily Cash Summary',
      'March 15, 2026  STARBUCKS  $4.75  2% Daily Cash',
    ];
    expect(isAppleCardPDF(lines)).toBe(true);
  });

  it('rejects non-Apple statements', () => {
    const lines = [
      'CHASE',
      'Account Number: ...1234',
      'Payment Due Date: 04/15/2026',
      '03/01  03/02  STARBUCKS   4.75',
    ];
    expect(isAppleCardPDF(lines)).toBe(false);
  });

  it('rejects random text', () => {
    const lines = [
      'Hello world',
      'Not a credit card statement at all',
    ];
    expect(isAppleCardPDF(lines)).toBe(false);
  });
});

describe('Apple Card PDF Parsing', () => {
  it('parses long date format (Month DD, YYYY)', () => {
    const lines = [
      'Apple Card',
      'Goldman Sachs Bank USA',
      'Transactions',
      'March 15, 2026  UBER EATS  $42.50  3% Daily Cash',
      'March 18, 2026  AMAZON.COM  $29.99  2% Daily Cash',
      'March 20, 2026  STARBUCKS  $4.75  2% Daily Cash',
    ];

    const result = parseAppleCardPDF(lines, 'card-2');

    expect(result.parserUsed).toBe('apple-card-pdf');
    expect(result.transactions).toHaveLength(3);
    expect(result.parseErrors).toHaveLength(0);

    const first = result.transactions[0];
    expect(first).toBeDefined();
    expect(first!.amount).toBe(42.50);
    expect(first!.type).toBe('debit');
    expect(first!.importSource).toBe('pdf');
  });

  it('parses short date format (MM/DD/YYYY)', () => {
    const lines = [
      'Apple Card Statement 2026',
      '03/15/2026  COFFEE SHOP  $5.00',
      '03/18/2026  GROCERY STORE  $45.00',
    ];

    const result = parseAppleCardPDF(lines, 'card-2');
    expect(result.transactions).toHaveLength(2);

    const txn = result.transactions[0];
    expect(txn).toBeDefined();
    expect(txn!.date.getMonth()).toBe(2); // March
    expect(txn!.date.getDate()).toBe(15);
  });

  it('parses no-year date format (MM/DD)', () => {
    const lines = [
      'Apple Card Statement March 2026',
      '03/15  COFFEE SHOP  $5.00',
    ];

    const result = parseAppleCardPDF(lines, 'card-2');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.date.getFullYear()).toBe(2026);
  });

  it('handles payments section', () => {
    const lines = [
      'Apple Card Statement 2026',
      'Transactions',
      'March 15, 2026  STARBUCKS  $4.75',
      '',
      'Payments',
      'March 20, 2026  PAYMENT RECEIVED  $500.00',
    ];

    const result = parseAppleCardPDF(lines, 'card-2');
    expect(result.transactions).toHaveLength(2);

    const purchase = result.transactions[0];
    expect(purchase).toBeDefined();
    expect(purchase!.type).toBe('debit');

    const payment = result.transactions[1];
    expect(payment).toBeDefined();
    expect(payment!.type).toBe('credit');
  });

  it('strips Daily Cash text from merchant names', () => {
    const lines = [
      'Apple Card 2026',
      'March 15, 2026  UBER EATS  $42.50  3% Daily Cash',
    ];

    const result = parseAppleCardPDF(lines, 'card-2');
    const txn = result.transactions[0];
    expect(txn).toBeDefined();
    expect(txn!.merchant).not.toContain('Daily Cash');
    expect(txn!.merchant).not.toContain('3%');
  });

  it('handles amounts with commas', () => {
    const lines = [
      'Apple Card 2026',
      'March 15, 2026  BIG PURCHASE  $1,234.56',
    ];

    const result = parseAppleCardPDF(lines, 'card-2');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.amount).toBe(1234.56);
  });

  it('returns empty for header-only content', () => {
    const lines = [
      'Apple Card',
      'Goldman Sachs Bank USA',
      'Your statement is ready',
      'Total balance: $1,000',
    ];

    const result = parseAppleCardPDF(lines, 'card-2');
    expect(result.transactions).toHaveLength(0);
  });
});
