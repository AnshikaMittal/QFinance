import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../core/db';
import { parseCSV } from '../parsers';
import { parseCSVText } from '../utils/csvReader';
import { parsePDFFile } from '../parsers/pdf';
import { bulkCategorize } from '../../../core/utils/categorizer';
import type { Transaction, CSVImportResult, DetectedCardInfo } from '../../../core/types';

interface ImportState {
  status: 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';
  result: CSVImportResult | null;
  error: string | null;
  importedCount: number;
  resolvedCardId: string | null;
}

function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Find an existing card that matches the detected info, or create a new one.
 * Matching priority:
 *   1. Same issuer + same lastFour (if lastFour is known)
 *   2. Same issuer + empty lastFour on existing card (placeholder from earlier CSV import)
 * If no match, a new card is created.
 */
async function resolveOrCreateCard(info: DetectedCardInfo): Promise<string> {
  const existingCards = await db.cards.toArray();

  // Try exact match first (issuer + last four)
  if (info.lastFour) {
    const exact = existingCards.find(
      (c) => c.issuer === info.issuer && c.lastFour === info.lastFour,
    );
    if (exact) return exact.id;
  }

  // Try issuer-only match if this card has no lastFour (CSV import)
  // or if there's an existing card with no lastFour from a prior CSV import
  if (!info.lastFour) {
    // If we have no last four, try to match an existing card by issuer alone
    // but only if there's exactly one card of that issuer (avoid ambiguity)
    const sameIssuer = existingCards.filter((c) => c.issuer === info.issuer);
    if (sameIssuer.length === 1) return sameIssuer[0]!.id;
  } else {
    // We have a last four — update any placeholder card of same issuer that has empty lastFour
    const placeholder = existingCards.find(
      (c) => c.issuer === info.issuer && !c.lastFour,
    );
    if (placeholder) {
      await db.cards.update(placeholder.id, {
        lastFour: info.lastFour,
        name: info.name || placeholder.name,
      });
      return placeholder.id;
    }
  }

  // Create a new card
  const newId = uuidv4();
  await db.cards.add({
    id: newId,
    name: info.name,
    type: 'credit',
    issuer: info.issuer,
    lastFour: info.lastFour || '0000',
    color: info.color,
    createdAt: new Date(),
  });

  return newId;
}

export function useCSVImport() {
  const [state, setState] = useState<ImportState>({
    status: 'idle',
    result: null,
    error: null,
    importedCount: 0,
    resolvedCardId: null,
  });

  const parseFile = useCallback(async (file: File) => {
    setState({ status: 'parsing', result: null, error: null, importedCount: 0, resolvedCardId: null });

    try {
      let result: CSVImportResult;

      // Pass a placeholder cardId — we'll replace it after card resolution
      const placeholderCardId = '__pending__';

      if (isPDFFile(file)) {
        result = await parsePDFFile(file, placeholderCardId);
      } else {
        const text = await file.text();
        const rows = parseCSVText(text);

        if (rows.length === 0) {
          setState({ status: 'error', result: null, error: 'File is empty or could not be parsed.', importedCount: 0, resolvedCardId: null });
          return;
        }

        result = parseCSV(rows, placeholderCardId);
      }

      if (result.transactions.length === 0 && result.parseErrors.length > 0) {
        setState({ status: 'error', result, error: result.parseErrors[0] ?? 'Parse error', importedCount: 0, resolvedCardId: null });
        return;
      }

      if (result.transactions.length === 0) {
        setState({
          status: 'error',
          result,
          error: 'No transactions found in file. Make sure this is a supported statement format.',
          importedCount: 0,
          resolvedCardId: null,
        });
        return;
      }

      // Resolve or create the card from detected info
      const cardInfo: DetectedCardInfo = result.detectedCard ?? {
        issuer: 'other',
        lastFour: '',
        name: 'Unknown Card',
        color: '#6b7280',
      };

      const cardId = await resolveOrCreateCard(cardInfo);

      // Assign the resolved cardId to all transactions
      for (const txn of result.transactions) {
        txn.cardId = cardId;
      }

      // Auto-categorize transactions using category keywords
      const categories = await db.categories.toArray();
      bulkCategorize(result.transactions, categories);

      setState({ status: 'preview', result, error: null, importedCount: 0, resolvedCardId: cardId });
    } catch (err) {
      setState({
        status: 'error',
        result: null,
        error: err instanceof Error ? err.message : 'Failed to parse file',
        importedCount: 0,
        resolvedCardId: null,
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
        resolvedCardId: state.resolvedCardId,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to import transactions',
      }));
    }
  }, [state.result, state.resolvedCardId]);

  const reset = useCallback(() => {
    setState({ status: 'idle', result: null, error: null, importedCount: 0, resolvedCardId: null });
  }, []);

  return { ...state, parseFile, confirmImport, reset };
}
