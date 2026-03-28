# Security Scanner Agent

Scans the codebase for security vulnerabilities, hardcoded secrets, and suspicious code patterns.

## What It Does

This agent provides automated security scanning to detect:

- **Hardcoded secrets** — API keys, tokens, passwords, private keys, database credentials
- **XSS vulnerabilities** — dangerouslySetInnerHTML, innerHTML, document.write usage
- **Code injection risks** — eval(), new Function(), unsafe dynamic execution
- **Insecure patterns** — Unencrypted localStorage, unsafe data handling

## Installation

```bash
# Install dependencies (one-time)
npm install
```

No configuration needed — the scanner reads from the filesystem directly.

## Running the Scanner

```bash
# Scan current directory (agents/security)
npm run scan

# Scan entire project
npm run scan:project

# Scan custom directory
tsx src/scanner.ts --dir /path/to/scan
```

## Output

The scanner produces a severity-based report:

```
Found 3 issue(s):
   1 critical
   1 high
   1 medium

[CRITICAL] src/utils/api.ts:24
   Potential GitHub Token found
   Match: ghp_1234567890abcdefghij1234567890ab

[HIGH] src/features/transactions/view.tsx:45
   dangerouslySetInnerHTML usage — ensure input is sanitized
   Match: dangerouslySetInnerHTML={{__html: userInput}}

[MEDIUM] src/features/dashboard/index.ts:12
   document.write — potential XSS vector
   Match: document.write('<h1>' + title + '</h1>')
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No issues found (or only low-severity issues) |
| 1 | Critical or high-severity issues detected |

Use exit codes in CI/CD pipelines to enforce security standards.

## Security Patterns Detected

### Critical Severity

- Hardcoded GitHub tokens (`ghp_*`)
- AWS access keys (`AKIA*`, `ASIA*`)
- OpenAI API keys (`sk-*`)
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- Database URLs with credentials
- Hardcoded API keys and passwords
- eval() function usage

### High Severity

- dangerouslySetInnerHTML without sanitization
- Direct innerHTML assignment
- new Function() dynamic code execution
- Bearer tokens in code

### Medium Severity

- document.write() usage
- Potential XSS vectors

### Low Severity

- Unencrypted localStorage operations
- Insecure data patterns

## Scanning Configuration

The scanner automatically:
- Scans all `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.env`, `.yml`, `.yaml` files
- Ignores: `node_modules/`, `dist/`, `.git/`, `.next/`, `coverage/`
- Skips: `.env.example`, `scanner.ts` (to avoid false positives)

## Using in CI/CD

### GitHub Actions

```yaml
- name: Security scan
  run: npm run scan:project
  working-directory: agents/security
```

### Pre-commit Hook

```bash
#!/bin/bash
cd agents/security
npm run scan:project || exit 1
```

### Local Development

```bash
# Before committing
npm run scan:project
```

## Secret Management Best Practices

1. **Never commit secrets** — Use `.env` files (in `.gitignore`)
2. **Use environment variables** — Inject at runtime
3. **Rotate tokens regularly** — GitHub, API keys, etc.
4. **Use GitHub Secrets** — For CI/CD workflows
5. **Monitor logs** — Check for accidental leaks in commit messages

## Fixing Security Issues

### Hardcoded Secrets

**Bad:**
```typescript
const API_KEY = 'sk-1234567890abcdef';
const token = 'ghp_xxxxxxxxxxxx';
```

**Good:**
```typescript
const API_KEY = process.env.OPENAI_API_KEY;
const token = process.env.GITHUB_TOKEN;
```

### XSS Vulnerabilities

**Bad:**
```typescript
<div dangerouslySetInnerHTML={{__html: userInput}} />
```

**Good:**
```typescript
<div>{userInput}</div>  {/* Automatically escaped */}
```

### eval() Usage

**Bad:**
```typescript
const code = 'return x + y';
const fn = new Function(code);
```

**Good:**
```typescript
const result = new Function('x', 'y', 'return x + y')(10, 20);
```

## Troubleshooting

**"Found X critical issue(s)"**
- Fix all critical issues before committing
- Review the specific file and line number
- See "Fixing Security Issues" above

**"Scanning takes too long"**
- The scanner is comprehensive by design
- For large projects, consider scanning specific directories
- Run incrementally: `tsx src/scanner.ts --dir src/features/transactions`

**"False positives"**
- Check if the pattern is actually in a comment or string literal
- Review the match context at the reported line
- Add files to `IGNORE_FILES` if needed (edit scanner.ts)

## Integration

This scanner integrates with:
- **Pre-commit hooks** — Prevents secret commits
- **CI/CD pipelines** — Enforces security standards
- **Development workflow** — Local security checks

## Files

- `src/scanner.ts` — Main scanner logic
- `package.json` — NPM scripts and dependencies
