import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Receipt, PieChart, Upload, Settings, Wallet, Moon, Sun, Plus, Download, UploadCloud } from 'lucide-react';
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
  const { showToast } = useToast();

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

  const handleImport = () => {
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
        // Restore data — clear existing and bulk add
        await db.transaction('rw', [db.transactions, db.categories, db.cards, db.budgets, db.moneySpills, db.settings], async () => {
          await db.transactions.clear();
          await db.categories.clear();
          await db.cards.clear();
          await db.budgets.clear();
          await db.moneySpills.clear();
          await db.settings.clear();

          // Restore dates (JSON.parse turns them into strings)
          const txns = data.transactions.map((t: any) => ({
            ...t,
            date: new Date(t.date),
            createdAt: new Date(t.createdAt),
            updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined,
          }));
          const cats = data.categories.map((c: any) => ({
            ...c,
            createdAt: new Date(c.createdAt),
          }));

          if (txns.length) await db.transactions.bulkAdd(txns);
          if (cats.length) await db.categories.bulkAdd(cats);
          if (data.cards?.length) await db.cards.bulkAdd(data.cards);
          if (data.budgets?.length) await db.budgets.bulkAdd(data.budgets);
          if (data.moneySpills?.length) await db.moneySpills.bulkAdd(data.moneySpills.map((s: any) => ({
            ...s,
            detectedAt: new Date(s.detectedAt),
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

  return (
    <div className="p-4 animate-fade-in flex flex-col gap-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Cards section */}
      <CardManager />

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
                  Always back up before clearing browser data.
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
                    onClick={handleImport}
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
                  Re-run auto-categorization on all existing transactions using the latest category keywords.
                  Useful after importing statements or when categories have been updated.
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
        </div>
      </div>
    </div>
  );
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/transactions', icon: Receipt, label: 'Txns' },
  { to: '/analytics', icon: PieChart, label: 'Stats' },
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
