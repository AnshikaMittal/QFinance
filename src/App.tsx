import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Receipt, PieChart, Upload, Settings, Wallet, Moon, Sun, Plus, Download, UploadCloud, Trash2, AlertTriangle, CreditCard, Bell, Check } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ThemeProvider, useTheme } from './core/hooks';
import { ToastProvider, useToast, Button } from './ui';
import { seedDefaultCategories } from './core/db/seed';
import { recategorizeAll } from './core/utils/categorizer';
import { db } from './core/db';
import { DashboardView } from './features/dashboard';
import { TransactionList, TransactionForm, useTransactions } from './features/transactions';
import { CSVDropZone } from './features/csv-import';
import { CardManager } from './features/settings';
import { MoneySpillsView, TrendCharts } from './features/analytics';
import { BudgetManager } from './features/budgets';
import { RefreshCw, Tag } from 'lucide-react';

function DashboardPage() {
  return <DashboardView />;
}

function TransactionsPage() {
  const { transactions, addTransaction, deleteTransaction } = useTransactions();
  const [showForm, setShowForm] = useState(false);
  const { showToast } = useToast();

  return (
    <div className="p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Transactions</h1>
        <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus size={14} />}>
          Add
        </Button>
      </div>
      <TransactionList
        transactions={transactions}
        onDelete={async (id) => {
          await deleteTransaction(id);
          showToast('Transaction deleted', 'success');
        }}
      />
      <TransactionForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={async (data) => {
          await addTransaction(data);
          showToast('Transaction added', 'success');
        }}
      />
    </div>
  );
}

function AnalyticsPage() {
  const [tab, setTab] = useState<'spills' | 'trends' | 'budgets'>('spills');

  return (
    <div className="p-4 animate-fade-in">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Analytics</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-4">
        {([['spills', 'Spills'], ['trends', 'Trends'], ['budgets', 'Budgets']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
              tab === key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'spills' && <MoneySpillsView />}
      {tab === 'trends' && <TrendCharts />}
      {tab === 'budgets' && <BudgetManager />}
    </div>
  );
}

function ImportPage() {
  return (
    <div className="p-4 animate-fade-in">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Import Statements</h1>
      <CSVDropZone />
    </div>
  );
}

function SettingsPage() {
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [recatResult, setRecatResult] = useState<{ updated: number; total: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const { showToast } = useToast();

  // Load existing Telegram settings
  const savedSettings = useLiveQuery(() => db.settings.toArray());
  useEffect(() => {
    if (savedSettings && savedSettings.length > 0) {
      const settings = savedSettings[0];
      if (settings?.telegramChatId) {
        setTelegramChatId(settings.telegramChatId);
      }
    }
  }, [savedSettings]);

  // ─── Import history data ───
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? [];

  interface CardSummary {
    cardId: string;
    cardName: string;
    lastFour: string;
    color: string;
    count: number;
    total: number;
    sources: string[];
    dateRange: string;
    monthsCovered: string[];   // e.g. ['Jan 2026', 'Feb 2026']
    monthsMissing: string[];   // e.g. ['Mar 2026'] — gaps between first and last month
  }

  const importSummary = useCallback((): { byCard: CardSummary[]; totalTxns: number; totalCards: number } => {
    if (!transactions.length) return { byCard: [], totalTxns: 0, totalCards: 0 };

    const cardMap = new Map(cards.map(c => [c.id, c]));
    const byCardId = new Map<string, { count: number; total: number; sources: Set<string>; months: Set<string>; minDate: Date; maxDate: Date }>();

    for (const txn of transactions) {
      const entry = byCardId.get(txn.cardId) ?? { count: 0, total: 0, sources: new Set<string>(), months: new Set<string>(), minDate: txn.date, maxDate: txn.date };
      entry.count++;
      if (txn.type === 'debit') entry.total += txn.amount;
      entry.sources.add(txn.importSource);
      // Track month key like "2026-01"
      const monthKey = `${txn.date.getFullYear()}-${String(txn.date.getMonth() + 1).padStart(2, '0')}`;
      entry.months.add(monthKey);
      if (txn.date < entry.minDate) entry.minDate = txn.date;
      if (txn.date > entry.maxDate) entry.maxDate = txn.date;
      byCardId.set(txn.cardId, entry);
    }

    const fmtMonth = (key: string) => {
      const [y, m] = key.split('-');
      const d = new Date(parseInt(y!), parseInt(m!) - 1);
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    const byCard: CardSummary[] = Array.from(byCardId.entries()).map(([cardId, data]) => {
      const card = cardMap.get(cardId);
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const dateRange = fmt(data.minDate) === fmt(data.maxDate) ? fmt(data.minDate) : `${fmt(data.minDate)} – ${fmt(data.maxDate)}`;

      // Compute expected months between first and last date
      const monthsCovered = Array.from(data.months).sort();
      const monthsMissing: string[] = [];
      if (monthsCovered.length >= 2) {
        const startDate = data.minDate;
        const endDate = data.maxDate;
        const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        while (cursor <= endMonth) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
          if (!data.months.has(key)) {
            monthsMissing.push(key);
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      return {
        cardId,
        cardName: card ? card.name : 'Unknown Card',
        lastFour: card ? card.lastFour : '????',
        color: card?.color ?? '#6b7280',
        count: data.count,
        total: data.total,
        sources: Array.from(data.sources),
        dateRange,
        monthsCovered: monthsCovered.map(fmtMonth),
        monthsMissing: monthsMissing.map(fmtMonth),
      };
    }).sort((a, b) => b.count - a.count);

    return { byCard, totalTxns: transactions.length, totalCards: cards.length };
  }, [cards, transactions]);

  const summary = importSummary();

  const handleRecategorize = async () => {
    setIsRecategorizing(true);
    setRecatResult(null);
    try {
      const result = await recategorizeAll();
      setRecatResult(result);
      showToast(`Updated ${result.updated} of ${result.total} transactions`, 'success');
    } catch {
      showToast('Failed to re-categorize', 'error');
    } finally {
      setIsRecategorizing(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions: await db.transactions.toArray(),
        categories: await db.categories.toArray(),
        cards: await db.cards.toArray(),
        budgets: await db.budgets.toArray(),
        moneySpills: await db.moneySpills.toArray(),
        settings: await db.settings.toArray(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quickfinance-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${data.transactions.length} transactions`, 'success');
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setIsImporting(true);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version || !data.transactions) {
          showToast('Invalid backup file', 'error');
          return;
        }
        await db.transaction('rw', [db.transactions, db.categories, db.cards, db.budgets, db.moneySpills, db.settings], async () => {
          await db.transactions.clear();
          await db.categories.clear();
          await db.cards.clear();
          await db.budgets.clear();
          await db.moneySpills.clear();
          await db.settings.clear();

          const txns = data.transactions.map((t: Record<string, unknown>) => ({
            ...t,
            date: new Date(t.date as string),
            createdAt: new Date(t.createdAt as string),
            updatedAt: t.updatedAt ? new Date(t.updatedAt as string) : undefined,
          }));
          const cats = data.categories.map((c: Record<string, unknown>) => ({
            ...c,
            createdAt: new Date(c.createdAt as string),
          }));

          if (txns.length) await db.transactions.bulkAdd(txns);
          if (cats.length) await db.categories.bulkAdd(cats);
          if (data.cards?.length) await db.cards.bulkAdd(data.cards);
          if (data.budgets?.length) await db.budgets.bulkAdd(data.budgets);
          if (data.moneySpills?.length) await db.moneySpills.bulkAdd(data.moneySpills.map((s: Record<string, unknown>) => ({
            ...s,
            detectedAt: new Date(s.detectedAt as string),
          })));
          if (data.settings?.length) await db.settings.bulkAdd(data.settings);
        });
        showToast(`Restored ${data.transactions.length} transactions from backup`, 'success');
      } catch {
        showToast('Failed to restore backup', 'error');
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  const handleClearAllData = async () => {
    if (clearConfirmText !== 'DELETE') return;
    setIsClearing(true);
    try {
      await db.transaction('rw', [db.transactions, db.categories, db.cards, db.budgets, db.moneySpills, db.settings], async () => {
        await db.transactions.clear();
        await db.categories.clear();
        await db.cards.clear();
        await db.budgets.clear();
        await db.moneySpills.clear();
        await db.settings.clear();
      });
      // Re-seed default categories so the app still works
      await seedDefaultCategories();
      showToast('All data cleared', 'success');
      setShowClearConfirm(false);
      setClearConfirmText('');
    } catch {
      showToast('Failed to clear data', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="p-4 animate-fade-in flex flex-col gap-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Cards section */}
      <CardManager />

      {/* Notifications */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Notifications</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Bell size={18} className="text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Telegram Notifications</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                Get notified on Telegram when fixes are deployed. Enter your Telegram Chat ID to receive notifications.
              </p>
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 123456789"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                <button
                  onClick={async () => {
                    setIsSavingTelegram(true);
                    try {
                      const existing = await db.settings.toArray();
                      const current = existing[0];
                      if (current) {
                        await db.settings.update(current.id, {
                          telegramChatId: telegramChatId.trim() || undefined,
                          updatedAt: new Date(),
                        });
                      } else {
                        await db.settings.add({
                          id: 'default',
                          currency: 'USD',
                          theme: 'system',
                          telegramChatId: telegramChatId.trim() || undefined,
                          createdAt: new Date(),
                          updatedAt: new Date(),
                        });
                      }
                      showToast(telegramChatId.trim() ? 'Telegram notifications enabled' : 'Telegram notifications disabled', 'success');
                    } catch {
                      showToast('Failed to save notification settings', 'error');
                    } finally {
                      setIsSavingTelegram(false);
                    }
                  }}
                  disabled={isSavingTelegram}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  {isSavingTelegram ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                  Save
                </button>
              </div>
              {telegramChatId.trim() ? (
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[11px] text-green-600 dark:text-green-400">Notifications enabled</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">Not configured</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Import History & Statement Coverage */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Import History</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          {summary.totalTxns === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No transactions imported yet. Go to Import to add your statements.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Summary stats */}
              <div className="flex gap-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalTxns.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Transactions</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalCards}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Cards</p>
                </div>
              </div>

              {/* Per-card breakdown with month coverage */}
              {summary.byCard.map((card) => (
                <div key={card.cardId} className="flex flex-col gap-2">
                  {/* Card header */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: card.color + '18' }}>
                      <CreditCard size={16} style={{ color: card.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {card.cardName} {card.lastFour && card.lastFour !== '0000' && <span className="text-gray-400 font-normal">••{card.lastFour}</span>}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {card.count} transactions · ${card.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {card.sources.map((s) => (
                        <span key={s} className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Month coverage chips */}
                  <div className="ml-12 flex flex-wrap gap-1.5">
                    {card.monthsCovered.map((m) => (
                      <span key={m} className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200/50 dark:border-green-800/40">
                        {m}
                      </span>
                    ))}
                    {card.monthsMissing.map((m) => (
                      <span key={m} className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border border-red-200/50 dark:border-red-800/40 border-dashed">
                        {m}
                      </span>
                    ))}
                  </div>
                  {card.monthsMissing.length > 0 && (
                    <p className="ml-12 text-[10px] text-red-400 dark:text-red-500">
                      {card.monthsMissing.length} month{card.monthsMissing.length > 1 ? 's' : ''} missing — upload statement{card.monthsMissing.length > 1 ? 's' : ''} for {card.monthsMissing.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Data management */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Data Management</h2>
        <div className="flex flex-col gap-3">

          {/* Backup & Restore */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Download size={18} className="text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Backup & Restore</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  Export all your data as a JSON file, or restore from a previous backup.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    <Download size={12} />
                    {isExporting ? 'Exporting...' : 'Export Data'}
                  </button>
                  <button
                    onClick={handleRestoreBackup}
                    disabled={isImporting}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                  >
                    <UploadCloud size={12} />
                    {isImporting ? 'Restoring...' : 'Restore Backup'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Re-categorize */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <Tag size={18} className="text-purple-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Re-categorize Transactions</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  Re-run auto-categorization using the latest category keywords.
                </p>
                {recatResult && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 font-medium">
                    Updated {recatResult.updated} of {recatResult.total} transactions
                  </p>
                )}
                <button
                  onClick={handleRecategorize}
                  disabled={isRecategorizing}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isRecategorizing ? 'animate-spin' : ''} />
                  {isRecategorizing ? 'Re-categorizing...' : 'Re-categorize All'}
                </button>
              </div>
            </div>
          </div>

          {/* Clear All Data */}
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/40 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Clear All Data</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  Permanently delete all transactions, cards, budgets, and spills. Categories will be reset to defaults. This cannot be undone.
                </p>
                {!showClearConfirm ? (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 size={12} />
                    Clear Everything
                  </button>
                ) : (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/40">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                      <AlertTriangle size={14} />
                      <span className="text-xs font-semibold">This will delete {summary.totalTxns} transactions across {summary.totalCards} cards</span>
                    </div>
                    <p className="text-[11px] text-red-500 dark:text-red-400/80 mb-2">Type <strong>DELETE</strong> to confirm:</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={clearConfirmText}
                        onChange={(e) => setClearConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                      />
                      <button
                        onClick={handleClearAllData}
                        disabled={clearConfirmText !== 'DELETE' || isClearing}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isClearing ? 'Clearing...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => { setShowClearConfirm(false); setClearConfirmText(''); }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/analytics', icon: PieChart, label: 'Stats' },
  { to: '/transactions', icon: Receipt, label: 'Txns' },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-all active:scale-95"
      aria-label="Toggle theme"
    >
      {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppContent() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    seedDefaultCategories().then(() => setIsReady(true));
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <Wallet className="text-blue-500 animate-pulse" size={32} />
          <span className="text-sm text-gray-400 dark:text-gray-500">Loading QuickFinance...</span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter basename="/QFinance">
      <ScrollToTop />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
        {/* Header */}
        <header className="glass border-b border-gray-200/60 dark:border-gray-800 px-4 py-3 sticky top-0 z-40">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center shadow-sm shadow-blue-600/20">
                <Wallet className="text-white" size={16} />
              </div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white">QuickFinance</h1>
            </div>
            <ThemeToggle />
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-lg mx-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 glass border-t border-gray-200/60 dark:border-gray-800 z-40 safe-area-bottom">
          <div className="max-w-lg mx-auto flex justify-around py-1.5">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={`p-1 rounded-lg transition-all duration-150 ${isActive ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}>
                      <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                    </div>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
