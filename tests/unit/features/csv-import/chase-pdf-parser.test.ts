/**
 * Tests for Chase PDF statement parser.
 *
 * Tests the text-based parsing logic (not PDF extraction).
 * We pass in pre-extracted text lines that simulate Chase statement layouts.
 */

import { describe, it, expect } from 'vitest';
import { isChasePDF, parseChasePDF } from '../../../../src/features/csv-import/parsers/pdf/chase-pdf';

describe('Chase PDF Detection', () => {
  it('detects a Chase credit card statement', () => {
    const lines = [
      'CHASE',
      'Account Number: ...1234',
      'Payment Due Date: 04/15/2026',
      'New Balance: $1,234.56',
      '',
      'ACCOUNT ACTIVITY',
      '03/01  03/02  STARBUCKS STORE 12345       4.75',
      '03/03  03/04  AMAZON MARKETPLACE           29.99',
    ];
    expect(isChasePDF(lines)).toBe(true);
  });

  it('rejects non-Chase statements', () => {
    const lines = [
      'Apple Card',
      'Goldman Sachs Bank USA',
      'March 2026 Statement',
      'Daily Cash Summary',
    ];
    expect(isChasePDF(lines)).toBe(false);
  });

  it('rejects random text', () => {
    const lines = [
      'Hello world',
      'This is not a statement',
      'Just some random text',
    ];
    expect(isChasePDF(lines)).toBe(false);
  });
});

describe('Chase PDF Parsing', () => {
  it('parses standard transaction lines', () => {
    const lines = [
      'Chase Credit Card Statement',
      'Statement Date: 03/31/2026',
      'Account Number: ...1234',
      'New Balance: $500.00',
      '',
      'ACCOUNT ACTIVITY',
      '03/15  03/16  UBER *EATS 800-123-4567   42.50',
      '03/18  03/19  AMAZON.COM AMZN.COM/BILL   29.99',
      '03/20  03/21  STARBUCKS STORE 12345        4.75',
    ];

    const result = parseChasePDF(lines, 'card-1');

    expect(result.parserUsed).toBe('chase-pdf');
    expect(result.transactions).toHaveLength(3);
    expect(result.parseErrors).toHaveLength(0);

    const first = result.transactions[0];
    expect(first).toBeDefined();
    expect(first!.amount).toBe(42.50);
    expect(first!.type).toBe('debit');
    expect(first!.cardId).toBe('card-1');
    expect(first!.importSource).toBe('pdf');
  });

  it('infers year from statement text', () => {
    const lines = [
      'Statement Date: 03/15/2026',
      '03/10  03/11  COFFEE SHOP   5.00',
    ];

    const result = parseChasePDF(lines, 'card-1');
    expect(result.transactions).toHaveLength(1);

    const txn = result.transactions[0];
    expect(txn).toBeDefined();
    expect(txn!.date.getFullYear()).toBe(2026);
    expect(txn!.date.getMonth()).toBe(2); // March = 2
    expect(txn!.date.getDate()).toBe(10);
  });

  it('handles payments/credits section', () => {
    const lines = [
      'Statement Date: 03/31/2026',
      'PURCHASES',
      '03/10  03/11  GROCERY STORE   50.00',
      '',
      'PAYMENTS AND OTHER CREDITS',
      '03/15  03/16  AUTOMATIC PAYMENT THANK YOU   -200.00',
    ];

    const result = parseChasePDF(lines, 'card-1');
    expect(result.transactions).toHaveLength(2);

    const purchase = result.transactions[0];
    expect(purchase).toBeDefined();
    expect(purchase!.type).toBe('debit');

    const payment = result.transactions[1];
    expect(payment).toBeDefined();
    expect(payment!.type).toBe('credit');
  });

  it('cleans merchant names (phone numbers, asterisks)', () => {
    const lines = [
      'Statement Date: 03/31/2026',
      '03/15  03/16  UBER *EATS 800-123-4567   42.50',
    ];

    const result = parseChasePDF(lines, 'card-1');
    const txn = result.transactions[0];
    expect(txn).toBeDefined();
    expect(txn!.merchant).not.toContain('800-123-4567');
    expect(txn!.merchant).not.toContain('*');
  });

  it('handles amounts with dollar signs and commas', () => {
    const lines = [
      'Statement Date: 03/31/2026',
      '03/15  03/16  EXPENSIVE PURCHASE   $1,234.56',
    ];

    const result = parseChasePDF(lines, 'card-1');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.amount).toBe(1234.56);
  });

  it('returns empty for non-transaction lines', () => {
    const lines = [
      'Chase Credit Card Statement',
      'Summary of charges',
      'Your credit limit is $5,000',
      'Minimum payment due: $25.00',
    ];

    const result = parseChasePDF(lines, 'card-1');
    expect(result.transactions).toHaveLength(0);
  });

  it('handles single-date format lines', () => {
    const lines = [
      'Statement Date: 03/31/2026',
      '03/15  COFFEE SHOP   5.00',
    ];

    const result = parseChasePDF(lines, 'card-1');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.amount).toBe(5.00);
  });
});
