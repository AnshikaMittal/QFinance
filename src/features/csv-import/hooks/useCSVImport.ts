import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../core/db';
import { parseCSV } from '../parsers';
import { parseCSVText } from '../utils/csvReader';
import { parsePDFFile } from '../parsers/pdf';
import { bulkCategorize } from '../../../core/utils/categorizer';
import type { Transaction, CSVImportResult } from '../../../core/types';

interface ImportState {
  status: 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';
  result: CSVImportResult | null;
  error: string | null;
  importedCount: number;
}

function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function useCSVImport() {
  const [state, setState] = useState<ImportState>({
    status: 'idle',
    result: null,
    error: null,
    importedCount: 0,
  });

  const parseFile = useCallback(async (file: File, cardId: string) => {
    setState({ status: 'parsing', result: null, error: null, importedCount: 0 });

    try {
      let result: CSVImportResult;

      if (isPDFFile(file)) {
        result = await parsePDFFile(file, cardId);
      } else {
        const text = await file.text();
        const rows = parseCSVText(text);

        if (rows.length === 0) {
          setState({ status: 'error', result: null, error: 'File is empty or could not be parsed.', importedCount: 0 });
          return;
        }

        result = parseCSV(rows, cardId);
      }

      if (result.transactions.length === 0 && result.parseErrors.length > 0) {
        setState({ status: 'error', result, error: result.parseErrors[0] ?? 'Parse error', importedCount: 0 });
        return;
      }

      if (result.transactions.length === 0) {
        setState({
          status: 'error',
          result,
          error: 'No transactions found in file. Make sure this is a supported statement format.',
          importedCount: 0,
        });
        return;
      }

      // Auto-categorize transactions using category keywords
      const categories = await db.categories.toArray();
      bulkCategorize(result.transactions, categories);

      setState({ status: 'preview', result, error: null, importedCount: 0 });
    } catch (err) {
      setState({
        status: 'error',
        result: null,
        error: err instanceof Error ? err.message : 'Failed to parse file',
        importedCount: 0,
      });
    }
  }, []);

  const confirmImport = useCallback(async () => {
    if (!state.result) return;

    setState((prev) => ({ ...prev, status: 'importing' }));

    try {
      const now = new Date();
      const transactions: Transaction[] = state.result.transactions.map((t) => ({
        ...t,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      }));

      await db.transactions.bulkAdd(transactions);

      setState({
        status: 'done',
        result: state.result,
        error: null,
        importedCount: transactions.length,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to import transactions',
      }));
    }
  }, [state.result]);

  const reset = useCallback(() => {
    setState({ status: 'idle', result: null, error: null, importedCount: 0 });
  }, []);

  return { ...state, parseFile, confirmImport, reset };
}
