import { useMemo, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { Card as UICard, EmptyState } from '../../../ui';
import { formatCurrency } from '../../../core/utils';
import { BarChart3, TrendingUp } from 'lucide-react';

type TimeRange = '1m' | '2m' | '3m' | '6m' | '12m';

export function TrendCharts() {
  const [range, setRange] = useState<TimeRange>('3m');

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];

  const debits = useMemo(
    () => transactions.filter(t => t.type === 'debit'),
    [transactions],
  );

  const monthsBack = range === '1m' ? 1 : range === '2m' ? 2 : range === '3m' ? 3 : range === '6m' ? 6 : 12;

  // Monthly spending trend data
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { month: string; spent: number; income: number }[] = [];

    for (let i = monthsBack - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = start.toLocaleDateString('en-US', { month: 'short' });

      const spent = transactions
        .filter(t => t.type === 'debit' && t.date >= start && t.date <= end)
        .reduce((sum, t) => sum + t.amount, 0);

      const income = transactions
        .filter(t => t.type === 'credit' && t.date >= start && t.date <= end)
        .reduce((sum, t) => sum + t.amount, 0);

      months.push({ month: label, spent: Math.round(spent), income: Math.round(income) });
    }

    return months;
  }, [transactions, monthsBack]);

  // Monthly trend by category data
  const { monthlyCategoryData, topCategories } = useMemo(() => {
    const now = new Date();
    // Collect all category names with totals to find top ones
    const catTotals: Record<string, number> = {};
    const catMeta: Record<string, { name: string; color: string }> = {};

    for (let i = monthsBack - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthDebits = debits.filter(t => t.date >= start && t.date <= end);
      monthDebits.forEach(t => {
        const cat = categories.find(c => c.id === t.categoryId);
        const name = cat?.name ?? 'Other';
        catTotals[name] = (catTotals[name] ?? 0) + t.amount;
        if (!catMeta[name]) {
          catMeta[name] = { name, color: cat?.color ?? '#9ca3af' };
        }
      });
    }

    // Top 6 categories by total spend
    const top = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => ({ name, color: catMeta[name]?.color ?? '#9ca3af' }));

    const topNames = new Set(top.map(c => c.name));

    // Build monthly data with a key per top category
    const data: Record<string, string | number>[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = start.toLocaleDateString('en-US', { month: 'short' });
      const monthDebits = debits.filter(t => t.date >= start && t.date <= end);

      const row: Record<string, string | number> = { month: label };
      monthDebits.forEach(t => {
        const cat = categories.find(c => c.id === t.categoryId);
        const name = cat?.name ?? 'Other';
        if (topNames.has(name)) {
          row[name] = Math.round(((row[name] as number) ?? 0) + t.amount);
        }
      });
      data.push(row);
    }

    return { monthlyCategoryData: data, topCategories: top };
  }, [debits, categories, monthsBack]);

  // Card comparison data
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];
  const cardData = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthDebits = debits.filter(t => t.date >= start);

    return cards.map(card => {
      const spent = thisMonthDebits
        .filter(t => t.cardId === card.id)
        .reduce((sum, t) => sum + t.amount, 0);
      return { name: `${card.name}`, spent: Math.round(spent), color: card.color };
    }).filter(c => c.spent > 0);
  }, [debits, cards]);

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={28} />}
        title="No data yet"
        description="Add transactions to see spending trends and category breakdowns."
      />
    );
  }

  const isDark = document.documentElement.classList.contains('dark');
  const axisColor = isDark ? '#6b7280' : '#9ca3af';
  const gridColor = isDark ? '#1f2937' : '#f3f4f6';

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Time range selector */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {(['1m', '2m', '3m', '6m', '12m'] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              range === r
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {r === '12m' ? '1 Yr' : `${r.replace('m', '')} Mo`}
          </button>
        ))}
      </div>

      {/* Monthly spending trend */}
      <UICard>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-blue-500" />
          Monthly Trend
        </h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#1f2937' : '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  fontSize: '12px',
                  color: isDark ? '#f3f4f6' : '#111827',
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Area type="monotone" dataKey="spent" stroke="#ef4444" fill="url(#spentGrad)" strokeWidth={2} name="Spent" />
              <Area type="monotone" dataKey="income" stroke="#22c55e" fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </UICard>

      {/* Monthly trend by category — stacked bar chart */}
      {topCategories.length > 0 && (
        <UICard>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-purple-500" />
            Monthly Trend by Category
          </h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyCategoryData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1f2937' : '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    color: isDark ? '#f3f4f6' : '#111827',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                {topCategories.map((cat) => (
                  <Bar key={cat.name} dataKey={cat.name} stackId="cat" fill={cat.color} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </UICard>
      )}

      {/* Card comparison bar chart */}
      {cardData.length > 1 && (
        <UICard>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Spending by Card</h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cardData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1f2937' : '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    color: isDark ? '#f3f4f6' : '#111827',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="spent" radius={[6, 6, 0, 0]} name="Spent">
                  {cardData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </UICard>
      )}
    </div>
  );
}
