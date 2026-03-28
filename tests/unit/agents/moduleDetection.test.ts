import { describe, it, expect } from 'vitest';

// Inline the detection logic for testing (avoid importing from agents/ which uses Node APIs)
function detectAffectedModule(title: string, body: string): string {
  const text = `${title} ${body}`.toLowerCase();

  const moduleKeywords: Record<string, string[]> = {
    'src/features/transactions': ['transaction', 'expense', 'spending', 'entry', 'add transaction'],
    'src/features/csv-import': ['csv', 'import', 'statement', 'chase', 'apple card', 'parse'],
    'src/features/budgets': ['budget', 'limit', 'goal', 'overspend'],
    'src/features/analytics': ['analytics', 'chart', 'trend', 'money spill', 'spending creep'],
    'src/features/dashboard': ['dashboard', 'overview', 'home', 'summary'],
    'src/features/categories': ['category', 'categorize', 'label'],
    'src/features/sync': ['sync', 'backup', 'github sync', 'cloud'],
    'src/features/settings': ['settings', 'card', 'config', 'theme', 'dark mode'],
    'src/ui': ['button', 'modal', 'input', 'ui', 'component', 'style', 'animation'],
    'src/core': ['database', 'db', 'schema', 'type', 'util', 'format'],
  };

  for (const [module, keywords] of Object.entries(moduleKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return module;
    }
  }

  return 'src';
}

describe('Module Detection', () => {
  it('detects transaction-related issues', () => {
    expect(detectAffectedModule('Bug in transaction form', 'Cannot add transaction')).toBe('src/features/transactions');
  });

  it('detects CSV import issues', () => {
    expect(detectAffectedModule('CSV import fails', 'Chase statement not parsing correctly')).toBe('src/features/csv-import');
  });

  it('detects analytics issues', () => {
    expect(detectAffectedModule('Chart not rendering', 'The trend chart shows wrong data')).toBe('src/features/analytics');
  });

  it('detects budget issues', () => {
    expect(detectAffectedModule('Budget limit not working', 'Overspend alert missing')).toBe('src/features/budgets');
  });

  it('detects dashboard issues', () => {
    expect(detectAffectedModule('Dashboard blank', 'Home overview not loading')).toBe('src/features/dashboard');
  });

  it('detects category issues', () => {
    expect(detectAffectedModule('Auto-categorize broken', 'Wrong category label')).toBe('src/features/categories');
  });

  it('detects sync issues', () => {
    expect(detectAffectedModule('GitHub sync failed', 'Backup not working')).toBe('src/features/sync');
  });

  it('detects settings issues', () => {
    expect(detectAffectedModule('Dark mode toggle', 'Theme not persisting')).toBe('src/features/settings');
  });

  it('detects UI component issues', () => {
    expect(detectAffectedModule('Button styling', 'Modal animation broken')).toBe('src/ui');
  });

  it('detects core issues', () => {
    expect(detectAffectedModule('Database migration', 'Schema error on update')).toBe('src/core');
  });

  it('falls back to src for unknown issues', () => {
    expect(detectAffectedModule('Something completely random', 'No keywords match')).toBe('src');
  });
});
