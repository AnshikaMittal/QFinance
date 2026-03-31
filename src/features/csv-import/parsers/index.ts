import type { CSVImportResult, CSVParserType } from '../../../core/types';
import { isChaseFormat, parseChaseCSV } from './chase';
import { isAppleCardFormat, parseAppleCardCSV } from './apple-card';
import { isCitiFormat, parseCitiCSV } from './citi';

export function detectCSVFormat(headers: string[]): CSVParserType {
  // Check Citi before Chase — Citi CSVs can have overlapping headers
  if (isCitiFormat(headers)) return 'citi';
  if (isChaseFormat(headers)) return 'chase';
  if (isAppleCardFormat(headers)) return 'apple-card';
  return 'generic';
}

export function parseCSV(csvRows: string[][], cardId: string): CSVImportResult {
  if (csvRows.length === 0) {
    return { transactions: [], duplicatesSkipped: 0, parseErrors: ['Empty CSV file'], parserUsed: 'generic' };
  }

  const headers = csvRows[0] ?? [];
  const format = detectCSVFormat(headers);

  switch (format) {
    case 'citi':
      return parseCitiCSV(csvRows, cardId);
    case 'chase':
      return parseChaseCSV(csvRows, cardId);
    case 'apple-card':
      return parseAppleCardCSV(csvRows, cardId);
    default:
      return {
        transactions: [],
        duplicatesSkipped: 0,
        parseErrors: ['Unrecognized CSV format. Supported: Chase, Apple Card, Citi'],
        parserUsed: 'generic',
      };
  }
}

export { isChaseFormat, parseChaseCSV } from './chase';
export { isAppleCardFormat, parseAppleCardCSV } from './apple-card';
export { isCitiFormat, parseCitiCSV } from './citi';
