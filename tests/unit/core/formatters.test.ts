import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatPercent, truncate } from '../../../src/core/utils/formatters';

describe('formatCurrency', () => {
  it('formats positive USD amounts', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats negative amounts', () => {
    expect(formatCurrency(-50.99)).toBe('-$50.99');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(10.999)).toBe('$11.00');
  });
});

describe('formatDate', () => {
  it('formats date in short format', () => {
    // Use explicit time to avoid UTC/local timezone date shift
    const date = new Date(2026, 2, 15); // March 15, 2026 in local time
    const result = formatDate(date, 'short');
    // Intl short format produces "3/15/26" (2-digit year)
    expect(result).toBe('3/15/26');
  });

  it('formats date in ISO format', () => {
    const date = new Date('2026-03-15T12:00:00Z');
    expect(formatDate(date, 'iso')).toBe('2026-03-15');
  });
});

describe('formatPercent', () => {
  it('formats decimal as percentage', () => {
    expect(formatPercent(0.5)).toBe('50.0%');
  });

  it('formats with custom decimals', () => {
    expect(formatPercent(0.3333, 2)).toBe('33.33%');
  });

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('truncate', () => {
  it('returns string unchanged if shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});
