# Architecture Guide

## Design Principles

### 1. Feature-Based Modularity
Each feature is a self-contained module under `src/features/`. Modules communicate through the shared type system in `src/core/types/` and the Dexie.js database. This design enables:
- Independent development of features
- Minimal context needed for changes (token-optimized for AI agents)
- Clear boundaries and responsibilities

### 2. Offline-First
All data lives in IndexedDB (via Dexie.js) on the user's device. GitHub sync is optional and encrypted. The app is fully functional without any network connection.

### 3. Progressive Enhancement
Core functionality (transaction tracking, categorization) works immediately. Advanced features (analytics, money spill detection, sync) layer on top without affecting the core.

## Data Flow

```
CSV File / Manual Entry
        │
        ▼
┌─────────────────┐
│  CSV Parser /    │
│  Transaction     │──── validates ──── Core Types
│  Form            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Auto-           │
│  Categorization  │──── reads ──── Category Rules (IndexedDB)
│  Engine          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Dexie.js        │
│  (IndexedDB)     │──── stores ──── Transactions, Categories, Budgets
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
Dashboard  Analytics
    │         │
    ▼         ▼
  Charts   Money Spill
  Budget   Detection
  Alerts   Trends
```

## Database Schema

The database uses Dexie.js v4 with the following tables:

- **transactions**: Core financial records with compound indexes on [cardId+date] and [categoryId+date] for efficient queries
- **categories**: Spending categories with keyword lists for auto-categorization
- **cards**: Credit/debit card definitions
- **budgets**: Per-category spending limits
- **moneySpills**: Detected spending anomalies
- **settings**: App configuration (single row)

### Migration Strategy
Database migrations are handled through Dexie's version() API. Each schema change increments the version number. The Compatibility Agent ensures all migrations are backward-compatible and include rollback logic.

## Module Boundaries

Each feature module exposes a public API through its `index.ts` barrel file. Internal components, hooks, and utilities are not exported. This enforces encapsulation and prevents cross-module coupling.

### Module Communication Rules
1. Modules read from shared types in `src/core/types/`
2. Modules access data through Dexie.js directly (no cross-module imports)
3. Shared UI components live in `src/ui/`
4. Shared hooks (like `useLiveQuery`) live in `src/core/hooks/`
5. No feature module should import from another feature module

## Token Optimization for Claude Agents

When an agent needs to work on a specific feature:
1. Read `src/core/types/index.ts` for the type system
2. Read the target feature's `index.ts` and relevant files
3. Read `src/ui/index.ts` if UI changes are needed
4. Never load unrelated feature modules

This keeps the context window small and changes focused.
