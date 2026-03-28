# Agent Pipeline Documentation

## Overview

QuickFinance uses a multi-agent system for automated issue management and resolution.

```
User (Telegram) → Bot → GitHub Issue → Poller → Local Store → Claude Worker → PR → CI/CD → Deploy
```

## Agents

### 1. Telegram Bot Agent (`agents/telegram-bot/`)
- **Runtime**: Node.js (local machine)
- **Framework**: Telegraf.js
- **Responsibilities**:
  - Receive bug reports and feature requests via Telegram
  - Parse message intent (bug vs feature vs question)
  - Create GitHub Issues with appropriate labels and templates
  - Send confirmation with issue link back to user

### 2. Issue Poller Agent (`agents/issue-poller/`)
- **Runtime**: Node.js (local machine, cron every 5 minutes)
- **Responsibilities**:
  - Fetch new/updated GitHub Issues via Octokit
  - Store issues locally in `agents/.local/issues.json`
  - Tag issues as ready for processing
  - Track issue state changes

### 3. Triage Agent (built into Poller)
- **Responsibilities**:
  - Auto-label issues by type (bug, feature, enhancement)
  - Assign priority based on severity keywords
  - Route to appropriate agent (auto-resolver vs human)
  - Flag issues that need human review

### 4. Auto-Resolver Agent (`agents/auto-resolver/`)
- **Runtime**: Node.js (local machine)
- **Framework**: Claude API (Anthropic SDK)
- **Responsibilities**:
  - Read unresolved issues from local store
  - Analyze the codebase to understand the change needed
  - Generate fix with unit tests and documentation updates
  - Create a PR on an `agent/` prefixed branch
  - CI validates the PR automatically
  - Auto-merge if all checks pass

### 5. Security Agent (`agents/security/`)
- **Runtime**: GitHub Actions + local pre-commit
- **Responsibilities**:
  - Secret scanning on every push (TruffleHog)
  - Dependency vulnerability auditing (npm audit)
  - CodeQL static analysis
  - Input validation rule enforcement
  - CSP header configuration for the PWA

### 6. Documentation Agent (built into Auto-Resolver)
- After every feature/fix merge, updates:
  - README if new features added
  - ARCHITECTURE.md if schema/structure changes
  - JSDoc comments on new functions
  - CHANGELOG.md with entry

### 7. Test Agent (built into Auto-Resolver)
- For every code change, generates:
  - Unit tests (Vitest) for new/modified functions
  - QA test scenarios for user-facing changes
  - E2E tests (Playwright) for critical flows

### 8. Compatibility Agent (built into CI)
- On schema changes:
  - Validates Dexie migration chain is sequential
  - Ensures old data can be read by new schema
  - Tests upgrade path from previous version

## Environment Variables

```
TELEGRAM_BOT_TOKEN=       # From @BotFather
GITHUB_TOKEN=             # Personal access token with repo scope
GITHUB_REPO=              # owner/quickfinance
ANTHROPIC_API_KEY=        # For Claude auto-resolver
```

## Running Agents Locally

```bash
# Start all agents
npm run agents:start

# Start individual agent
node agents/telegram-bot/index.js
node agents/issue-poller/index.js
node agents/auto-resolver/index.js
```
