import { describe, it, expect } from 'vitest';
import { detectCSVFormat, parseCSV } from '../../../../src/features/csv-import/parsers';

describe('CSV Format Detection', () => {
  it('detects Chase format', () => {
    const headers = ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount'];
    expect(detectCSVFormat(headers)).toBe('chase');
  });

  it('detects Apple Card format', () => {
    const headers = ['Transaction Date', 'Clearing Date', 'Description', 'Merchant', 'Category', 'Type', 'Amount (USD)'];
    expect(detectCSVFormat(headers)).toBe('apple-card');
  });

  it('returns generic for unknown formats', () => {
    const headers = ['Date', 'Amount', 'Notes'];
    expect(detectCSVFormat(headers)).toBe('generic');
  });
});

describe('parseCSV', () => {
  it('returns error for empty CSV', () => {
    const result = parseCSV([], 'card1');
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toContain('Empty');
  });

  it('returns error for unrecognized format', () => {
    const result = parseCSV([['Date', 'Amount']], 'card1');
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toContain('Unrecognized');
  });
});
