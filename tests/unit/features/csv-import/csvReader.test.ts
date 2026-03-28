import { describe, it, expect } from 'vitest';
import { parseCSVText } from '../../../../src/features/csv-import/utils/csvReader';

describe('parseCSVText', () => {
  it('parses simple CSV', () => {
    const text = 'a,b,c\n1,2,3\n4,5,6';
    const result = parseCSVText(text);
    expect(result).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted fields with commas', () => {
    const text = 'name,desc\n"Smith, John","Hello, world"';
    const result = parseCSVText(text);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(['Smith, John', 'Hello, world']);
  });

  it('handles escaped quotes', () => {
    const text = 'a,b\n"He said ""hello""",test';
    const result = parseCSVText(text);
    expect(result[1]).toEqual(['He said "hello"', 'test']);
  });

  it('handles CRLF line endings', () => {
    const text = 'a,b\r\n1,2\r\n3,4';
    const result = parseCSVText(text);
    expect(result).toHaveLength(3);
  });

  it('skips empty rows', () => {
    const text = 'a,b\n\n1,2\n\n';
    const result = parseCSVText(text);
    expect(result).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(parseCSVText('')).toEqual([]);
  });

  it('handles single row', () => {
    const text = 'a,b,c';
    const result = parseCSVText(text);
    expect(result).toEqual([['a', 'b', 'c']]);
  });

  it('handles real Chase CSV format', () => {
    const text = 'Transaction Date,Post Date,Description,Category,Type,Amount\n03/15/2026,03/16/2026,"WHOLE FOODS #1234",Groceries,Sale,-45.67\n03/14/2026,03/15/2026,UBER *EATS,Food & Drink,Sale,-23.50';
    const result = parseCSVText(text);
    expect(result).toHaveLength(3);
    expect(result[0]![0]).toBe('Transaction Date');
    expect(result[1]![2]).toBe('WHOLE FOODS #1234');
    expect(result[1]![5]).toBe('-45.67');
  });
});
