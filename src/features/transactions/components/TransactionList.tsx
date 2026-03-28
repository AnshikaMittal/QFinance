import { useState } from 'react';
import { Trash2, ChevronRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { formatCurrency, formatDate } from '../../../core/utils';
import { Badge, EmptyState } from '../../../ui';
import { Receipt } from 'lucide-react';
import type { Transaction, Category } from '../../../core/types';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete?: (id: string) => void;
  onSelect?: (transaction: Transaction) => void;
  showDate?: boolean;
}

function getCategoryInfo(categories: Category[], id: string): { name: string; color: string; icon: string } {
  const cat = categories.find((c) => c.id === id);
  return cat ? { name: cat.name, color: cat.color, icon: cat.icon } : { name: 'Uncategorized', color: '#9ca3af', icon: 'circle' };
}

export function TransactionList({ transactions, onDelete, onSelect, showDate = true }: TransactionListProps) {
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];
  const [swipedId, setSwipedId] = useState<string | null>(null);

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<Receipt size={24} />}
        title="No transactions yet"
        description="Add your first transaction or import a CSV statement to get started."
      />
    );
  }

  // Group by date
  const grouped = transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
    const key = formatDate(t.date, 'iso');
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(t);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([dateKey, txns]) => (
        <div key={dateKey} className="animate-fade-in">
          {showDate && (
            <div className="px-1 mb-2">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {formatDate(new Date(dateKey + 'T12:00:00'), 'long')}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            {txns.map((t) => {
              const cat = getCategoryInfo(categories, t.categoryId);
              const card = cards.find((c) => c.id === t.cardId);

              return (
                <div
                  key={t.id}
                  className="group flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150 cursor-pointer active:scale-[0.99]"
                  onClick={() => onSelect?.(t)}
                >
                  {/* Category color dot */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    {cat.name.charAt(0)}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {t.merchant || t.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{cat.name}</span>
                      {card && (
                        <>
                          <span className="text-gray-300 dark:text-gray-600">·</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">...{card.lastFour}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        t.type === 'credit'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                  </div>

                  {/* Delete on hover */}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(t.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
