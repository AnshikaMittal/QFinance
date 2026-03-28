import { useState } from 'react';
import { CreditCard, Plus, Trash2, Pencil } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../core/db';
import { Button, Input, Select, Modal, Card as UICard, EmptyState } from '../../../ui';
import type { Card } from '../../../core/types';

const CARD_COLORS = [
  { value: '#1e40af', label: 'Navy' },
  { value: '#0f766e', label: 'Teal' },
  { value: '#15803d', label: 'Green' },
  { value: '#b91c1c', label: 'Red' },
  { value: '#7c3aed', label: 'Purple' },
  { value: '#c2410c', label: 'Orange' },
  { value: '#1f2937', label: 'Black' },
  { value: '#6b7280', label: 'Gray' },
];

const ISSUERS = [
  { value: 'chase', label: 'Chase' },
  { value: 'apple', label: 'Apple Card' },
  { value: 'amex', label: 'American Express' },
  { value: 'citi', label: 'Citi' },
  { value: 'discover', label: 'Discover' },
  { value: 'bofa', label: 'Bank of America' },
  { value: 'capital-one', label: 'Capital One' },
  { value: 'other', label: 'Other' },
];

export function CardManager() {
  const cards = useLiveQuery(() => db.cards.toArray()) ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('chase');
  const [lastFour, setLastFour] = useState('');
  const [color, setColor] = useState('#1e40af');
  const [type, setType] = useState<'credit' | 'debit'>('credit');

  const resetForm = () => {
    setName('');
    setIssuer('chase');
    setLastFour('');
    setColor('#1e40af');
    setType('credit');
    setEditingCard(null);
  };

  const openEdit = (card: Card) => {
    setEditingCard(card);
    setName(card.name);
    setIssuer(card.issuer);
    setLastFour(card.lastFour);
    setColor(card.color);
    setType(card.type);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !lastFour.trim()) return;

    if (editingCard) {
      await db.cards.update(editingCard.id, {
        name: name.trim(),
        issuer,
        lastFour: lastFour.trim(),
        color,
        type,
      });
    } else {
      await db.cards.add({
        id: uuidv4(),
        name: name.trim(),
        issuer,
        lastFour: lastFour.trim(),
        color,
        type,
        createdAt: new Date(),
      });
    }
    setShowForm(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await db.cards.delete(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Cards</h2>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          icon={<Plus size={14} />}
        >
          Add
        </Button>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={24} />}
          title="No cards added"
          description="Add your credit or debit cards to track spending per card."
          action={
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              icon={<Plus size={14} />}
            >
              Add Card
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="group flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800 animate-fade-in"
            >
              <div
                className="w-10 h-7 rounded-md flex items-center justify-center shadow-sm"
                style={{ backgroundColor: card.color }}
              >
                <CreditCard size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{card.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {ISSUERS.find((i) => i.value === card.issuer)?.label ?? card.issuer} · ...{card.lastFour}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(card)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(card.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={editingCard ? 'Edit Card' : 'Add Card'}
      >
        <div className="flex flex-col gap-4">
          <Input label="Card Name" placeholder="e.g. Chase Freedom Flex" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} options={ISSUERS} />
            <Input label="Last 4 Digits" placeholder="1234" maxLength={4} value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value as 'credit' | 'debit')}
              options={[
                { value: 'credit', label: 'Credit' },
                { value: 'debit', label: 'Debit' },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {CARD_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    className={`w-7 h-7 rounded-lg transition-all ${
                      color === c.value ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <Button onClick={handleSave} fullWidth>
            {editingCard ? 'Save Changes' : 'Add Card'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
