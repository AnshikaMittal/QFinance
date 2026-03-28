/**
 * QuickFinance Validation Pipeline
 *
 * Runs all quality gates before code gets pushed:
 *   1. Secret scanning (custom scanner)
 *   2. Linting (ESLint)
 *   3. Type checking (tsc)
 *   4. Unit tests (vitest)
 *   5. Production build (vite)
 *
 * Used by the code-push agent to ensure nothing broken reaches GitHub.
 */

import { execSync } from 'child_process';

export interface ValidationStep {
  name: string;
  passed: boolean;
  output: string;
  duration: number;
}

export interface ValidationResult {
  passed: boolean;
  steps: ValidationStep[];
  totalDuration: number;
  summary: string;
}

function runStep(name: string, command: string, cwd: string): ValidationStep {
  const start = Date.now();
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180000, // 3 min per step
      shell: '/bin/bash',
      env: {
        ...process.env,
        PATH: `${cwd}/node_modules/.bin:${process.env.HOME}/.npm-global/bin:/usr/local/bin:${process.env.PATH}`,
      },
    });
    return {
      name,
      passed: true,
      output: output.trim().slice(-500),
      duration: Date.now() - start,
    };
  } catch (err: any) {
    const output = [err.stdout ?? '', err.stderr ?? ''].join('\n').trim() || err.message;
    return {
      name,
      passed: false,
      output: output.slice(-500),
      duration: Date.now() - start,
    };
  }
}

/**
 * Run the full validation pipeline.
 * Returns immediately on first critical failure if `failFast` is true.
 */
export function validate(projectDir: string, failFast = false): ValidationResult {
  const start = Date.now();
  const steps: ValidationStep[] = [];

  // Use ./node_modules/.bin/ directly — avoids npx resolution failures in child shells
  const bin = `${projectDir}/node_modules/.bin`;
  const pipeline: Array<{ name: string; command: string }> = [
    { name: 'Secret Scan', command: `${bin}/tsx agents/security/src/scanner.ts --dir .` },
    { name: 'ESLint', command: `${bin}/eslint .` },
    { name: 'TypeScript', command: `${bin}/tsc -b` },
    { name: 'Unit Tests', command: `${bin}/vitest run` },
    { name: 'Build', command: 'npm run build' },
  ];

  for (let i = 0; i < pipeline.length; i++) {
    const step = pipeline[i];
    if (!step) continue;

    console.log(`    [${i + 1}/${pipeline.length}] ${step.name}...`);
    const result = runStep(step.name, step.command, projectDir);
    steps.push(result);

    const icon = result.passed ? '✓' : '✗';
    console.log(`    ${icon} ${step.name} (${(result.duration / 1000).toFixed(1)}s)`);

    if (!result.passed && failFast) {
      console.log(`    ⛔ Stopping — ${step.name} failed`);
      break;
    }
  }

  const totalDuration = Date.now() - start;
  const passed = steps.every((s) => s.passed);
  const failedSteps = steps.filter((s) => !s.passed);

  const summary = passed
    ? `✅ All ${pipeline.length} checks passed (${(totalDuration / 1000).toFixed(1)}s)`
    : `❌ ${failedSteps.length} failed: ${failedSteps.map((s) => s.name).join(', ')}`;

  return { passed, steps, totalDuration, summary };
}

/**
 * Format result as a compact string for Telegram or CLI output.
 */
export function formatResult(result: ValidationResult): string {
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
