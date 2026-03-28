/**
 * PDF Statement Parser
 *
 * Auto-detects whether a PDF is a Chase or Apple Card statement
 * and routes to the appropriate parser.
 */

import type { CSVImportResult } from '../../../../core/types';
import { extractAllLines } from '../../utils/pdfReader';
import { isChasePDF, parseChasePDF } from './chase-pdf';
import { isAppleCardPDF, parseAppleCardPDF } from './apple-card-pdf';

export type PDFFormat = 'chase-pdf' | 'apple-card-pdf' | 'unknown';

/**
 * Detect the PDF statement format from extracted text lines.
 */
export function detectPDFFormat(lines: string[]): PDFFormat {
  if (isChasePDF(lines)) return 'chase-pdf';
  if (isAppleCardPDF(lines)) return 'apple-card-pdf';
  return 'unknown';
}

/**
 * Parse a PDF file into transactions.
 * Extracts text, detects format, and routes to the correct parser.
 */
export async function parsePDFFile(file: File, cardId: string): Promise<CSVImportResult> {
  // Extract text from all pages
  const lines = await extractAllLines(file);

  if (lines.length === 0) {
    return {
      transactions: [],
      duplicatesSkipped: 0,
      parseErrors: ['Could not extract any text from PDF. The file may be image-based (scanned).'],
      parserUsed: 'generic',
    };
  }

  // Detect format
  const format = detectPDFFormat(lines);

  switch (format) {
    case 'chase-pdf':
      return parseChasePDF(lines, cardId);
    case 'apple-card-pdf':
      return parseAppleCardPDF(lines, cardId);
    default:
      return {
        transactions: [],
        duplicatesSkipped: 0,
        parseErrors: [
          'Unrecognized PDF format. Supported: Chase credit card statements, Apple Card statements.',
          'If this is a scanned PDF, try downloading the digital version from your bank\'s website.',
        ],
        parserUsed: 'generic',
      };
  }
}

export { isChasePDF, parseChasePDF } from './chase-pdf';
export { isAppleCardPDF, parseAppleCardPDF } from './apple-card-pdf';
