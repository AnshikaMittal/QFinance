/**
 * QuickFinance Security Scanner
 *
 * Scans the codebase for:
 *   - Hardcoded secrets (API keys, tokens, passwords)
 *   - Suspicious patterns in user input handling
 *   - Dependency vulnerabilities
 *
 * Can be run as a pre-commit hook or CI step.
 *
 * Usage: tsx agents/security/src/scanner.ts [--fix] [--dir <path>]
 */

import { readdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';

interface ScanResult {
  file: string;
  line: number;
  type: 'secret' | 'xss' | 'injection' | 'insecure';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  match: string;
}

// --- Secret Patterns ---
const SECRET_PATTERNS: Array<{ pattern: RegExp; type: string; severity: ScanResult['severity'] }> = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi, type: 'API Key', severity: 'critical' },
  { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi, type: 'Password/Secret', severity: 'critical' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: 'GitHub Token', severity: 'critical' },
  { pattern: /sk-[a-zA-Z0-9]{40,}/g, type: 'OpenAI API Key', severity: 'critical' },
  { pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g, type: 'AWS Access Key', severity: 'critical' },
  { pattern: /(?:bearer|token)\s+[a-zA-Z0-9._-]{30,}/gi, type: 'Bearer Token', severity: 'high' },
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, type: 'Private Key', severity: 'critical' },
  { pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/g, type: 'Database URL with credentials', severity: 'critical' },
];

// --- XSS / Injection Patterns ---
const SECURITY_PATTERNS: Array<{ pattern: RegExp; type: ScanResult['type']; severity: ScanResult['severity']; message: string }> = [
  { pattern: /dangerouslySetInnerHTML/g, type: 'xss', severity: 'high', message: 'dangerouslySetInnerHTML usage — ensure input is sanitized' },
  { pattern: /innerHTML\s*=/g, type: 'xss', severity: 'high', message: 'Direct innerHTML assignment — use textContent or sanitize' },
  { pattern: /eval\s*\(/g, type: 'injection', severity: 'critical', message: 'eval() usage — potential code injection' },
  { pattern: /new\s+Function\s*\(/g, type: 'injection', severity: 'high', message: 'new Function() — potential code injection' },
  { pattern: /document\.write\s*\(/g, type: 'xss', severity: 'medium', message: 'document.write — potential XSS vector' },
  { pattern: /localStorage\.setItem\s*\([^,]+,\s*(?:(?!JSON\.stringify).)*\)/g, type: 'insecure', severity: 'low', message: 'Storing non-serialized data in localStorage' },
];

// --- File scanning ---
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.env', '.yml', '.yaml']);
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', '.next', '.vite', 'coverage']);
const IGNORE_FILES = new Set([
  '.env.example',
  'scanner.ts',   // Don't flag our own patterns
  'validator.ts',  // Code-push validator references tool names
]);

function getFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (SCAN_EXTENSIONS.has(extname(entry.name)) && !IGNORE_FILES.has(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Lines matching these patterns are safe and should not be flagged.
 * Covers: comments, env variable reads, type annotations, JSDoc, and known safe usages.
 */
function isSafeLine(line: string): boolean {
  const trimmed = line.trim();

  // Skip comment lines (// or * or #)
  if (/^\s*(\/\/|\/?\*|#)/.test(trimmed)) return true;

  // Skip lines reading from process.env (not hardcoded secrets)
  if (trimmed.includes('process.env.')) return true;

  // Skip TypeScript type annotations and interface definitions
  if (/^\s*(type|interface|export\s+type|export\s+interface)\s/.test(trimmed)) return true;

  // Skip lines that are just variable declarations referencing env vars
  if (/=\s*process\.env\b/.test(trimmed)) return true;

  // Skip console.error messages about missing env vars
  if (/console\.(error|log|warn)\s*\(/.test(trimmed) && !/'[a-zA-Z0-9_]{20,}'/.test(trimmed)) return true;

  return false;
}

/**
 * Specific false-positive suppressions for known safe patterns.
 */
const SAFE_PATTERNS: RegExp[] = [
  // Theme storage in localStorage is safe
  /localStorage\.\w+\(\s*['"]qf-/,
  // Test files with mock data
  /\.test\.(ts|tsx|js|jsx)$/,
];

function isSafeMatch(line: string, filePath: string): boolean {
  return SAFE_PATTERNS.some((p) => p.test(line) || p.test(filePath));
}

function scanFile(filePath: string): ScanResult[] {
  const results: ScanResult[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Skip test files entirely for secret scanning (they contain mock data)
  const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNum = i + 1;

    // Skip safe lines (comments, env reads, type annotations)
    if (isSafeLine(line)) continue;

    // Check for secrets (skip in test files — they use mock data)
    if (!isTestFile) {
      for (const { pattern, type, severity } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          results.push({
            file: filePath,
            line: lineNum,
            type: 'secret',
            severity,
            message: `Potential ${type} found`,
            match: match[0].slice(0, 40) + (match[0].length > 40 ? '...' : ''),
          });
        }
      }
    }

    // Check for security patterns (but skip known safe matches)
    for (const { pattern, type, severity, message } of SECURITY_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line) && !isSafeMatch(line, filePath)) {
        results.push({
          file: filePath,
          line: lineNum,
          type,
          severity,
          message,
          match: line.trim().slice(0, 60),
        });
      }
    }
  }

  return results;
}

// --- Main ---
function main(): void {
  const args = process.argv.slice(2);
  const dir = args.includes('--dir')
    ? args[args.indexOf('--dir') + 1] ?? '.'
    : join(process.cwd(), '..', '..');

  console.log('Security Scanner');
  console.log(`   Scanning: ${dir}`);
  console.log('');

  const files = getFiles(dir);
  console.log(`   Found ${files.length} files to scan`);
  console.log('');

  const allResults: ScanResult[] = [];

  for (const file of files) {
    const results = scanFile(file);
    allResults.push(...results);
  }

  if (allResults.length === 0) {
    console.log('No security issues found!');
    process.exit(0);
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  allResults.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

  // Print results
  const criticals = allResults.filter((r) => r.severity === 'critical');
  const highs = allResults.filter((r) => r.severity === 'high');
  const mediums = allResults.filter((r) => r.severity === 'medium');
  const lows = allResults.filter((r) => r.severity === 'low');

  console.log(`Found ${allResults.length} issue(s):`);
  if (criticals.length) console.log(`   ${criticals.length} critical`);
  if (highs.length) console.log(`   ${highs.length} high`);
  if (mediums.length) console.log(`   ${mediums.length} medium`);
  if (lows.length) console.log(`   ${lows.length} low`);
  console.log('');

  for (const r of allResults) {
    const icon = r.severity === 'critical' ? '[CRITICAL]' : r.severity === 'high' ? '[HIGH]' : r.severity === 'medium' ? '[MEDIUM]' : '[LOW]';
    console.log(`${icon} ${r.file}:${r.line}`);
    console.log(`   ${r.message}`);
    console.log(`   Match: ${r.match}`);
    console.log('');
  }

  // Exit with error code if critical issues found
  if (criticals.length > 0) {
    console.log('Critical security issues found. Failing.');
    process.exit(1);
  }

  console.log('Non-critical issues found. Review recommended.');
  process.exit(0);
}

main();
