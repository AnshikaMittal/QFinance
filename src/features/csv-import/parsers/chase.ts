import type { Transaction, CSVImportResult, DetectedCardInfo } from '../../../core/types';

const CHASE_HEADERS = ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount'];

export function isChaseFormat(headers: string[]): boolean {
  const normalized = headers.map(h => h.trim().toLowerCase());
  return CHASE_HEADERS.every(h => normalized.includes(h.toLowerCase()));
}

export function parseChaseCSV(csvRows: string[][], cardId: string): CSVImportResult {
  const transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const parseErrors: string[] = [];

  // First row is headers
  const headers = csvRows[0]?.map(h => h.trim().toLowerCase()) ?? [];
  const dateIdx = headers.indexOf('transaction date');
  const descIdx = headers.indexOf('description');
  const categoryIdx = headers.indexOf('category');
  const typeIdx = headers.indexOf('type');
  const amountIdx = headers.indexOf('amount');

  for (let i = 1; i < csvRows.length; i++) {
    const row = csvRows[i];
    if (!row || row.length < CHASE_HEADERS.length) {
      if (row && row.some(cell => cell.trim())) {
        parseErrors.push(`Row ${i + 1}: insufficient columns`);
      }
      continue;
    }

    try {
      const dateStr = row[dateIdx]?.trim() ?? '';
      const description = row[descIdx]?.trim() ?? '';
      const category = row[categoryIdx]?.trim() ?? '';
      const type = row[typeIdx]?.trim() ?? '';
      const amountStr = row[amountIdx]?.trim() ?? '0';

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        parseErrors.push(`Row ${i + 1}: invalid date "${dateStr}"`);
        continue;
      }

      const amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        parseErrors.push(`Row ${i + 1}: invalid amount "${amountStr}"`);
        continue;
      }

      // Chase: negative = purchase, positive = payment/credit
      const isDebit = amount < 0;

      transactions.push({
        date,
        amount: Math.abs(amount),
        description,
        merchant: extractMerchant(description),
        categoryId: '', // Will be resolved by auto-categorizer
        cardId,
        type: isDebit ? 'debit' : 'credit',
        tags: category ? [category.toLowerCase()] : [],
        isRecurring: false,
        importSource: 'csv',
        rawCsvLine: row.join(','),
      });
    } catch (err) {
      parseErrors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  const detectedCard: DetectedCardInfo = {
    issuer: 'chase',
    lastFour: '', // CSV doesn't include card number
    name: 'Chase Card',
    color: '#1e40af',
  };

  return {
    transactions,
    duplicatesSkipped: 0,
    parseErrors,
    parserUsed: 'chase',
    detectedCard,
  };
}

function extractMerchant(description: string): string {
  // Chase descriptions often have extra info after the merchant name
  // e.g., "UBER *EATS 800-123-4567" -> "UBER EATS"
  return description
    .replace(/\s*\d{3}[-.]?\d{3}[-.]?\d{4}\s*/g, '') // phone numbers
    .replace(/\s*#\d+\s*/g, '') // reference numbers
    .replace(/\*+/g, ' ') // asterisks
    .replace(/\s+/g, ' ')
    .trim();
}
