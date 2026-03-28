/**
 * Apple Card PDF Statement Parser
 *
 * Apple Card monthly statements have transaction lines like:
 *   March 15, 2026   MERCHANT NAME   $XX.XX   X% Daily Cash
 *
 * Or sometimes:
 *   03/15/2026   MERCHANT NAME   $XX.XX
 *
 * The parser handles:
 *   - "Month DD, YYYY" and "MM/DD/YYYY" date formats
 *   - Merchant name extraction
 *   - Amount parsing
 *   - Daily Cash percentage (ignored but matched)
 *   - Payments vs purchases section detection
 */

import type { Transaction, CSVImportResult } from '../../../../core/types';

/**
 * Apple Card transaction line patterns.
 *
 * Format 1: "March 15, 2026  MERCHANT NAME  $42.50  3% Daily Cash"
 */
const APPLE_DATE_LONG =
  /^((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})/;

/**
 * Format 2: "03/15/2026  MERCHANT NAME  $42.50"
 */
const APPLE_DATE_SHORT =
  /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})/;

/**
 * Format 3: "03/15  MERCHANT NAME  $42.50" (no year)
 */
const APPLE_DATE_NOYEAR =
  /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$/;

/**
 * Detect if text lines look like an Apple Card statement.
 */
export function isAppleCardPDF(lines: string[]): boolean {
  const text = lines.join(' ').toLowerCase();

  const markers = [
    'apple card',
    'apple cash',
    'daily cash',
    'goldman sachs',
  ];

  const hasAppleMarkers = markers.filter((m) => text.includes(m)).length >= 2;

  // Check for transaction-like lines
  const hasTransactions = lines.some(
    (l) => APPLE_DATE_LONG.test(l.trim()) || APPLE_DATE_SHORT.test(l.trim()) || APPLE_DATE_NOYEAR.test(l.trim()),
  );

  return hasAppleMarkers || (hasTransactions && text.includes('apple'));
}

/**
 * Parse Apple Card PDF statement text lines into transactions.
 */
export function parseAppleCardPDF(lines: string[], cardId: string): CSVImportResult {
  const transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const parseErrors: string[] = [];

  // Detect year from statement text
  const year = detectYear(lines);

  let inPayments = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    const lowerLine = line.toLowerCase();

    // Section detection
    if (lowerLine.includes('payments') || lowerLine.includes('payment received')) {
      inPayments = true;
      continue;
    }
    if (lowerLine.includes('transactions') || lowerLine.includes('purchases')) {
      inPayments = false;
      continue;
    }

    // Try to match transaction patterns
    let date: Date | null = null;
    let description = '';
    let amountStr = '';

    // Try long date format first ("March 15, 2026")
    let match = APPLE_DATE_LONG.exec(line);
    if (match) {
      date = new Date(match[1] ?? '');
      description = match[2] ?? '';
      amountStr = match[3] ?? '';
    }

    // Try short date ("03/15/2026")
    if (!date || isNaN(date.getTime())) {
      match = APPLE_DATE_SHORT.exec(line);
      if (match) {
        date = new Date(match[1] ?? '');
        description = match[2] ?? '';
        amountStr = match[3] ?? '';
      }
    }

    // Try no-year date ("03/15")
    if (!date || isNaN(date.getTime())) {
      match = APPLE_DATE_NOYEAR.exec(line);
      if (match) {
        const mmdd = match[1] ?? '';
        const parts = mmdd.split('/');
        const month = parseInt(parts[0] ?? '0', 10);
        const day = parseInt(parts[1] ?? '0', 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          date = new Date(year, month - 1, day);
        }
        description = match[2] ?? '';
        amountStr = match[3] ?? '';
      }
    }

    if (!date || isNaN(date.getTime()) || !description || !amountStr) continue;

    try {
      const amount = parseAmount(amountStr);
      if (isNaN(amount) || amount === 0) {
        parseErrors.push(`Line ${i + 1}: invalid amount "${amountStr}"`);
        continue;
      }

      // Clean the description — remove trailing "X% Daily Cash" text
      const merchant = cleanDescription(description);

      const isCredit = inPayments || amount < 0;

      transactions.push({
        date,
        amount: Math.abs(amount),
        description,
        merchant,
        categoryId: '',
        cardId,
        type: isCredit ? 'credit' : 'debit',
        tags: [],
        isRecurring: false,
        importSource: 'pdf',
        rawCsvLine: line,
      });
    } catch (err) {
      parseErrors.push(`Line ${i + 1}: ${err instanceof Error ? err.message : 'parse error'}`);
    }
  }

  return {
    transactions,
    duplicatesSkipped: 0,
    parseErrors,
    parserUsed: 'apple-card-pdf',
  };
}

// --- Helpers ---

function detectYear(lines: string[]): number {
  const currentYear = new Date().getFullYear();
  const yearPattern = /20\d{2}/;

  for (const line of lines) {
    const match = yearPattern.exec(line);
    if (match?.[0]) {
      const y = parseInt(match[0], 10);
      if (Math.abs(y - currentYear) <= 2) return y;
    }
  }

  return currentYear;
}

function parseAmount(str: string): number {
  const cleaned = str.replace(/[$,]/g, '').trim();
  return parseFloat(cleaned);
}

function cleanDescription(desc: string): string {
  return desc
    .replace(/\s+\d+%?\s*daily\s*cash.*$/i, '')  // "3% Daily Cash"
    .replace(/\s{2,}/g, ' ')
    .trim();
}
