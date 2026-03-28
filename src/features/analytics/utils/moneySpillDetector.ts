import { v4 as uuidv4 } from 'uuid';
import type { Transaction, MoneySpill } from '../../../core/types';

interface DetectionConfig {
  duplicateWindowDays: number;       // days within which to detect duplicates (default 3)
  duplicateAmountTolerance: number;  // % tolerance for "same amount" (default 0.01 = 1%)
  subscriptionMinRecurrences: number; // min times a charge appears to flag as subscription (default 2)
  spendingCreepThreshold: number;    // % increase to flag spending creep (default 0.20 = 20%)
  impulseHourStart: number;          // late-night impulse start hour (default 22)
  impulseHourEnd: number;            // late-night impulse end hour (default 5)
  impulseMinAmount: number;          // min amount to flag as impulse (default 20)
}

const DEFAULT_CONFIG: DetectionConfig = {
  duplicateWindowDays: 3,
  duplicateAmountTolerance: 0.01,
  subscriptionMinRecurrences: 2,
  spendingCreepThreshold: 0.20,
  impulseHourStart: 22,
  impulseHourEnd: 5,
  impulseMinAmount: 20,
};

export function detectMoneySpills(
  transactions: Transaction[],
  existingSpills: MoneySpill[],
  config: Partial<DetectionConfig> = {},
): MoneySpill[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const dismissedIds = new Set(existingSpills.filter(s => s.isDismissed).map(s => s.id));
  const debits = transactions.filter(t => t.type === 'debit');

  const spills: MoneySpill[] = [];

  // 1. Duplicate detection - same amount at same/similar merchant within N days
  spills.push(...detectDuplicates(debits, cfg));

  // 2. Forgotten subscriptions - recurring charges user might not be aware of
  spills.push(...detectForgottenSubscriptions(debits, cfg));

  // 3. Spending creep - categories where spending is trending up significantly
  spills.push(...detectSpendingCreep(debits, cfg));

  // 4. Impulse spending - late night or weekend spending patterns
  spills.push(...detectImpulseSpending(debits, cfg));

  return spills;
}

function detectDuplicates(debits: Transaction[], cfg: DetectionConfig): MoneySpill[] {
  const spills: MoneySpill[] = [];
  const sorted = [...debits].sort((a, b) => a.date.getTime() - b.date.getTime());
  const seen = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const t1 = sorted[i];
    if (!t1 || seen.has(t1.id)) continue;

    const duplicateGroup: Transaction[] = [t1];

    for (let j = i + 1; j < sorted.length; j++) {
      const t2 = sorted[j];
      if (!t2) continue;

      const daysDiff = (t2.date.getTime() - t1.date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > cfg.duplicateWindowDays) break;

      const amountDiff = Math.abs(t1.amount - t2.amount) / t1.amount;
      const sameMerchant =
        normalizeMerchant(t1.merchant) === normalizeMerchant(t2.merchant) ||
        normalizeMerchant(t1.description) === normalizeMerchant(t2.description);

      if (amountDiff <= cfg.duplicateAmountTolerance && sameMerchant) {
        duplicateGroup.push(t2);
        seen.add(t2.id);
      }
    }

    if (duplicateGroup.length > 1) {
      const extraCharges = duplicateGroup.slice(1);
      spills.push({
        id: uuidv4(),
        type: 'duplicate',
        description: `Possible duplicate charge at ${t1.merchant || t1.description} — ${duplicateGroup.length} charges of ${formatAmount(t1.amount)} within ${cfg.duplicateWindowDays} days`,
        transactions: duplicateGroup.map(t => t.id),
        estimatedWaste: extraCharges.reduce((sum, t) => sum + t.amount, 0),
        period: `${daysBetween(duplicateGroup)} days`,
        isDismissed: false,
        detectedAt: new Date(),
      });
    }
  }

  return spills;
}

function detectForgottenSubscriptions(debits: Transaction[], cfg: DetectionConfig): MoneySpill[] {
  const spills: MoneySpill[] = [];

  // Group by merchant and similar amount
  const merchantGroups = new Map<string, Transaction[]>();

  for (const t of debits) {
    const key = `${normalizeMerchant(t.merchant || t.description)}_${Math.round(t.amount * 100)}`;
    const group = merchantGroups.get(key) ?? [];
    group.push(t);
    merchantGroups.set(key, group);
  }

  for (const [key, group] of merchantGroups) {
    if (group.length < cfg.subscriptionMinRecurrences) continue;

    // Check if charges are roughly monthly (25-35 day intervals)
    const sorted = [...group].sort((a, b) => a.date.getTime() - b.date.getTime());
    const intervals: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev && curr) {
        intervals.push((curr.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;

    // Monthly-ish subscription (25-35 days) or weekly (5-9 days)
    const isRecurring = (avgInterval >= 25 && avgInterval <= 35) || (avgInterval >= 5 && avgInterval <= 9);

    if (isRecurring) {
      const first = sorted[0];
      if (!first) continue;
      const monthlyAmount = avgInterval >= 25 ? first.amount : first.amount * 4;

      spills.push({
        id: uuidv4(),
        type: 'subscription-forgotten',
        description: `Recurring charge: ${first.merchant || first.description} — ${formatAmount(first.amount)} every ~${Math.round(avgInterval)} days (${group.length} occurrences)`,
        transactions: group.map(t => t.id),
        estimatedWaste: monthlyAmount * 12,
        period: `${Math.round(avgInterval)} day cycle`,
        isDismissed: false,
        detectedAt: new Date(),
      });
    }
  }

  return spills;
}

function detectSpendingCreep(debits: Transaction[], cfg: DetectionConfig): MoneySpill[] {
  const spills: MoneySpill[] = [];
  const now = new Date();

  // Compare current month vs average of previous 3 months by category
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const current = debits.filter(t => t.date >= currentMonth);
  const previous = debits.filter(t => t.date >= threeMonthsAgo && t.date < currentMonth);

  if (previous.length === 0) return spills;

  // Group by category
  const currentByCategory = groupByCategory(current);
  const previousByCategory = groupByCategory(previous);

  for (const [categoryId, currentAmount] of Object.entries(currentByCategory)) {
    const prevAmount = previousByCategory[categoryId];
    if (!prevAmount || prevAmount === 0) continue;

    const monthlyAvg = prevAmount / 3; // 3-month average
    const increase = (currentAmount - monthlyAvg) / monthlyAvg;

    if (increase >= cfg.spendingCreepThreshold && currentAmount > 50) {
      const txns = current.filter(t => t.categoryId === categoryId);
      spills.push({
        id: uuidv4(),
        type: 'spending-creep',
        description: `Spending up ${Math.round(increase * 100)}% in this category — ${formatAmount(currentAmount)} this month vs ${formatAmount(monthlyAvg)}/mo average`,
        transactions: txns.map(t => t.id),
        estimatedWaste: currentAmount - monthlyAvg,
        period: 'This month vs 3-month avg',
        isDismissed: false,
        detectedAt: new Date(),
      });
    }
  }

  return spills;
}

function detectImpulseSpending(debits: Transaction[], cfg: DetectionConfig): MoneySpill[] {
  const lateNight = debits.filter(t => {
    const hour = t.date.getHours();
    return (hour >= cfg.impulseHourStart || hour < cfg.impulseHourEnd) && t.amount >= cfg.impulseMinAmount;
  });

  if (lateNight.length < 3) return [];

  const total = lateNight.reduce((sum, t) => sum + t.amount, 0);

  return [
    {
      id: uuidv4(),
      type: 'impulse',
      description: `${lateNight.length} late-night purchases (${cfg.impulseHourStart}:00–${cfg.impulseHourEnd}:00) totaling ${formatAmount(total)}`,
      transactions: lateNight.map(t => t.id),
      estimatedWaste: total * 0.3, // estimate 30% of impulse buys are wasteful
      period: 'Last 30 days',
      isDismissed: false,
      detectedAt: new Date(),
    },
  ];
}

// Helpers
function normalizeMerchant(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function daysBetween(txns: Transaction[]): number {
  if (txns.length < 2) return 0;
  const first = txns[0];
  const last = txns[txns.length - 1];
  if (!first || !last) return 0;
  return Math.round((last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24));
}

function groupByCategory(txns: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t of txns) {
    result[t.categoryId] = (result[t.categoryId] ?? 0) + t.amount;
  }
  return result;
}
