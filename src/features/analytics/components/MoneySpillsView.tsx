import { useState, useMemo } from 'react';
import {
  AlertTriangle, X, RefreshCw, Flame, Copy, Repeat,
  TrendingUp, Moon, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card as UICard, Button, Badge, EmptyState } from '../../../ui';
import { useMoneySpills } from '../hooks/useMoneySpills';
import { formatCurrency } from '../../../core/utils';
import { db } from '../../../core/db';
import type { Transaction } from '../../../core/types';

const SPILL_ICONS: Record<string, typeof AlertTriangle> = {
  duplicate: Copy,
  'subscription-forgotten': Repeat,
  'spending-creep': TrendingUp,
  impulse: Moon,
};

const SPILL_COLORS: Record<string, string> = {
  duplicate: '#ef4444',
  'subscription-forgotten': '#f59e0b',
  'spending-creep': '#f97316',
  impulse: '#8b5cf6',
};

const SPILL_LABELS: Record<string, string> = {
  duplicate: 'Duplicate Charge',
  'subscription-forgotten': 'Recurring Charge',
  'spending-creep': 'Spending Creep',
  impulse: 'Impulse Spending',
};

const SPILL_EXPLANATIONS: Record<string, string> = {
  duplicate: 'We found multiple charges of the same amount at the same merchant within a few days. This could be an accidental double-charge — consider contacting your card issuer to dispute it.',
  'subscription-forgotten': 'This charge recurs regularly on a predictable cycle. If you no longer actively use this service, canceling it could save you the annual amount shown above.',
  'spending-creep': 'Your spending in this category has grown significantly compared to your recent 3-month average. Even a 20% creep compounds to major amounts over a year.',
  impulse: 'Purchases made between 10 PM and 5 AM are often impulse buys. Research shows sleeping on it before purchasing eliminates about 30% of these.',
};

const SPILL_TIPS: Record<string, string> = {
  duplicate: 'Tip: Check your statement for the exact dates and call your bank to dispute.',
  'subscription-forgotten': 'Tip: Check if the service offers a cheaper plan or free alternative.',
  'spending-creep': 'Tip: Set a budget alert for this category to catch increases early.',
  impulse: 'Tip: Add items to a wishlist instead of buying immediately, then review after 24 hours.',
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MoneySpillsView() {
  const { spills, totalWaste, isAnalyzing, dismissSpill, runDetection } = useMoneySpills();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];

  const txnMap = useMemo(() => {
    const map = new Map<string, Transaction>();
    transactions.forEach(t => map.set(t.id, t));
    return map;
  }, [transactions]);

  if (spills.length === 0 && !isAnalyzing) {
    return (
      <EmptyState
        icon={<Flame size={28} />}
        title="No money spills detected"
        description="Great job! We didn't find any suspicious patterns in your spending. Keep it up!"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Summary card */}
      <UICard className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-500/5 dark:to-orange-500/5 border-red-200/50 dark:border-red-500/20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame size={18} className="text-red-500" />
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                Money Spills
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {formatCurrency(totalWaste)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              potential savings from {spills.length} issue{spills.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={runDetection}
            isLoading={isAnalyzing}
            icon={<RefreshCw size={14} />}
          >
            Scan
          </Button>
        </div>
      </UICard>

      {/* Spill cards */}
      {spills.map((spill, index) => {
        const Icon = SPILL_ICONS[spill.type] ?? AlertTriangle;
        const color = SPILL_COLORS[spill.type] ?? '#ef4444';
        const label = SPILL_LABELS[spill.type] ?? 'Issue';
        const explanation = SPILL_EXPLANATIONS[spill.type] ?? '';
        const tip = SPILL_TIPS[spill.type] ?? '';
        const isExpanded = expandedId === spill.id;

        const spillTxns = spill.transactions
          .map(id => txnMap.get(id))
          .filter((t): t is Transaction => !!t);

        return (
          <UICard key={spill.id} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
            {/* Header — always visible, clickable */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : spill.id)}
              className="w-full text-left"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: `${color}15` }}
                >
                  <Icon size={18} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge color={color}>{label}</Badge>
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums ml-auto">
                      {formatCurrency(spill.estimatedWaste)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    {spill.description}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{spill.period}</span>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <span>Details</span>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                  </div>
                </div>
              </div>
            </button>

            {/* Expanded detail section */}
            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
                {/* Explanation */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Why this matters</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{explanation}</p>
                  {tip && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">{tip}</p>
                  )}
                </div>

                {/* Referenced transactions */}
                {spillTxns.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Flagged transactions ({spillTxns.length})
                    </p>
                    <div className="flex flex-col gap-1">
                      {spillTxns.map((t) => {
                        const cat = categories.find(c => c.id === t.categoryId);
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/30"
                          >
                            <div
                              className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: cat?.color ?? '#9ca3af' }}
                            >
                              {(cat?.name ?? '?').charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                                {t.merchant || t.description}
                              </p>
                              <p className="text-[10px] text-gray-400">{cat?.name ?? 'Other'}</p>
                            </div>
                            <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                              {formatDate(t.date)}
                            </span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                              -{formatCurrency(t.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Dismiss button */}
                <button
                  onClick={(e) => { e.stopPropagation(); dismissSpill(spill.id); }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-1"
                >
                  <X size={12} /> Dismiss this spill
                </button>
              </div>
            )}
          </UICard>
        );
      })}
    </div>
  );
}
