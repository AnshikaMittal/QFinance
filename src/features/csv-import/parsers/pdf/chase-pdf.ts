/**
 * Chase Credit Card PDF Statement Parser
 *
 * Chase PDF statements typically have transaction lines in this format:
 *   MM/DD  MM/DD  MERCHANT NAME CITY ST           $XX.XX
 *   03/15  03/16  UBER *EATS 800-123-4567         42.50
 *
 * The parser handles:
 *   - Transaction date (first date) and post date (second date)
 *   - Merchant name extraction and cleaning
 *   - Amount parsing (with or without $ sign)
 *   - Payments/credits (negative amounts or "Payment" section)
 *   - Statement period detection for year inference
 */

import type { Transaction, CSVImportResult, DetectedCardInfo } from '../../../../core/types';

/**
 * Transaction line pattern:
 * MM/DD  [MM/DD]  DESCRIPTION  [-]$XX.XX or XX.XX
 *
 * Chase PDFs often have the two dates, then description, then amount at EOL.
 */
const TRANSACTION_LINE =
  /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})?\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$/;

/**
 * Simpler pattern for lines where dates might be on a separate line
 * or the format is: MM/DD  DESCRIPTION  AMOUNT
 */
const SINGLE_DATE_LINE =
  /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$/;

/**
 * Detect the statement year from header text like "Statement Date: 03/15/2026"
 * or "Account activity from 02/15/2026 to 03/14/2026"
 */
const YEAR_PATTERN = /(?:20\d{2})/;

/**
 * Detect if text lines look like a Chase credit card statement.
 */
export function isChasePDF(lines: string[]): boolean {
  const text = lines.join(' ').toLowerCase();

  // Chase statements typically contain these markers
  const markers = [
    'chase',
    'account number',
    'payment due',
    'new balance',
  ];

  const hasChaseMarkers = markers.filter((m) => text.includes(m)).length >= 2;

  // Also check for transaction-like lines
  const hasTransactions = lines.some((l) => TRANSACTION_LINE.test(l.trim()) || SINGLE_DATE_LINE.test(l.trim()));

  return hasChaseMarkers && hasTransactions;
}

/**
 * Parse Chase PDF statement text lines into transactions.
 */
export function parseChasePDF(lines: string[], cardId: string): CSVImportResult {
  const transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const parseErrors: string[] = [];

  // Try to detect the statement year
  const year = detectYear(lines);

  // Track which section we're in (purchases vs payments/credits)
  let inPayments = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';

    // Detect section headers (only match short header-like lines, not transaction lines)
    const lowerLine = line.toLowerCase();
    if (!TRANSACTION_LINE.test(line) && !SINGLE_DATE_LINE.test(line)) {
      if (lowerLine.includes('payment') && lowerLine.includes('credit') ||
          lowerLine === 'payments and other credits') {
        inPayments = true;
        continue;
      }
      if (lowerLine === 'purchases' || lowerLine === 'purchase' ||
          lowerLine.includes('transaction') && lowerLine.includes('detail')) {
        inPayments = false;
        continue;
      }
    }

    // Try to match transaction lines
    let match = TRANSACTION_LINE.exec(line);
    let transDate: string | undefined;
    let description: string | undefined;
    let amountStr: string | undefined;

    if (match) {
      transDate = match[1];
      description = match[3];
      amountStr = match[4];
    } else {
      // Try single-date pattern
      match = SINGLE_DATE_LINE.exec(line);
      if (match) {
        transDate = match[1];
        description = match[2];
        amountStr = match[3];
      }
    }

    if (!transDate || !description || !amountStr) continue;

    try {
      // Parse date (add year)
      const date = parseDate(transDate, year);
      if (!date || isNaN(date.getTime())) {
        parseErrors.push(`Line ${i + 1}: invalid date "${transDate}"`);
        continue;
      }

      // Parse amount
      const amount = parseAmount(amountStr);
      if (isNaN(amount) || amount === 0) {
        parseErrors.push(`Line ${i + 1}: invalid amount "${amountStr}"`);
        continue;
      }

      // Clean merchant name
      const merchant = cleanMerchant(description);

      // Determine debit vs credit
      // In payments section, or negative amounts = credit/payment
      const isCredit = inPayments || amount < 0;

      transactions.push({
        date,
        amount: Math.abs(amount),
        description: description,
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

  // Extract last 4 digits and card name from statement
  const detectedCard = detectCardInfo(lines);

  return {
    transactions,
    duplicatesSkipped: 0,
    parseErrors,
    parserUsed: 'chase-pdf',
    detectedCard,
  };
}

// --- Helpers ---

function detectYear(lines: string[]): number {
  const currentYear = new Date().getFullYear();

  for (const line of lines) {
    const match = YEAR_PATTERN.exec(line);
    if (match?.[0]) {
      const y = parseInt(match[0], 10);
      // Sanity check: within 2 years of current
      if (Math.abs(y - currentYear) <= 2) return y;
    }
  }

  return currentYear;
}

function parseDate(mmdd: string, year: number): Date | null {
  const parts = mmdd.split('/');
  const month = parseInt(parts[0] ?? '0', 10);
  const day = parseInt(parts[1] ?? '0', 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day);
}

function parseAmount(str: string): number {
  // Remove $ and commas, handle negative
  const cleaned = str.replace(/[$,]/g, '').trim();
  return parseFloat(cleaned);
}

function cleanMerchant(description: string): string {
  return description
    .replace(/\s*\d{3}[-.]?\d{3}[-.]?\d{4}\s*/g, '') // phone numbers
    .replace(/\s*#\d+\s*/g, '')                        // reference numbers
    .replace(/\*+/g, ' ')                              // asterisks
    .replace(/\s{2,}/g, ' ')                           // collapse whitespace
    .trim();
}

/**
 * Extract card info from Chase PDF statement.
 * Chase PDFs typically show:
 *   "Account Number: xxxx xxxx xxxx 1234"  or  "Account ending in 1234"
 *   Card name like "CHASE FREEDOM", "CHASE SAPPHIRE PREFERRED", etc.
 */
function detectCardInfo(lines: string[]): DetectedCardInfo {
  let lastFour = '';
  let cardName = 'Chase Card';

  for (const line of lines) {
    const l = line.trim();

    // Match "Account Number: xxxx xxxx xxxx 1234" or "Account ending in 1234"
    if (!lastFour) {
      const acctMatch = l.match(/account\s*(?:number|#)?[:\s]*(?:[\dxX*•·.\-\s]*?)(\d{4})\s*$/i)
        || l.match(/ending\s+in\s+(\d{4})/i)
        || l.match(/\*{4,}\s*(\d{4})/);
      if (acctMatch?.[1]) {
        lastFour = acctMatch[1];
      }
    }

    // Detect card product name
    const lower = l.toLowerCase();
    if (lower.includes('freedom flex')) { cardName = 'Chase Freedom Flex'; }
    else if (lower.includes('freedom unlimited')) { cardName = 'Chase Freedom Unlimited'; }
    else if (lower.includes('freedom')) { cardName = 'Chase Freedom'; }
    else if (lower.includes('sapphire preferred')) { cardName = 'Chase Sapphire Preferred'; }
    else if (lower.includes('sapphire reserve')) { cardName = 'Chase Sapphire Reserve'; }
    else if (lower.includes('sapphire')) { cardName = 'Chase Sapphire'; }
    else if (lower.includes('amazon') && lower.includes('chase')) { cardName = 'Amazon Prime Visa'; }
    else if (lower.includes('united')) { cardName = 'Chase United'; }
    else if (lower.includes('marriott')) { cardName = 'Chase Marriott Bonvoy'; }
    else if (lower.includes('ink business')) { cardName = 'Chase Ink Business'; }
    else if (lower.includes('southwest')) { cardName = 'Chase Southwest'; }
  }

  return {
    issuer: 'chase',
    lastFour,
    name: cardName,
    color: '#1e40af',
  };
}
