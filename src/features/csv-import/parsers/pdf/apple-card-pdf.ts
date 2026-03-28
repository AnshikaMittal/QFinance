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
 *   - **Installment plans** — parses monthly installment amount (not total)
 *     e.g. "MacBook Pro  Monthly Installment  $41.50 of $1,299.00"
 */

import type { Transaction, CSVImportResult, DetectedCardInfo } from '../../../../core/types';

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
 * Installment line patterns.
 *
 * Apple Card installments appear in a dedicated section and look like:
 *   "PRODUCT NAME  Monthly Installment  $41.50 of $1,299.00"
 *   "PRODUCT NAME  $41.50/mo. for 24 months  $41.50  of $1,299.00"
 *   "03/15  PRODUCT NAME - Installment  $41.50 of $1,299.00"
 *
 * We want to capture the MONTHLY amount ($41.50), not the total ($1,299.00).
 */
const INSTALLMENT_LINE =
  /(.+?)\s+(?:monthly\s+)?installment\s+\$?([\d,]+\.\d{2})\s+of\s+\$?([\d,]+\.\d{2})/i;

const INSTALLMENT_PER_MONTH =
  /(.+?)\s+\$?([\d,]+\.\d{2})\/mo\.?\s+(?:for\s+\d+\s+months?)?\s*\$?([\d,]+\.\d{2})\s+of\s+\$?([\d,]+\.\d{2})/i;

/**
 * Simple installment line: just amount + "of" total, within installments section
 * e.g. "APPLE FINANCING  $41.50  of  $1,299.00"
 */
const INSTALLMENT_SIMPLE =
  /(.+?)\s+\$?([\d,]+\.\d{2})\s+of\s+\$?([\d,]+\.\d{2})/i;

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
  // Detect statement month for installment date fallback
  const statementMonth = detectStatementMonth(lines, year);

  let inPayments = false;
  let inInstallments = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    const lowerLine = line.toLowerCase();

    // Section detection (only match short header lines, not transaction lines)
    const isTransactionLine = APPLE_DATE_LONG.test(line) || APPLE_DATE_SHORT.test(line) || APPLE_DATE_NOYEAR.test(line);
    if (!isTransactionLine) {
      if (lowerLine.includes('payments') || lowerLine === 'payment received') {
        inPayments = true;
        inInstallments = false;
        continue;
      }
      if (lowerLine.includes('transactions') || lowerLine === 'purchases') {
        inPayments = false;
        inInstallments = false;
        continue;
      }
      // Detect installment section headers
      if (
        lowerLine.includes('installment') ||
        lowerLine.includes('monthly installments') ||
        lowerLine.includes('apple card monthly installments') ||
        lowerLine.includes('payment plan')
      ) {
        inInstallments = true;
        inPayments = false;
        continue;
      }
    }

    // --- Handle installment lines (inside or outside the section) ---
    const installmentResult = parseInstallmentLine(line, inInstallments);
    if (installmentResult) {
      const { merchant: instMerchant, monthlyAmount } = installmentResult;
      // Installments use the statement month's 1st as the date
      const installmentDate = new Date(statementMonth.year, statementMonth.month, 1);

      transactions.push({
        date: installmentDate,
        amount: monthlyAmount,
        description: `${instMerchant} (Monthly Installment)`,
        merchant: instMerchant,
        categoryId: '',
        cardId,
        type: 'debit',
        tags: ['installment'],
        isRecurring: true,
        importSource: 'pdf',
        rawCsvLine: line,
      });
      continue;
    }

    // --- Normal transaction lines ---

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

  const detectedCard = detectCardInfo(lines);

  return {
    transactions,
    duplicatesSkipped: 0,
    parseErrors,
    parserUsed: 'apple-card-pdf',
    detectedCard,
  };
}

// --- Helpers ---

/**
 * Parse an installment line and return the monthly amount (not total).
 * Returns null if the line is not an installment.
 */
function parseInstallmentLine(
  line: string,
  inInstallmentsSection: boolean,
): { merchant: string; monthlyAmount: number; totalAmount: number } | null {
  // Pattern: "PRODUCT NAME  Monthly Installment  $41.50 of $1,299.00"
  let match = INSTALLMENT_LINE.exec(line);
  if (match) {
    const merchant = match[1]?.trim() ?? '';
    const monthly = parseAmount(match[2] ?? '');
    const total = parseAmount(match[3] ?? '');
    if (!isNaN(monthly) && monthly > 0) {
      return { merchant, monthlyAmount: monthly, totalAmount: total };
    }
  }

  // Pattern: "PRODUCT NAME  $41.50/mo. for 24 months  $41.50  of $1,299.00"
  match = INSTALLMENT_PER_MONTH.exec(line);
  if (match) {
    const merchant = match[1]?.trim() ?? '';
    const monthly = parseAmount(match[2] ?? '');
    const total = parseAmount(match[4] ?? '');
    if (!isNaN(monthly) && monthly > 0) {
      return { merchant, monthlyAmount: monthly, totalAmount: total };
    }
  }

  // Only try the simple "amount of total" pattern inside an installments section
  // to avoid false matches on regular transaction lines
  if (inInstallmentsSection) {
    match = INSTALLMENT_SIMPLE.exec(line);
    if (match) {
      const merchant = match[1]?.trim() ?? '';
      const monthly = parseAmount(match[2] ?? '');
      const total = parseAmount(match[3] ?? '');
      // Sanity check: monthly should be much less than total
      if (!isNaN(monthly) && monthly > 0 && total > monthly * 1.5) {
        return { merchant, monthlyAmount: monthly, totalAmount: total };
      }
    }
  }

  return null;
}

/**
 * Detect the statement month from the PDF text (e.g., "Statement Period: March 2026").
 * Falls back to the current month.
 */
function detectStatementMonth(lines: string[], fallbackYear: number): { year: number; month: number } {
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Look for "Statement Period" or "Statement Date" lines
    if (lower.includes('statement') && (lower.includes('period') || lower.includes('date'))) {
      for (let m = 0; m < monthNames.length; m++) {
        if (lower.includes(monthNames[m]!)) {
          const yearMatch = line.match(/20\d{2}/);
          const yr = yearMatch ? parseInt(yearMatch[0], 10) : fallbackYear;
          return { year: yr, month: m };
        }
      }
    }
  }

  // Fallback: use the most common month among the transactions in the file
  const monthCounts: Record<number, number> = {};
  for (const line of lines) {
    const m = APPLE_DATE_LONG.exec(line.trim()) || APPLE_DATE_SHORT.exec(line.trim());
    if (m) {
      const d = new Date(m[1] ?? '');
      if (!isNaN(d.getTime())) {
        const key = d.getMonth();
        monthCounts[key] = (monthCounts[key] ?? 0) + 1;
      }
    }
  }

  let bestMonth = new Date().getMonth();
  let bestCount = 0;
  for (const [m, count] of Object.entries(monthCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestMonth = parseInt(m, 10);
    }
  }

  return { year: fallbackYear, month: bestMonth };
}

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

/**
 * Extract card info from Apple Card PDF.
 * Apple Card PDFs may show last 4 digits on the statement.
 */
function detectCardInfo(lines: string[]): DetectedCardInfo {
  let lastFour = '';

  for (const line of lines) {
    const l = line.trim();
    // Apple Card statements may show "Card Number ending in 1234" or similar
    const match = l.match(/ending\s+in\s+(\d{4})/i)
      || l.match(/card\s*(?:number)?[:\s]*(?:[\dxX*•·.\-\s]*?)(\d{4})\s*$/i)
      || l.match(/\*{4,}\s*(\d{4})/);
    if (match?.[1]) {
      lastFour = match[1];
      break;
    }
  }

  return {
    issuer: 'apple',
    lastFour,
    name: 'Apple Card',
    color: '#1f2937',
  };
}
