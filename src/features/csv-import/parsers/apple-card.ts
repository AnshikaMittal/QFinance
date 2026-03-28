import type { Transaction, CSVImportResult, DetectedCardInfo } from '../../../core/types';

const APPLE_HEADERS = ['Transaction Date', 'Clearing Date', 'Description', 'Merchant', 'Category', 'Type', 'Amount'];

export function isAppleCardFormat(headers: string[]): boolean {
  const normalized = headers.map(h => h.trim().toLowerCase());
  // Match each expected header: exact match or CSV header starts with expected header
  // (e.g. "amount (usd)" startsWith "amount"). Don't check the reverse —
  // "amount" startsWith "a" would match "A" as a header, causing false positives.
  return APPLE_HEADERS.every(expected => {
    const lowerExpected = expected.toLowerCase();
    return normalized.some(n => n === lowerExpected || n.startsWith(lowerExpected));
  });
}

export function parseAppleCardCSV(csvRows: string[][], cardId: string): CSVImportResult {
  const transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const parseErrors: string[] = [];

  const headers = csvRows[0]?.map(h => h.trim().toLowerCase()) ?? [];
  const dateIdx = headers.indexOf('transaction date');
  const descIdx = headers.indexOf('description');
  const merchantIdx = headers.indexOf('merchant');
  const categoryIdx = headers.indexOf('category');
  const typeIdx = headers.indexOf('type');
  const amountIdx = headers.findIndex(h => h.includes('amount'));

  // Bail early if required columns are missing — prevents row[-1] access
  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
    return {
      transactions: [],
      duplicatesSkipped: 0,
      parseErrors: [`Missing required columns: ${[dateIdx === -1 && 'Transaction Date', descIdx === -1 && 'Description', amountIdx === -1 && 'Amount'].filter(Boolean).join(', ')}`],
      parserUsed: 'apple-card',
      detectedCard: { issuer: 'apple', lastFour: '', name: 'Apple Card', color: '#1f2937' },
    };
  }

  for (let i = 1; i < csvRows.length; i++) {
    const row = csvRows[i];
    if (!row || row.length < 5) {
      if (row && row.some(cell => cell.trim())) {
        parseErrors.push(`Row ${i + 1}: insufficient columns`);
      }
      continue;
    }

    try {
      const dateStr = row[dateIdx]?.trim() ?? '';
      const description = row[descIdx]?.trim() ?? '';
      const merchant = row[merchantIdx]?.trim() ?? description;
      const category = row[categoryIdx]?.trim() ?? '';
      const type = row[typeIdx]?.trim()?.toLowerCase() ?? '';
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

      // Apple Card: purchases are positive, payments are negative
      const isDebit = type === 'purchase' || (type !== 'payment' && amount > 0);

      transactions.push({
        date,
        amount: Math.abs(amount),
        description,
        merchant,
        categoryId: '',
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
    issuer: 'apple',
    lastFour: '', // CSV doesn't include card number
    name: 'Apple Card',
    color: '#1f2937',
  };

  return {
    transactions,
    duplicatesSkipped: 0,
    parseErrors,
    parserUsed: 'apple-card',
    detectedCard,
  };
}
