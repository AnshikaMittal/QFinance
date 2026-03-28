/**
 * Tests for the code-push agent logic.
 *
 * Tests the branch name sanitization, push mode selection, and
 * notification message formatting — without actually touching git or GitHub.
 */

import { describe, it, expect } from 'vitest';

// --- Inlined logic from pusher.ts to avoid Node API imports ---

function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function buildFeatureBranchName(message: string): string {
  const safeName = sanitizeBranchName(message);
  // Use a fixed suffix for testing instead of Date.now()
  return `feature/${safeName}`;
}

type Mode = 'push' | 'pr' | 'validate';

function buildCommitMessage(mode: Mode, message: string, changedCount: number): string {
  if (message) return message;
  return `chore: update ${changedCount} file(s)`;
}

interface NotificationInput {
  mode: Mode;
  passed: boolean;
  branch?: string;
  commitHash?: string;
  prUrl?: string;
  error?: string;
  summary: string;
}

function formatNotification(input: NotificationInput): string {
  const lines: string[] = [];

  if (input.error) {
    lines.push('❌ *Push Failed*');
    lines.push(input.summary);
  } else if (input.mode === 'validate') {
    lines.push(`🔍 *Validation ${input.passed ? 'Passed' : 'Failed'}*`);
    lines.push(input.summary);
  } else {
    lines.push('✅ *Code Pushed*');
    if (input.branch) lines.push(`Branch: \`${input.branch}\``);
    if (input.commitHash) lines.push(`Commit: \`${input.commitHash}\``);
    if (input.prUrl) lines.push(`PR: ${input.prUrl}`);
    lines.push('');
    lines.push(input.summary);
  }

  return lines.join('\n');
}

// --- Tests ---

describe('Branch Name Sanitization', () => {
  it('lowercases and replaces special chars with hyphens', () => {
    expect(sanitizeBranchName('Fix Login Bug!')).toBe('fix-login-bug');
    // After trimming trailing hyphens:
    const cleaned = sanitizeBranchName('Fix Login Bug!').replace(/-$/, '');
    expect(cleaned).toBe('fix-login-bug');
  });

  it('strips leading and trailing hyphens', () => {
    expect(sanitizeBranchName('---hello---')).toBe('hello');
  });

  it('truncates to 40 characters', () => {
    const long = 'a'.repeat(60);
    expect(sanitizeBranchName(long).length).toBeLessThanOrEqual(40);
  });

  it('handles empty string', () => {
    expect(sanitizeBranchName('')).toBe('');
  });

  it('preserves alphanumeric characters', () => {
    expect(sanitizeBranchName('add-dark-mode-v2')).toBe('add-dark-mode-v2');
  });
});

describe('Feature Branch Name', () => {
  it('creates a feature/ prefixed branch', () => {
    const branch = buildFeatureBranchName('add csv export');
    expect(branch).toBe('feature/add-csv-export');
  });

  it('handles complex messages', () => {
    const branch = buildFeatureBranchName('Fix: CSVDropZone TS error (#42)');
    expect(branch).toBe('feature/fix-csvdropzone-ts-error-42');
  });
});

describe('Commit Message', () => {
  it('uses provided message when available', () => {
    expect(buildCommitMessage('push', 'fix: resolve login bug', 3)).toBe('fix: resolve login bug');
  });

  it('generates auto message when empty', () => {
    expect(buildCommitMessage('push', '', 5)).toBe('chore: update 5 file(s)');
  });

  it('generates auto message for single file', () => {
    expect(buildCommitMessage('pr', '', 1)).toBe('chore: update 1 file(s)');
  });
});

describe('Notification Formatting', () => {
  it('formats a successful push notification', () => {
    const msg = formatNotification({
      mode: 'push',
      passed: true,
      branch: 'main',
      commitHash: 'abc1234',
      summary: '✅ All 5 checks passed (22.5s)',
    });

    expect(msg).toContain('✅ *Code Pushed*');
    expect(msg).toContain('`main`');
    expect(msg).toContain('`abc1234`');
    expect(msg).toContain('All 5 checks passed');
  });

  it('formats a PR notification with link', () => {
    const msg = formatNotification({
      mode: 'pr',
      passed: true,
      branch: 'feature/add-export',
      commitHash: 'def5678',
      prUrl: 'https://github.com/akashkg/quickfinance/pull/42',
      summary: '✅ All 5 checks passed',
    });

    expect(msg).toContain('✅ *Code Pushed*');
    expect(msg).toContain('feature/add-export');
    expect(msg).toContain('pull/42');
  });

  it('formats a validation-only notification', () => {
    const msg = formatNotification({
      mode: 'validate',
      passed: true,
      summary: '✅ All 5 checks passed',
    });

    expect(msg).toContain('🔍 *Validation Passed*');
    expect(msg).not.toContain('Branch');
  });

  it('formats a failed push notification', () => {
    const msg = formatNotification({
      mode: 'push',
      passed: false,
      error: 'Validation failed',
      summary: '❌ 2 failed: ESLint, TypeScript',
    });

    expect(msg).toContain('❌ *Push Failed*');
    expect(msg).toContain('2 failed');
  });

  it('formats a failed validation notification', () => {
    const msg = formatNotification({
      mode: 'validate',
      passed: false,
      summary: '❌ 1 failed: Unit Tests',
    });

    expect(msg).toContain('🔍 *Validation Failed*');
  });
});
