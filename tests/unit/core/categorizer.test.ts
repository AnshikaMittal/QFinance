import { describe, it, expect } from 'vitest';
import { autoCategorize, bulkCategorize } from '../../../src/core/utils/categorizer';
import type { Category } from '../../../src/core/types';

const mockCategories: Category[] = [
  { id: 'cat-groceries', name: 'Groceries', icon: 'cart', color: '#22c55e', keywords: ['whole foods', 'trader joe', 'safeway', 'kroger', 'walmart', 'costco'], isDefault: true, createdAt: new Date() },
  { id: 'cat-dining', name: 'Dining', icon: 'utensils', color: '#f97316', keywords: ['restaurant', 'doordash', 'uber eats', 'grubhub', 'mcdonald', 'starbucks', 'chipotle'], isDefault: true, createdAt: new Date() },
  { id: 'cat-transport', name: 'Transport', icon: 'car', color: '#3b82f6', keywords: ['uber', 'lyft', 'gas', 'shell', 'chevron', 'parking'], isDefault: true, createdAt: new Date() },
  { id: 'cat-shopping', name: 'Shopping', icon: 'bag', color: '#a855f7', keywords: ['amazon', 'ebay', 'best buy', 'nike', 'apple store'], isDefault: true, createdAt: new Date() },
  { id: 'cat-entertainment', name: 'Entertainment', icon: 'film', color: '#ec4899', keywords: ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'cinema'], isDefault: true, createdAt: new Date() },
  { id: 'cat-bills', name: 'Bills & Utilities', icon: 'zap', color: '#eab308', keywords: ['electric', 'water', 'internet', 'phone', 'insurance', 'rent'], isDefault: true, createdAt: new Date() },
  { id: 'cat-other', name: 'Other', icon: 'more', color: '#6b7280', keywords: [], isDefault: true, createdAt: new Date() },
];

describe('autoCategorize', () => {
  it('matches merchant name to category keyword', () => {
    const result = autoCategorize('WHOLE FOODS MARKET', 'WHOLE FOODS MARKET #12345', mockCategories);
    expect(result).toBe('cat-groceries');
  });

  it('matches case-insensitively', () => {
    const result = autoCategorize('Starbucks', 'STARBUCKS STORE 12345', mockCategories);
    expect(result).toBe('cat-dining');
  });

  it('matches description when merchant has no match', () => {
    const result = autoCategorize('SQ *LOCALCAFE', 'SQ *LOCALCAFE uber eats order', mockCategories);
    expect(result).toBe('cat-dining');
  });

  it('prefers longer keyword matches (more specific)', () => {
    // "uber eats" (9 chars) should beat "uber" (4 chars)
    const result = autoCategorize('UBER EATS', 'UBER EATS delivery', mockCategories);
    expect(result).toBe('cat-dining'); // "uber eats" is a Dining keyword
  });

  it('falls back to Other when no keywords match', () => {
    const result = autoCategorize('RANDOM VENDOR XYZ', 'RANDOM VENDOR XYZ', mockCategories);
    expect(result).toBe('cat-other');
  });

  it('matches Amazon to Shopping', () => {
    const result = autoCategorize('AMAZON.COM', 'AMAZON.COM AMZN.COM/BILL', mockCategories);
    expect(result).toBe('cat-shopping');
  });

  it('matches Netflix to Entertainment', () => {
    const result = autoCategorize('NETFLIX.COM', 'NETFLIX.COM subscription', mockCategories);
    expect(result).toBe('cat-entertainment');
  });

  it('matches utility bills', () => {
    const result = autoCategorize('AT&T INTERNET', 'AT&T INTERNET monthly', mockCategories);
    expect(result).toBe('cat-bills');
  });

  it('returns empty string if no Other category exists', () => {
    const noOther = mockCategories.filter((c) => c.name !== 'Other');
    const result = autoCategorize('UNKNOWN VENDOR', 'UNKNOWN VENDOR', noOther);
    expect(result).toBe('');
  });
});

describe('bulkCategorize', () => {
  it('categorizes all transactions with empty categoryId', () => {
    const txns = [
      { merchant: 'WHOLE FOODS', description: 'WHOLE FOODS MARKET', categoryId: '' },
      { merchant: 'NETFLIX', description: 'NETFLIX.COM', categoryId: '' },
      { merchant: 'UBER', description: 'UBER TRIP', categoryId: '' },
    ];

    bulkCategorize(txns, mockCategories);

    expect(txns[0]!.categoryId).toBe('cat-groceries');
    expect(txns[1]!.categoryId).toBe('cat-entertainment');
    expect(txns[2]!.categoryId).toBe('cat-transport');
  });

  it('does not overwrite existing categoryId', () => {
    const txns = [
      { merchant: 'WHOLE FOODS', description: 'WHOLE FOODS', categoryId: 'cat-dining' }, // already assigned
    ];

    bulkCategorize(txns, mockCategories);

    expect(txns[0]!.categoryId).toBe('cat-dining'); // unchanged
  });

  it('handles empty transaction list', () => {
    const txns: Array<{ merchant: string; description: string; categoryId: string }> = [];
    bulkCategorize(txns, mockCategories);
    expect(txns).toHaveLength(0);
  });
});
