import { describe, it, expect } from 'vitest';

// Inline patterns for testing
const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi, name: 'API Key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub Token' },
  { pattern: /sk-[a-zA-Z0-9]{40,}/g, name: 'OpenAI Key' },
  { pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g, name: 'AWS Key' },
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, name: 'Private Key' },
  { pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/g, name: 'DB URL' },
];

function scanLine(line: string): string[] {
  const found: string[] = [];
  for (const { pattern, name } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(line)) {
      found.push(name);
    }
  }
  return found;
}

describe('Secret Scanner Patterns', () => {
  it('detects GitHub tokens', () => {
    const line = 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"';
    expect(scanLine(line)).toContain('GitHub Token');
  });

  it('detects OpenAI keys', () => {
    const line = 'const key = "sk-abcdefghijklmnopqrstuvwxyz1234567890abcde"';
    expect(scanLine(line)).toContain('OpenAI Key');
  });

  it('detects AWS access keys', () => {
    const line = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE';
    expect(scanLine(line)).toContain('AWS Key');
  });

  it('detects private keys', () => {
    const line = '-----BEGIN RSA PRIVATE KEY-----';
    expect(scanLine(line)).toContain('Private Key');
  });

  it('detects database URLs with credentials', () => {
    const line = 'postgres://admin:password123@localhost:5432/mydb';
    expect(scanLine(line)).toContain('DB URL');
  });

  it('detects API keys in assignments', () => {
    const line = "const api_key = 'abcdefghijklmnopqrstuvwxyz123456'";
    expect(scanLine(line)).toContain('API Key');
  });

  it('ignores safe strings', () => {
    const safeLines = [
      'const name = "John"',
      'console.log("Hello world")',
      'import { something } from "library"',
      'const x = 42',
    ];
    for (const line of safeLines) {
      expect(scanLine(line)).toHaveLength(0);
    }
  });

  it('ignores short strings that look like keys', () => {
    const line = 'api_key = "short"';
    expect(scanLine(line)).toHaveLength(0);
  });
});
