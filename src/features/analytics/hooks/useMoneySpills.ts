import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { detectMoneySpills } from '../utils/moneySpillDetector';
import type { MoneySpill } from '../../../core/types';

export function useMoneySpills() {
  const [spills, setSpills] = useState<MoneySpill[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? [];
  const existingSpills = useLiveQuery(() => db.moneySpills.toArray()) ?? [];

  const runDetection = useCallback(async () => {
    if (transactions.length === 0) return;

    setIsAnalyzing(true);
    try {
      const detected = detectMoneySpills(transactions, existingSpills);

      // Merge with existing — keep dismissed state
      const dismissedIds = new Set(existingSpills.filter(s => s.isDismissed).map(s => s.id));

      const merged = detected.filter(s => !dismissedIds.has(s.id));
      setSpills(merged);
    } finally {
      setIsAnalyzing(false);
    }
  }, [transactions, existingSpills]);

  useEffect(() => {
    runDetection();
  }, [transactions.length]);

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

  const activeSpills = spills.filter(s => !s.isDismissed);
  const totalWaste = activeSpills.reduce((sum, s) => sum + s.estimatedWaste, 0);

  return {
    spills: activeSpills,
    totalWaste,
    isAnalyzing,
    dismissSpill,
    runDetection,
  };
}
