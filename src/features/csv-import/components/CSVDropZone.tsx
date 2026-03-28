import { useState, useRef, useCallback } from 'react';
import { Upload, CheckCircle, AlertCircle, ArrowLeft, Loader2, CreditCard } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { Button, Select, Card as UICard, Badge, EmptyState } from '../../../ui';
import { useCSVImport } from '../hooks/useCSVImport';
import { formatCurrency } from '../../../core/utils';

function formatParserName(parser: string): string {
  const names: Record<string, string> = {
    'chase': 'CHASE CSV',
    'apple-card': 'APPLE CARD CSV',
    'chase-pdf': 'CHASE PDF',
    'apple-card-pdf': 'APPLE CARD PDF',
    'generic': 'AUTO',
  };
  return names[parser] ?? parser.toUpperCase();
}

export function CSVDropZone() {
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const [cardId, setCardId] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status, result, error, importedCount, parseFile, confirmImport, reset } = useCSVImport();
  const isImporting = status === 'importing';

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && cardId) {
        parseFile(file, cardId);
      }
    },
    [cardId, parseFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && cardId) {
        parseFile(file, cardId);
      }
    },
    [cardId, parseFile],
  );

  // Success state
  if (status === 'done') {
    return (
      <div className="flex flex-col items-center py-8 animate-scale-in">
        <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle className="text-green-500" size={28} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Import Complete</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
          {importedCount} transaction{importedCount !== 1 ? 's' : ''} imported successfully.
        </p>
        {result && result.parseErrors.length > 0 && (
          <p className="text-xs text-amber-500 mb-4">{result.parseErrors.length} row(s) skipped due to errors</p>
        )}
        <Button onClick={reset} variant="secondary" size="sm">
          Import Another
        </Button>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center py-8 animate-scale-in">
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="text-red-500" size={28} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Import Failed</h3>
        <p className="text-sm text-red-500 dark:text-red-400 text-center max-w-xs mb-4">{error}</p>
        <Button onClick={reset} variant="secondary" size="sm">
          Try Again
        </Button>
      </div>
    );
  }

  // Preview state
  if (status === 'preview' && result) {
    const totalAmount = result.transactions.reduce((sum, t) => sum + t.amount, 0);
    const debits = result.transactions.filter((t) => t.type === 'debit');
    const credits = result.transactions.filter((t) => t.type === 'credit');

    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={reset} className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <ArrowLeft size={18} />
          </button>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Preview Import</h3>
        </div>

        <UICard className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <Badge color="#3b82f6">{formatParserName(result.parserUsed)}</Badge>
            <span className="text-xs text-gray-400">{result.transactions.length} transactions</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Expenses</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{debits.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Income</div>
              <div className="text-sm font-semibold text-green-600 dark:text-green-400">{credits.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Net</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatCurrency(credits.reduce((s, t) => s + t.amount, 0) - debits.reduce((s, t) => s + t.amount, 0))}
              </div>
            </div>
          </div>
          {result.parseErrors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-amber-500">{result.parseErrors.length} row(s) had errors and will be skipped</p>
            </div>
          )}
        </UICard>

        {/* Transaction preview list */}
        <div className="max-h-64 overflow-y-auto mb-4 rounded-xl border border-gray-200/60 dark:border-gray-800">
          {result.transactions.slice(0, 20).map((t, i) => {
            const cat = categories.find((c) => c.id === t.categoryId);
            return (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0"
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: cat?.color ?? '#9ca3af' }}
                >
                  {(cat?.name ?? '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{t.merchant || t.description}</div>
                  <div className="text-xs text-gray-400">{cat?.name ?? 'Uncategorized'} · {t.date.toLocaleDateString()}</div>
                </div>
              </div>
              <span className={`text-sm font-medium tabular-nums ${t.type === 'credit' ? 'text-green-500' : 'text-gray-900 dark:text-gray-100'}`}>
                {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
              </span>
            </div>
            );
          })}
          {result.transactions.length > 20 && (
            <div className="px-3 py-2 text-xs text-gray-400 text-center">
              ...and {result.transactions.length - 20} more
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={reset} variant="secondary" fullWidth>Cancel</Button>
          <Button
            onClick={confirmImport}
            fullWidth
            isLoading={isImporting}
            icon={<CheckCircle size={16} />}
          >
            Import {result.transactions.length} Transactions
          </Button>
        </div>
      </div>
    );
  }

  // Default: drop zone
  return (
    <div className="animate-fade-in">
      {/* Card selection */}
      <div className="mb-4">
        {cards.length === 0 ? (
          <UICard>
            <div className="flex items-center gap-3">
              <CreditCard size={18} className="text-amber-500" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Add a card first</p>
                <p className="text-xs text-gray-400">Go to Settings to add your Chase or Apple Card before importing.</p>
              </div>
            </div>
          </UICard>
        ) : (
          <Select
            label="Which card is this statement from?"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            placeholder="Select a card"
            options={cards.map((c) => ({ value: c.id, label: `${c.name} (...${c.lastFour})` }))}
          />
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => cardId && fileInputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center
          py-12 px-4 rounded-2xl border-2 border-dashed cursor-pointer
          transition-all duration-200
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/5 scale-[1.01]'
              : cardId
              ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/30'
              : 'border-gray-200 dark:border-gray-800 opacity-50 cursor-not-allowed'
          }
        `.trim()}
      >
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
          isDragging ? 'bg-blue-100 dark:bg-blue-500/10' : 'bg-gray-100 dark:bg-gray-800'
        }`}>
          {status === 'parsing' ? (
            <Loader2 size={24} className="text-blue-500 animate-spin" />
          ) : (
            <Upload size={24} className={isDragging ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'} />
          )}
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {status === 'parsing' ? 'Parsing...' : 'Drop CSV or PDF statement here'}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          or tap to browse · Chase & Apple Card supported
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
