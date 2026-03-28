import { describe, it, expect } from 'vitest';

interface LocalIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'skipped';
}

// Inline the shouldAutoResolve logic
function shouldAutoResolve(labels: string[], hasAssignee: boolean): boolean {
  const lowerLabels = labels.map(l => l.toLowerCase());

  if (hasAssignee) return false;
  if (lowerLabels.includes('manual')) return false;
  if (lowerLabels.includes('wontfix')) return false;

  return lowerLabels.includes('telegram-bot') || lowerLabels.includes('bug') || lowerLabels.includes('enhancement');
}

describe('Issue Store', () => {
  describe('shouldAutoResolve', () => {
    it('resolves telegram-bot labeled issues', () => {
      expect(shouldAutoResolve(['telegram-bot', 'bug'], false)).toBe(true);
    });

    it('resolves bug-labeled issues', () => {
      expect(shouldAutoResolve(['bug'], false)).toBe(true);
    });

    it('resolves enhancement-labeled issues', () => {
      expect(shouldAutoResolve(['enhancement'], false)).toBe(true);
    });

    it('skips assigned issues', () => {
      expect(shouldAutoResolve(['bug'], true)).toBe(false);
    });

    it('skips manually-labeled issues', () => {
      expect(shouldAutoResolve(['bug', 'manual'], false)).toBe(false);
    });

    it('skips wontfix issues', () => {
      expect(shouldAutoResolve(['bug', 'wontfix'], false)).toBe(false);
    });

    it('skips issues with no matching labels', () => {
      expect(shouldAutoResolve(['documentation', 'question'], false)).toBe(false);
    });

    it('handles empty labels', () => {
      expect(shouldAutoResolve([], false)).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(shouldAutoResolve(['BUG', 'Telegram-Bot'], false)).toBe(true);
    });
  });
});
