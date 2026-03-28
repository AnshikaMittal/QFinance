import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { detectMoneySpills } from '../utils/moneySpillDetector';
import type { MoneySpill, SpillResolution } from '../../../core/types';

interface UseMoneySpillsOptions {
  /** If provided, only analyze transactions within this month */
  month?: { year: number; month: number };
}

export function useMoneySpills(options?: UseMoneySpillsOptions) {
  const [spills, setSpills] = useState<MoneySpill[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const allTransactions = useLiveQuery(() => db.transactions.toArray()) ?? [];
  const existingSpills = useLiveQuery(() => db.moneySpills.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];

  // Filter transactions to the selected month if specified
  const transactions = options?.month
    ? allTransactions.filter(t => {
        const d = t.date;
        return d.getFullYear() === options.month!.year && d.getMonth() === options.month!.month;
      })
    : allTransactions;

  // For spending creep we still need historical data, so pass allTransactions to the detector
  // but scope results to transactions in the selected month
  const monthKey = options?.month ? `${options.month.year}-${options.month.month}` : 'all';

  const runDetection = useCallback(async () => {
    if (allTransactions.length === 0) return;

    setIsAnalyzing(true);
    try {
      const categoryNames: Record<string, string> = {};
      for (const cat of categories) {
        categoryNames[cat.id] = cat.name;
      }

      // For scoped detection, pass only transactions in the month window
      // but for spending creep we need all transactions for the 3-month lookback
      const detected = options?.month
        ? detectMoneySpills(allTransactions, existingSpills, {}, categoryNames, options.month)
        : detectMoneySpills(allTransactions, existingSpills, {}, categoryNames);

      // Merge with existing — keep dismissed state
      const dismissedIds = new Set(existingSpills.filter(s => s.isDismissed).map(s => s.id));

      const merged = detected.filter(s => !dismissedIds.has(s.id));
      setSpills(merged);
    } finally {
      setIsAnalyzing(false);
    }
  }, [allTransactions, existingSpills, categories, monthKey]);

  useEffect(() => {
    runDetection();
  }, [allTransactions.length, monthKey]);

  const dismissSpill = useCallback(
    async (spillId: string) => {
      const spill = spills.find(s => s.id === spillId);
      if (spill) {
        await db.moneySpills.put({ ...spill, isDismissed: true });
        setSpills(prev => prev.filter(s => s.id !== spillId));
      }
    },
    [spills],
  );

  const resolveSpill = useCallback(
    async (spillId: string, resolution: SpillResolution, note?: string) => {
      const spill = spills.find(s => s.id === spillId);
      if (spill) {
        const updated: MoneySpill = {
          ...spill,
          resolution,
          resolvedAt: resolution !== 'unresolved' ? new Date() : undefined,
          resolutionNote: note || spill.resolutionNote,
        };
        await db.moneySpills.put(updated);
        setSpills(prev => prev.map(s => s.id === spillId ? updated : s));
      }
    },
    [spills],
  );

  const activeSpills = spills.filter(s => !s.isDismissed);
  const totalWaste = activeSpills.reduce((sum, s) => sum + s.estimatedWaste, 0);

  return {
    spills: activeSpills,
    totalWaste,
    isAnalyzing,
    dismissSpill,
    resolveSpill,
    runDetection,
  };
}
