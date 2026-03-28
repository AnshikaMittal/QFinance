import { useState } from 'react';
import { Plus, Trash2, Target, AlertCircle } from 'lucide-react';
import { Card as UICard, Button, Modal, Input, Select, ProgressBar, EmptyState, Badge } from '../../../ui';
import { useBudgets } from '../hooks/useBudgets';
import { formatCurrency } from '../../../core/utils';
import type { Budget } from '../../../core/types';

export function BudgetManager() {
  const { budgets, categories, addBudget, removeBudget } = useBudgets();
  const [showAdd, setShowAdd] = useState(false);
  const [newBudget, setNewBudget] = useState({ categoryId: '', amount: '', period: 'monthly' as Budget['period'] });

  const handleAdd = async () => {
    if (!newBudget.categoryId || !newBudget.amount) return;
    await addBudget({
      categoryId: newBudget.categoryId,
      amount: parseFloat(newBudget.amount),
      period: newBudget.period,
    });
    setNewBudget({ categoryId: '', amount: '', period: 'monthly' });
    setShowAdd(false);
  };

  // Categories not yet budgeted
  const availableCategories = categories.filter(
    c => !budgets.some(b => b.categoryId === c.id) && c.name !== 'Income'
  );

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Budget Goals</h3>
        <Button size="sm" variant="ghost" onClick={() => setShowAdd(true)} icon={<Plus size={14} />}>
          Add
        </Button>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title="No budgets set"
          description="Set spending limits for your categories to stay on track."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {budgets.map((budget) => {
            const isOver = budget.percentUsed >= 100;
            const isWarning = budget.percentUsed >= 80 && !isOver;

            return (
              <UICard key={budget.id} padding="sm" className="animate-slide-up">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: budget.categoryColor }}
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {budget.categoryName}
                    </span>
                    <Badge color={isOver ? '#ef4444' : isWarning ? '#f59e0b' : '#22c55e'}>
                      {budget.period}
                    </Badge>
                  </div>
                  <button
                    onClick={() => removeBudget(budget.id)}
                    className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <ProgressBar
                  value={budget.spent}
                  max={budget.amount}
                  color={isOver ? '#ef4444' : isWarning ? '#f59e0b' : budget.categoryColor}
                  size="md"
                />

                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">
                    {formatCurrency(budget.spent)} of {formatCurrency(budget.amount)}
                  </span>
                  <span className={`text-xs font-semibold ${isOver ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-green-500'}`}>
                    {isOver ? (
                      <span className="flex items-center gap-0.5">
                        <AlertCircle size={10} /> Over by {formatCurrency(budget.spent - budget.amount)}
                      </span>
                    ) : (
                      `${formatCurrency(budget.remaining)} left`
                    )}
                  </span>
                </div>
              </UICard>
            );
          })}
        </div>
      )}

      {/* Add budget modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Budget" size="sm">
        <div className="flex flex-col gap-4">
          <Select
            label="Category"
            value={newBudget.categoryId}
            onChange={(e) => setNewBudget(prev => ({ ...prev, categoryId: e.target.value }))}
            placeholder="Select category"
            options={availableCategories.map(c => ({ value: c.id, label: c.name }))}
          />
          <Input
            label="Budget Amount"
            type="number"
            value={newBudget.amount}
            onChange={(e) => setNewBudget(prev => ({ ...prev, amount: e.target.value }))}
            placeholder="0.00"
          />
          <Select
            label="Period"
            value={newBudget.period}
            onChange={(e) => setNewBudget(prev => ({ ...prev, period: e.target.value as Budget['period'] }))}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
          <Button onClick={handleAdd} fullWidth disabled={!newBudget.categoryId || !newBudget.amount}>
            Set Budget
          </Button>
        </div>
      </Modal>
    </div>
  );
}
