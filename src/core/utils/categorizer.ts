/**
 * Auto-Categorizer
 *
 * Matches transaction descriptions/merchants against category keywords
 * to automatically assign categories during import.
 *
 * Strategy:
 *   1. Check merchant name against category keywords (case-insensitive substring match)
 *   2. Check full description if merchant doesn't match
 *   3. Fall back to "Other" category if no match
 *
 * This runs during import so every transaction gets a category assigned,
 * which makes the dashboard, pie charts, and spending breakdowns work immediately.
 */

import type { Category } from '../types';
import { db } from '../db';

/**
 * Find the best matching category for a transaction.
 * Returns the category ID, or the "Other" category if no match.
 */
export function autoCategorize(
  merchant: string,
  description: string,
  categories: Category[],
): string {
  const searchText = `${merchant} ${description}`.toLowerCase();

  // Score each category by how well it matches
  let bestMatch: { categoryId: string; score: number } | null = null;

  for (const cat of categories) {
    if (cat.name === 'Other' || cat.keywords.length === 0) continue;

    for (const keyword of cat.keywords) {
      const kw = keyword.toLowerCase();

      if (searchText.includes(kw)) {
        // Longer keyword matches are more specific, so score higher
        const score = kw.length;

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { categoryId: cat.id, score };
        }
      }
    }
  }

  if (bestMatch) return bestMatch.categoryId;

  // Fall back to "Other"
  const otherCat = categories.find((c) => c.name === 'Other');
  return otherCat?.id ?? '';
}

/**
 * Categorize an array of transactions in bulk.
 * More efficient than calling autoCategorize one at a time since
 * it fetches categories once.
 */
export function bulkCategorize(
  transactions: Array<{ merchant: string; description: string; categoryId: string }>,
  categories: Category[],
): void {
  for (const txn of transactions) {
    // Only categorize if not already assigned
    if (!txn.categoryId) {
      txn.categoryId = autoCategorize(txn.merchant, txn.description, categories);
    }
  }
}

/**
 * Re-categorize ALL existing transactions in the database using current keywords.
 * Useful after category keywords are updated so old imports get correct categories.
 * Returns the number of transactions that were updated.
 */
export async function recategorizeAll(): Promise<{ updated: number; total: number }> {
  const categories = await db.categories.toArray();
  const transactions = await db.transactions.toArray();

  let updated = 0;

  for (const txn of transactions) {
    const newCategoryId = autoCategorize(txn.merchant, txn.description, categories);
    if (newCategoryId && newCategoryId !== txn.categoryId) {
      await db.transactions.update(txn.id, { categoryId: newCategoryId, updatedAt: new Date() });
      updated++;
    }
  }

  return { updated, total: transactions.length };
}
