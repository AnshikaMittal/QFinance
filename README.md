# QuickFinance - Personal Expense Tracker PWA

A modern, offline-first Progressive Web App for tracking personal expenses with real-time analytics, budget management, and CSV import capabilities.

## Features

- **Offline Support**: Full offline functionality with IndexedDB (Dexie.js) for local data storage
- **Real-time Analytics**: Charts and insights powered by Recharts
- **Budget Management**: Set and track spending budgets by category
- **CSV Import**: Import transactions from major card providers (Chase, Apple Card, generic)
- **Multi-card Support**: Track spending across multiple cards
- **PWA Ready**: Installable on mobile devices with web app manifest
- **Type-Safe**: Built with TypeScript for reliability
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Category Auto-suggestion**: Keywords-based auto-categorization for imported transactions

## Tech Stack

- **Frontend**: React 18.2 + TypeScript
- **Routing**: React Router v6
- **Database**: Dexie.js (IndexedDB wrapper)
- **Charts**: Recharts
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Build Tool**: Vite
- **UUID Generation**: uuid

## Project Structure

```
src/
├── core/                    # Core application logic
│   ├── types/              # TypeScript type definitions
│   ├── db/                 # Database schema and seed data
│   ├── hooks/              # Custom React hooks
│   └── utils/              # Helper functions and formatters
├── features/               # Feature modules (lazy-loadable)
│   ├── transactions/       # Transaction management
│   ├── categories/         # Category management
│   ├── budgets/           # Budget tracking
│   ├── analytics/         # Analytics and insights
│   ├── dashboard/         # Dashboard overview
│   ├── csv-import/        # CSV import functionality
│   ├── sync/              # Data synchronization
│   └── settings/          # App settings
├── ui/                     # Reusable UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Modal.tsx
│   ├── Input.tsx
│   ├── Badge.tsx
│   └── ProgressBar.tsx
├── test/                   # Test setup and utilities
├── App.tsx                # Main app component
├── main.tsx               # Entry point
└── index.css              # Global styles
```

## Installation

### Prerequisites
- Node.js 16+ and npm 8+

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check
```

## Core Types

### Transaction
```typescript
interface Transaction {
  id: string;
  date: Date;
  amount: number;
  description: string;
  merchant: string;
  categoryId: string;
  cardId: string;
  type: 'debit' | 'credit';
  tags: string[];
  isRecurring: boolean;
  importSource: 'manual' | 'csv';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Category
```typescript
interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  keywords: string[];  // For auto-categorization
  isDefault: boolean;
  createdAt: Date;
}
```

### Budget
```typescript
interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  startDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Default Categories

The app comes with 12 pre-configured default categories:
- Groceries
- Dining
- Transport
- Shopping
- Entertainment
- Bills & Utilities
- Health
- Subscriptions
- Travel
- Education
- Income
- Other

Each category has keyword associations for auto-categorization during CSV imports.

## Database

QuickFinance uses Dexie.js for IndexedDB management. The database automatically:
- Creates tables on first load
- Seeds default categories
- Indexes transactions by date, category, and card for fast queries
- Maintains referential relationships

### Tables
- `transactions`: All financial transactions
- `categories`: Expense categories
- `cards`: Payment cards/accounts
- `budgets`: Budget definitions
- `moneySpills`: Detected spending anomalies
- `settings`: User preferences

## UI Components

### Button
Flexible button component with variants (primary, secondary, danger, ghost) and sizes (sm, md, lg).

### Card
Reusable card container with configurable padding.

### Modal
Full-featured modal dialog with overlay and close button.

### Input
Form input with label, error handling, and helper text.

### Badge
Styled badge component with color customization.

### ProgressBar
Visual progress indicator with color-coding based on value.

## Utilities

### formatters.ts
- `formatCurrency(amount, currency)`: Format numbers as currency
- `formatDate(date, format)`: Format dates in various formats
- `formatPercent(value, decimals)`: Format decimals as percentages
- `truncate(str, maxLength)`: Truncate strings with ellipsis

## Hooks

### useLiveQuery
Re-exported from dexie-react-hooks for reactive database queries in React components.

## CSV Import

The CSV import feature supports:
- **Chase** statements (standard format)
- **Apple Card** export format
- **Generic** CSV format with column mapping

Auto-detection is based on header patterns, with fallback to generic parser.

## PWA Configuration

The app includes:
- Web App Manifest (`public/manifest.json`)
- Service Worker ready architecture
- Installable on iOS and Android
- Standalone display mode
- Custom theme colors

## Next Steps

To build out features, add components and hooks to each feature module:

```
features/transactions/
├── components/
│   ├── TransactionList.tsx
│   ├── TransactionForm.tsx
│   └── TransactionCard.tsx
├── hooks/
│   ├── useTransactions.ts
│   └── useTransactionFilters.ts
├── utils/
│   └── transactionHelpers.ts
└── index.ts
```

## Performance Considerations

- Code splitting via React Router for faster initial load
- Dexie.js for efficient local storage
- Indexed queries for transactions (date, category, card)
- Lazy loading of feature modules
- Tailwind CSS for minimal CSS footprint

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+
- Mobile browsers (iOS Safari 15+, Chrome Mobile)

## License

MIT

## Development

This project uses:
- TypeScript strict mode for type safety
- Tailwind CSS for styling consistency
- Vite for fast development experience
- Dexie.js for robust offline-first storage

Happy expense tracking!
