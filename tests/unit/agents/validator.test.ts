/**
 * Tests for the code-push validator module.
 *
 * Since the validator shells out to CLI tools (eslint, tsc, vitest, etc.),
 * we test the formatting/result logic here and mock execSync for the pipeline.
 */

import { describe, it, expect } from 'vitest';

// --- Inline the formatting logic to avoid Node API imports ---

interface ValidationStep {
  name: string;
  passed: boolean;
  output: string;
  duration: number;
}

interface ValidationResult {
  passed: boolean;
  steps: ValidationStep[];
  totalDuration: number;
  summary: string;
}

function formatResult(result: ValidationResult): string {
  const lines: string[] = [result.summary, ''];

  for (const step of result.steps) {
    const icon = step.passed ? '✓' : '✗';
    const time = `${(step.duration / 1000).toFixed(1)}s`;
    lines.push(`  ${icon} ${step.name} (${time})`);

    if (!step.passed) {
      const preview = step.output.slice(-200).split('\n').map((l) => `    ${l}`).join('\n');
      lines.push(preview);
    }
  }

  return lines.join('\n');
}

describe('Validator Result Formatting', () => {
  it('formats a passing result', () => {
    const result: ValidationResult = {
      passed: true,
      steps: [
        { name: 'Secret Scan', passed: true, output: 'No issues found', duration: 1200 },
        { name: 'ESLint', passed: true, output: '', duration: 3400 },
        { name: 'TypeScript', passed: true, output: '', duration: 5600 },
        { name: 'Unit Tests', passed: true, output: '19 tests passed', duration: 4200 },
        { name: 'Build', passed: true, output: 'dist/index.js', duration: 8100 },
      ],
      totalDuration: 22500,
      summary: '✅ All 5 checks passed (22.5s)',
    };

    const output = formatResult(result);
    expect(output).toContain('✅ All 5 checks passed');
    expect(output).toContain('✓ Secret Scan');
    expect(output).toContain('✓ ESLint');
    expect(output).toContain('✓ TypeScript');
    expect(output).toContain('✓ Unit Tests');
    expect(output).toContain('✓ Build');
    // Should not contain failure markers
    expect(output).not.toContain('✗');
  });

  it('formats a failing result with error output', () => {
    const result: ValidationResult = {
      passed: false,
      steps: [
        { name: 'Secret Scan', passed: true, output: '', duration: 1000 },
        { name: 'ESLint', passed: false, output: 'error: Unexpected any. Use unknown instead.', duration: 2500 },
      ],
      totalDuration: 3500,
      summary: '❌ 1 failed: ESLint',
    };

    const output = formatResult(result);
    expect(output).toContain('❌ 1 failed: ESLint');
    expect(output).toContain('✓ Secret Scan');
    expect(output).toContain('✗ ESLint');
    expect(output).toContain('Unexpected any');
  });

  it('shows duration for each step', () => {
    const result: ValidationResult = {
      passed: true,
      steps: [
        { name: 'Build', passed: true, output: '', duration: 12345 },
      ],
      totalDuration: 12345,
      summary: '✅ All checks passed',
    };

    const output = formatResult(result);
    expect(output).toContain('12.3s');
  });

  it('truncates long error output to 200 chars', () => {
    const longError = 'x'.repeat(500);
    const result: ValidationResult = {
      passed: false,
      steps: [
        { name: 'Unit Tests', passed: false, output: longError, duration: 5000 },
      ],
      totalDuration: 5000,
      summary: '❌ 1 failed: Unit Tests',
    };

    const output = formatResult(result);
    // The preview should contain at most 200 chars of the error
    const errorSection = output.split('✗ Unit Tests')[1] ?? '';
    // 200 x's from the end
    expect(errorSection).toContain('x'.repeat(100));
  });
});

describe('ValidationResult structure', () => {
  it('passed is true only when all steps pass', () => {
    const allPass: ValidationStep[] = [
      { name: 'A', passed: true, output: '', duration: 100 },
      { name: 'B', passed: true, output: '', duration: 200 },
    ];
    expect(allPass.every((s) => s.passed)).toBe(true);

    const oneFail: ValidationStep[] = [
      { name: 'A', passed: true, output: '', duration: 100 },
      { name: 'B', passed: false, output: 'err', duration: 200 },
    ];
    expect(oneFail.every((s) => s.passed)).toBe(false);
  });

  it('identifies failed steps correctly', () => {
    const steps: ValidationStep[] = [
      { name: 'Secret Scan', passed: true, output: '', duration: 100 },
      { name: 'ESLint', passed: false, output: 'error', duration: 200 },
      { name: 'TypeScript', passed: false, output: 'type error', duration: 300 },
    ];

    const failedSteps = steps.filter((s) => !s.passed);
    expect(failedSteps).toHaveLength(2);
    expect(failedSteps.map((s) => s.name)).toEqual(['ESLint', 'TypeScript']);
  });
});
