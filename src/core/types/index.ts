// Card types
export type CardId = string;

export interface Card {
  id: CardId;
  name: string;
  type: 'credit' | 'debit';
  issuer: string; // 'chase', 'apple', etc.
  lastFour: string;
  color: string;
  createdAt: Date;
}

// Category types
export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  icon: string;
  color: string;
  parentId?: CategoryId;
  keywords: string[]; // for auto-categorization
  isDefault: boolean;
  createdAt: Date;
}

// Transaction types
export interface Transaction {
  id: string;
  date: Date;
  amount: number;
  description: string;
  merchant: string;
  categoryId: CategoryId;
  cardId: CardId;
  type: 'debit' | 'credit';
  tags: string[];
  isRecurring: boolean;
  recurringGroupId?: string;
  importSource: 'manual' | 'csv' | 'pdf';
  rawCsvLine?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Budget types
export interface Budget {
  id: string;
  categoryId: CategoryId;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  startDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Money Spill types
export type SpillResolution = 'unresolved' | 'disputed' | 'resolved' | 'legitimate';

export interface MoneySpill {
  id: string;
  type: 'duplicate' | 'subscription-forgotten' | 'spending-creep' | 'impulse';
  description: string;
  transactions: string[]; // transaction IDs
  estimatedWaste: number;
  period: string;
  isDismissed: boolean;
  resolution: SpillResolution;
  resolvedAt?: Date;
  resolutionNote?: string;
  detectedAt: Date;
}

// Analytics types
export interface SpendingSummary {
  totalSpent: number;
  totalIncome: number;
  netCashFlow: number;
  byCategory: Record<CategoryId, number>;
  byCard: Record<CardId, number>;
  transactionCount: number;
  averageTransaction: number;
  period: { start: Date; end: Date };
}

// Sync types
export interface SyncState {
  lastSyncAt: Date | null;
  lastSyncStatus: 'success' | 'error' | 'pending';
  remoteRepo?: string;
}

// Import types
export type CSVParserType = 'chase' | 'apple-card' | 'citi' | 'robinhood' | 'first-tech' | 'generic';
export type ImportParserType = CSVParserType | 'chase-pdf' | 'apple-card-pdf';

export interface DetectedCardInfo {
  issuer: string;       // 'chase', 'apple', etc.
  lastFour: string;     // last 4 digits of card number, or '' if unknown
  name: string;         // e.g. 'Chase Freedom', 'Apple Card'
  color: string;        // default color for auto-created card
}

export interface CSVImportResult {
  transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[];
  duplicatesSkipped: number;
  parseErrors: string[];
  parserUsed: ImportParserType;
  detectedCard?: DetectedCardInfo;
}

// App Settings
export interface AppSettings {
  id: string;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  defaultCardId?: CardId;
  githubToken?: string; // encrypted
  githubRepo?: string;
  telegramChatId?: string;
  createdAt: Date;
  updatedAt: Date;
}
