import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ChevronLeft, ChevronRight,
  Receipt, ChevronDown, ChevronUp, Calendar, CreditCard, Tag, FileText,
  Flame,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { formatCurrency } from '../../../core/utils';
import { Card as UICard, ProgressBar, EmptyState, Modal, Badge } from '../../../ui';
import { useMoneySpills } from '../../analytics/hooks/useMoneySpills';
import type { Transaction, Category } from '../../../core/types';

/* ── helpers ── */

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return { start, end };
}

function formatMonthLabel(year: number, month: number): string {
  const d = new Date(year, month, 1);
  const now = new Date();
  const label = d.toLocaleDateString('en-US', { month: 'long' });
  if (year !== now.getFullYear()) return `${label} ${year}`;
  return label;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* ── stat card ── */

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <UICard className="animate-slide-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">{value}</p>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </UICard>
  );
}

/* ── transaction detail modal ── */

interface TransactionDetailProps {
  transaction: Transaction | null;
  category: Category | undefined;
  cardName: string | undefined;
  onClose: () => void;
}

function TransactionDetail({ transaction, category, cardName, onClose }: TransactionDetailProps) {
  if (!transaction) return null;

  const rows: Array<{ icon: React.ReactNode; label: string; value: string }> = [
    { icon: <Calendar size={14} />, label: 'Date', value: `${formatDate(transaction.date)} at ${formatTime(transaction.date)}` },
    { icon: <Tag size={14} />, label: 'Category', value: category?.name ?? 'Uncategorized' },
    { icon: <CreditCard size={14} />, label: 'Card', value: cardName || 'Unknown card' },
    { icon: <CreditCard size={14} />, label: 'Type', value: transaction.type === 'credit' ? 'Credit / Payment' : 'Purchase' },
    { icon: <FileText size={14} />, label: 'Source', value: transaction.importSource === 'pdf' ? 'PDF Import' : transaction.importSource === 'csv' ? 'CSV Import' : 'Manual' },
  ];

  if (transaction.description && transaction.description !== transaction.merchant) {
    rows.push({ icon: <FileText size={14} />, label: 'Description', value: transaction.description });
  }

  if (transaction.notes) {
    rows.push({ icon: <FileText size={14} />, label: 'Notes', value: transaction.notes });
  }

  return (
    <Modal isOpen onClose={onClose} title="Transaction Details" size="md">
      <div className="flex flex-col gap-4">
        {/* Amount hero */}
        <div className="text-center py-3">
          <p className={`text-3xl font-bold tabular-nums ${transaction.type === 'credit' ? 'text-green-500' : 'text-gray-900 dark:text-white'}`}>
            {transaction.type === 'credit' ? '+' : '-'}{formatCurrency(transaction.amount)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{transaction.merchant || transaction.description}</p>
        </div>

        {/* Detail rows */}
        <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3 py-3">
              <div className="text-gray-400">{row.icon}</div>
              <span className="text-xs text-gray-400 dark:text-gray-500 w-20 shrink-0">{row.label}</span>
              <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Tags */}
        {transaction.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {transaction.tags.map((tag) => (
              <Badge key={tag} color={category?.color}>{tag}</Badge>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── expandable category row ── */

interface CategoryRowProps {
  name: string;
  color: string;
  amount: number;
  totalSpent: number;
  transactions: Transaction[];
  categories: Category[];
  onTransactionClick: (t: Transaction) => void;
}

function CategoryRow({ name, color, amount, totalSpent, transactions, onTransactionClick }: CategoryRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg px-1 -mx-1 transition-colors"
      >
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 text-left">{name}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
          {formatCurrency(amount)}
        </span>
        <div className="w-16">
          <ProgressBar value={amount} max={totalSpent || 1} color={color} size="sm" />
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {/* Expanded transaction list — show ALL transactions for this category */}
      {expanded && (
        <div className="ml-5 pl-3 border-l-2 mt-1 mb-2 flex flex-col max-h-[60vh] overflow-y-auto" style={{ borderColor: `${color}40` }}>
          {[...transactions]
            .sort((a, b) => b.amount - a.amount)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => onTransactionClick(t)}
                className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{t.merchant || t.description}</p>
                  <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
                </div>
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 tabular-nums ml-2">
                  -{formatCurrency(t.amount)}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/* ── money spills summary for dashboard ── */

function MoneySpillsSummary({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const { spills, totalWaste } = useMoneySpills();
  const [expandedSpill, setExpandedSpill] = useState<string | null>(null);
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];

  // All hooks MUST be called before any early return (Rules of Hooks)
  const txnMap = useMemo(() => {
    const map = new Map<string, Transaction>();
    transactions.forEach(t => map.set(t.id, t));
    return map;
  }, [transactions]);

  const cardMap = useMemo(() => {
    const map = new Map<string, { name: string; lastFour: string; color: string }>();
    cards.forEach(c => map.set(c.id, { name: c.name, lastFour: c.lastFour, color: c.color }));
    return map;
  }, [cards]);

  if (spills.length === 0) return null;

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
    impulse: 'Impulse Buy',
  };

  const SPILL_EXPLANATIONS: Record<string, string> = {
    duplicate: 'Multiple charges of the same amount at the same merchant within a few days. This could be an accidental double-charge worth disputing.',
    'subscription-forgotten': 'A recurring charge that appears regularly. Review if you still use this service — canceling unused subscriptions adds up fast.',
    'spending-creep': 'Your spending in this category has increased significantly compared to your 3-month average. Small increases compound over time.',
    impulse: 'Purchases made between 10 PM and 5 AM tend to be impulse buys. Sleeping on it before purchasing can save ~30% of these.',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-red-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Money Spills</h3>
        </div>
        <span className="text-xs font-semibold text-red-500 tabular-nums">{formatCurrency(totalWaste)} potential savings</span>
      </div>

      <div className="flex flex-col gap-2">
        {spills.map((spill) => {
          const color = SPILL_COLORS[spill.type] ?? '#ef4444';
          const label = SPILL_LABELS[spill.type] ?? 'Issue';
          const explanation = SPILL_EXPLANATIONS[spill.type] ?? '';
          const isExpanded = expandedSpill === spill.id;
          const spillTxns = spill.transactions
            .map(id => txnMap.get(id))
            .filter((t): t is Transaction => !!t);

          return (
            <UICard key={spill.id} padding="sm">
              <button
                onClick={() => setExpandedSpill(isExpanded ? null : spill.id)}
                className="w-full text-left"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Flame size={14} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge color={color}>{label}</Badge>
                      <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums ml-auto">
                        {formatCurrency(spill.estimatedWaste)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
                      {spill.description}
                    </p>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={14} className="text-gray-400 mt-2 shrink-0" />
                    : <ChevronDown size={14} className="text-gray-400 mt-2 shrink-0" />}
                </div>
              </button>

              {/* Expanded: explanation + transactions */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
                  {/* Why this matters */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 mb-3">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Why this matters</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{explanation}</p>
                  </div>

                  {/* Referenced transactions */}
                  {spillTxns.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Related transactions ({spillTxns.length})
                      </p>
                      <div className="flex flex-col gap-1">
                        {spillTxns.map((t) => {
                          const cat = categories.find(c => c.id === t.categoryId);
                          const card = cardMap.get(t.cardId);
                          return (
                            <div key={t.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-gray-50 dark:bg-gray-800/30">
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                style={{ backgroundColor: cat?.color ?? '#9ca3af' }}
                              >
                                {(cat?.name ?? '?').charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                                  {t.merchant || t.description}
                                </p>
                                {card && (
                                  <p className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                    <span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: card.color }} />
                                    {card.name}{card.lastFour && card.lastFour !== '0000' ? ` ••${card.lastFour}` : ''}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs text-gray-400 tabular-nums">{formatDate(t.date)}</span>
                              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                                -{formatCurrency(t.amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </UICard>
          );
        })}
      </div>
    </div>
  );
}

/* ── main view ── */

export function DashboardView() {
  const allTransactions = useLiveQuery(() => db.transactions.orderBy('date').toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];

  // Transaction detail modal
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  // Card lookup helper
  const getCardName = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return undefined;
    return `${card.name}${card.lastFour ? ` ••${card.lastFour}` : ''}`;
  }, [cards]);

  // Find the latest month with data, default to current month
  const latestMonth = useMemo(() => {
    if (allTransactions.length === 0) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() };
    }
    const sorted = [...allTransactions].sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = sorted[0]!.date;
    return { year: latest.getFullYear(), month: latest.getMonth() };
  }, [allTransactions]);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    if (selectedYear === null) setSelectedYear(latestMonth.year);
    if (selectedMonth === null) setSelectedMonth(latestMonth.month);
  }, [latestMonth, selectedYear, selectedMonth]);

  const year = selectedYear ?? latestMonth.year;
  const month = selectedMonth ?? latestMonth.month;

  const navigateMonth = useCallback((dir: -1 | 1) => {
    let newMonth = month + dir;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear -= 1; }
    if (newMonth > 11) { newMonth = 0; newYear += 1; }
    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
  }, [year, month]);

  // Month-filtered transactions
  const { start, end } = useMemo(() => getMonthRange(year, month), [year, month]);
  const transactions = useMemo(
    () => allTransactions.filter((t) => t.date >= start && t.date <= end),
    [allTransactions, start, end],
  );

  // Compute summary with category → transactions mapping
  const summary = useMemo(() => {
    const debits = transactions.filter((t) => t.type === 'debit');
    const credits = transactions.filter((t) => t.type === 'credit');
    const totalSpent = debits.reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = credits.reduce((sum, t) => sum + t.amount, 0);

    // Group debits by category
    const byCategoryTxns: Record<string, Transaction[]> = {};
    debits.forEach((t) => {
      if (!byCategoryTxns[t.categoryId]) byCategoryTxns[t.categoryId] = [];
      byCategoryTxns[t.categoryId]!.push(t);
    });

    // Top categories sorted by spend
    const topCategories = Object.entries(byCategoryTxns)
      .map(([catId, txns]) => {
        const cat = categories.find((c) => c.id === catId);
        const amount = txns.reduce((sum, t) => sum + t.amount, 0);
        return { catId, name: cat?.name ?? 'Other', color: cat?.color ?? '#6b7280', amount, transactions: txns };
      })
      .sort((a, b) => b.amount - a.amount);

    return { totalSpent, totalIncome, topCategories, txnCount: transactions.length };
  }, [transactions, categories]);

  // True empty state
  if (allTransactions.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Receipt size={28} />}
          title="Welcome to QuickFinance"
          description="Import a statement (CSV or PDF) or add your first transaction to get started tracking your spending."
        />
      </div>
    );
  }

  const isCurrentMonth = (() => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth();
  })();

  const selectedCategory = selectedTxn ? categories.find(c => c.id === selectedTxn.categoryId) : undefined;

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Transaction detail modal */}
      {selectedTxn && (
        <TransactionDetail
          transaction={selectedTxn}
          category={selectedCategory}
          cardName={selectedTxn ? getCardName(selectedTxn.cardId) : undefined}
          onClose={() => setSelectedTxn(null)}
        />
      )}

      {/* Month header with navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white min-w-[140px] text-center">
            {formatMonthLabel(year, month)}
          </h2>
          <button
            onClick={() => navigateMonth(1)}
            disabled={isCurrentMonth}
            className={`p-1 rounded-lg transition-colors ${
              isCurrentMonth
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{summary.txnCount} transactions</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Spent"
          value={formatCurrency(summary.totalSpent)}
          icon={<TrendingDown size={18} />}
          color="#ef4444"
        />
        <StatCard
          label="Income"
          value={formatCurrency(summary.totalIncome)}
          icon={<TrendingUp size={18} />}
          color="#22c55e"
        />
      </div>

      {/* Net cash flow */}
      <UICard>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Net Cash Flow</p>
            <p className={`text-lg font-bold tabular-nums ${
              summary.totalIncome - summary.totalSpent >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(summary.totalIncome - summary.totalSpent)}
            </p>
          </div>
          <ArrowUpRight
            size={20}
            className={summary.totalIncome - summary.totalSpent >= 0 ? 'text-green-500' : 'text-red-500'}
          />
        </div>
      </UICard>

      {/* Top categories — expandable */}
      {summary.topCategories.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Top Spending</h3>
          <UICard padding="sm">
            <div className="flex flex-col">
              {summary.topCategories.map((cat) => (
                <CategoryRow
                  key={cat.catId}
                  name={cat.name}
                  color={cat.color}
                  amount={cat.amount}
                  totalSpent={summary.totalSpent}
                  transactions={cat.transactions}
                  categories={categories}
                  onTransactionClick={setSelectedTxn}
                />
              ))}
            </div>
          </UICard>
        </div>
      )}

      {/* Money Spills */}
      <MoneySpillsSummary transactions={allTransactions} categories={categories} />

    </div>
  );
}
