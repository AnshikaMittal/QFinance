import type { Transaction, CSVImportResult, DetectedCardInfo } from '../../../core/types';

// Citi CSV format: Status, Date, Description, Debit, Credit
// Debit column has positive numbers for purchases, Credit column for payments
const CITI_HEADERS = ['status', 'date', 'description', 'debit', 'credit'];

export function isCitiFormat(headers: string[]): boolean {
  const normalized = headers.map(h => h.trim().toLowerCase());
  return CITI_HEADERS.every(h => normalized.includes(h));
}

export function parseCitiCSV(csvRows: string[][], cardId: string): CSVImportResult {
  const transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const parseErrors: string[] = [];

  const headers = csvRows[0]?.map(h => h.trim().toLowerCase()) ?? [];
  const statusIdx = headers.indexOf('status');
  const dateIdx = headers.indexOf('date');
  const descIdx = headers.indexOf('description');
  const debitIdx = headers.indexOf('debit');
  const creditIdx = headers.indexOf('credit');

  if (dateIdx === -1 || descIdx === -1 || (debitIdx === -1 && creditIdx === -1)) {
    return {
      transactions: [],
      duplicatesSkipped: 0,
      parseErrors: [`Missing required Citi columns`],
      parserUsed: 'citi',
      detectedCard: { issuer: 'citi', lastFour: '', name: 'Citi Card', color: '#003b95' },
    };
  }

  for (let i = 1; i < csvRows.length; i++) {
    const row = csvRows[i];
    if (!row || row.every(cell => !cell.trim())) continue;

    try {
      const status = statusIdx !== -1 ? (row[statusIdx]?.trim() ?? '') : '';
      // Skip pending/reversed transactions
      if (status.toLowerCase() === 'pending') continue;

      const dateStr = row[dateIdx]?.trim() ?? '';
      const description = row[descIdx]?.trim() ?? '';
      const debitStr = debitIdx !== -1 ? (row[debitIdx]?.trim() ?? '') : '';
      const creditStr = creditIdx !== -1 ? (row[creditIdx]?.trim() ?? '') : '';

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        parseErrors.push(`Row ${i + 1}: invalid date "${dateStr}"`);
        continue;
      }

      // Citi uses separate Debit/Credit columns
      // Debit column = purchases (positive values), Credit column = payments/refunds
      const debitAmt = debitStr ? parseFloat(debitStr.replace(/[,$]/g, '')) : 0;
      const creditAmt = creditStr ? parseFloat(creditStr.replace(/[,$]/g, '')) : 0;

      const isDebit = !isNaN(debitAmt) && debitAmt > 0;
      const amount = isDebit ? debitAmt : creditAmt;

      if (isNaN(amount) || amount === 0) {
        // Skip rows with no amount (e.g., header-like rows)
        continue;
      }

      transactions.push({
        date,
        amount: Math.abs(amount),
        description,
        merchant: extractCitiMerchant(description),
        categoryId: '',
        cardId,
        type: isDebit ? 'debit' : 'credit',
        tags: [],
        isRecurring: false,
        importSource: 'csv',
        rawCsvLine: row.join(','),
      });
    } catch (err) {
      parseErrors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  const detectedCard: DetectedCardInfo = {
    issuer: 'citi',
    lastFour: '',
    name: 'Citi Card',
    color: '#003b95',
  };

  return {
    transactions,
    duplicatesSkipped: 0,
    parseErrors,
    parserUsed: 'citi',
    detectedCard,
  };
}

function extractCitiMerchant(description: string): string {
  return description
    .replace(/\s*\d{3}[-.]?\d{3}[-.]?\d{4}\s*/g, '')
    .replace(/\s*#\d+\s*/g, '')
    .replace(/\*+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
