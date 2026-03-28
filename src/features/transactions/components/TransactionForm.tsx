import { useState, useEffect } from 'react';
import { DollarSign, Calendar, Tag, CreditCard, FileText, Plus, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { Button, Input, Select, Modal } from '../../../ui';
import type { Transaction, Category, Card } from '../../../core/types';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  initial?: Partial<Transaction>;
}

export function TransactionForm({ isOpen, onClose, onSubmit, initial }: TransactionFormProps) {
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];

  const [type, setType] = useState<'debit' | 'credit'>(initial?.type ?? 'debit');
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [cardId, setCardId] = useState(initial?.cardId ?? '');
  const [date, setDate] = useState(() => {
    try {
      if (initial?.date) {
        const d = new Date(initial.date);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0] ?? '';
      }
    } catch { /* invalid date — fall through */ }
    return new Date().toISOString().split('T')[0] ?? '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-categorize based on merchant
  useEffect(() => {
    if (!merchant || categoryId) return;
    const lower = merchant.toLowerCase();
    const match = categories.find((c) => c.keywords.some((k) => lower.includes(k)));
    if (match) setCategoryId(match.id);
  }, [merchant, categories, categoryId]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) newErrors['amount'] = 'Enter a valid amount';
    if (!description.trim()) newErrors['description'] = 'Required';
    if (!date) newErrors['date'] = 'Required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        date: new Date(date + 'T12:00:00'),
        amount: parseFloat(amount),
        description: description.trim(),
        merchant: merchant.trim() || description.trim(),
        categoryId,
        cardId,
        type,
        tags: [],
        isRecurring: false,
        importSource: 'manual',
      });
      onClose();
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setMerchant('');
    setCategoryId('');
    setDate(new Date().toISOString().split('T')[0] ?? '');
    setErrors({});
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit Transaction' : 'Add Transaction'} size="md">
      <div className="flex flex-col gap-4">
        {/* Type toggle — one tap */}
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          <button
            onClick={() => setType('debit')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
              type === 'debit'
                ? 'bg-red-500 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            Expense
          </button>
          <button
            onClick={() => setType('credit')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
              type === 'credit'
                ? 'bg-green-500 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            Income
          </button>
        </div>

        {/* Amount — big and prominent */}
        <Input
          label="Amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          icon={<DollarSign size={16} />}
          error={errors['amount']}
          autoFocus
        />

        <Input
          label="Description"
          placeholder="What was this for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          icon={<FileText size={16} />}
          error={errors['description']}
        />

        <Input
          label="Merchant"
          placeholder="Store or service name (optional)"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          icon={<Tag size={16} />}
          helperText="Auto-categorizes based on merchant"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={errors['date']}
          />

          <Select
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder="Auto-detect"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>

        {cards.length > 0 && (
          <Select
            label="Card"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            placeholder="Select card"
            options={cards.map((c) => ({ value: c.id, label: `${c.name} (...${c.lastFour})` }))}
          />
        )}

        <Button onClick={handleSubmit} isLoading={isSubmitting} fullWidth icon={<Plus size={16} />}>
          {initial ? 'Update' : 'Add Transaction'}
        </Button>
      </div>
    </Modal>
  );
}
