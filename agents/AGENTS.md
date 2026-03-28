# QuickFinance Agents

Autonomous agents that handle issue reporting, syncing, resolution, code pushing, and security scanning for the QuickFinance PWA.

## Overview

The agents system provides end-to-end automation — from reporting bugs to pushing your own code:

1. **Telegram Bot** — Report issues OR push code, all from Telegram
2. **Issue Poller** — Syncs GitHub Issues to local JSON store
3. **Auto-Resolver** — Analyzes issues and generates fixes using Claude Code
4. **Code Push Agent** — Validates, commits, and pushes your local code changes
5. **Security Scanner** — Detects secrets and code vulnerabilities

All agents run as standalone Node.js scripts on your local machine using TypeScript/ESM.

## Architecture

```
User (Telegram)
      │
      ├── /bug, /feature, /issue
      │       ↓
      │   GitHub Issues
      │       ↓ (Issue Poller syncs)
      │   Local Issues Store
      │       ↓ (Auto-Resolver picks up)
      │   Claude Code → Branch → PR → CI → Auto-merge → Deploy
      │
      └── /push, /pr, /validate
              ↓
          Code Push Agent
              ↓ (validates: secret scan → lint → typecheck → tests → build)
              ↓ (commits + pushes)
          GitHub → CI → Deploy
```

## Quick Start

### 1. Set up each agent

```bash
# Telegram Bot
cd agents/telegram-bot
cp .env.example .env
# Edit .env with your tokens
npm install

# Issue Poller
cd ../issue-poller
cp .env.example .env
# Edit .env with your tokens
npm install

# Auto-Resolver
cd ../auto-resolver
cp .env.example .env
# Edit .env with your paths and tokens
npm install

# Security Scanner
cd ../security
npm install
```

### 2. Start agents (in separate terminals)

```bash
# Terminal 1: Telegram Bot
cd agents/telegram-bot
npm start

# Terminal 2: Issue Poller
cd agents/issue-poller
npm start

# Terminal 3: Auto-Resolver
cd agents/auto-resolver
npm start
```

### 3. Run security scanner

```bash
cd agents/security
npm run scan:project
```

## Agents

### Telegram Bot
**Location:** `agents/telegram-bot/`

Central command hub. Reports issues AND triggers code pushes from Telegram.

- **Issue Commands:** `/bug`, `/feature`, `/issue`
- **Push Commands:** `/push <msg>`, `/pr <msg>`, `/validate`
- **Info:** `/status`
- **Environment:** `TELEGRAM_BOT_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`, `PROJECT_DIR`, `ALLOWED_CHAT_IDS`
- **See:** [Telegram Bot README](./telegram-bot/README.md)

### Issue Poller
**Location:** `agents/issue-poller/`

Polls GitHub Issues at regular intervals and stores them locally.

- **Polls:** Every 5 minutes (configurable)
- **Output:** JSON files in `issues/` directory
- **Environment:** `GITHUB_TOKEN`, `GITHUB_REPO`, `POLL_INTERVAL`, `ISSUES_DIR`
- **See:** [Issue Poller README](./issue-poller/README.md)

### Auto-Resolver
**Location:** `agents/auto-resolver/`

Reads pending issues from local store and generates fixes using Claude Code.

- **Process:** Analyzes issue → Creates branch → Generates fix → Opens PR
- **Module detection:** Automatically identifies affected code
- **Environment:** `GITHUB_TOKEN`, `GITHUB_REPO`, `PROJECT_DIR`, `ISSUES_DIR`, `POLL_INTERVAL`
- **See:** [Auto-Resolver README](./auto-resolver/README.md)

### Code Push Agent
**Location:** `agents/code-push/`

Handles pushing your local code changes to GitHub — validates everything first.

- **Pipeline:** Secret scan → ESLint → TypeScript → Unit tests → Build → Push
- **Modes:** `push` (direct push), `pr` (create PR), `validate` (dry run)
- **Notifications:** Sends Telegram alerts on success/failure
- **Environment:** `GITHUB_TOKEN`, `GITHUB_REPO`, `PROJECT_DIR`, `TELEGRAM_BOT_TOKEN` (optional), `TELEGRAM_CHAT_ID` (optional)
- **CLI Usage:** `tsx agents/code-push/src/pusher.ts push "commit message"`
- **Via Telegram:** `/push fix login bug` or `/pr add dark mode`
- **Via deploy.sh:** `./deploy.sh push "commit message"`

### Security Scanner
**Location:** `agents/security/`

Scans codebase for hardcoded secrets, XSS vulnerabilities, and code injection risks.

- **Scanning:** Detects secrets, XSS, eval(), unsafe patterns
- **Usage:** `npm run scan` or `npm run scan:project`
- **Exit codes:** 0 = OK, 1 = Critical issues found
- **See:** [Security Scanner README](./security/README.md)

## Environment Setup

Each agent needs a `.env` file. Copy `.env.example` in each directory:

```bash
cp agents/telegram-bot/.env.example agents/telegram-bot/.env
cp agents/issue-poller/.env.example agents/issue-poller/.env
cp agents/auto-resolver/.env.example agents/auto-resolver/.env
```

### Required Tokens

1. **TELEGRAM_BOT_TOKEN**
   - Create via [@BotFather](https://t.me/botfather)
   - Set webhook or use polling

2. **GITHUB_TOKEN**
   - Create at https://github.com/settings/tokens
   - Scopes: `repo` (full repository access)
   - Can be shared across agents

3. **GITHUB_REPO**
   - Format: `owner/repo` (e.g., `akashkg/quickfinance`)

## Running the Agents

### Development Mode (with auto-reload)

```bash
# Telegram Bot
cd agents/telegram-bot && npm run dev

# Issue Poller
cd agents/issue-poller && npm run dev

# Auto-Resolver
cd agents/auto-resolver && npm run dev
```

### Production Mode

```bash
# Telegram Bot
cd agents/telegram-bot && npm start

# Issue Poller
cd agents/issue-poller && npm start

# Auto-Resolver
cd agents/auto-resolver && npm start
```

### Using a Process Manager

For production, use a process manager like `pm2`:

```bash
npm install -g pm2

# Start all agents
pm2 start agents/telegram-bot/src/bot.ts --name telegram-bot -- tsx
pm2 start agents/issue-poller/src/poller.ts --name issue-poller -- tsx
pm2 start agents/auto-resolver/src/resolver.ts --name auto-resolver -- tsx

# View logs
pm2 logs

# Stop all
pm2 stop all
```

## Workflow Examples

### Bug Report Flow (automated fix)

```
User: /bug The login form is broken on mobile
→ Telegram Bot creates GitHub Issue #42
→ Issue Poller syncs to local store (pending)
→ Auto-Resolver detects module: src/features/authentication
→ Claude Code generates fix on auto-fix/issue-42
→ PR #99 opened → CI passes → auto-merged → deployed
```

### Code Push Flow (your own changes)

```
# You make local changes, then:
User: /push fix: update CSV parser for new Chase format
→ Code Push Agent stages all changes
→ Runs: secret scan ✓ → lint ✓ → typecheck ✓ → tests ✓ → build ✓
→ Commits + pushes to current branch
→ Sends Telegram notification: ✅ Code Pushed (commit abc1234)
```

### PR Flow (code review path)

```
User: /pr add dark mode toggle to settings
→ Code Push Agent validates all checks
→ Creates feature/add-dark-mode-toggle branch
→ Pushes + creates PR
→ CI runs → review → merge → deploy
```

## Logs and Monitoring

Each agent logs to stdout:

```bash
# Telegram Bot
🤖 QuickFinance Telegram Bot started
📡 Connected to repo: owner/quickfinance
[message received] /bug The login form is broken

# Issue Poller
📡 QuickFinance Issue Poller started
[16:00:15] Polling issues...
  📥 #42: The login form is broken [pending]

# Auto-Resolver
🤖 QuickFinance Auto-Resolver started
[16:05:00] 1 pending issue(s)
🔧 Resolving #42: The login form is broken
   📂 Affected module: src/features/authentication
   ✅ PR #99 created
```

## Security

### Secrets Management

- Never commit `.env` files
- Use `ALLOWED_CHAT_IDS` in Telegram Bot for access control
- GitHub tokens should have minimal scopes
- Run security scanner before commits

### Pre-commit Hook

```bash
#!/bin/bash
cd agents/security
npm run scan:project || exit 1
```

## Troubleshooting

### Telegram Bot not receiving messages

1. Verify `TELEGRAM_BOT_TOKEN` is correct
2. Check that the bot is active (@BotFather)
3. Ensure Telegram can reach api.telegram.org
4. Check logs for polling errors

### Issue Poller not syncing

1. Verify `GITHUB_TOKEN` and `GITHUB_REPO`
2. Check that `ISSUES_DIR` is writable
3. Ensure GitHub repository is accessible
4. Check API rate limits

### Auto-Resolver failing to create PR

1. Verify Git is configured (git config user.name, user.email)
2. Check that you can push to the repository
3. Verify Claude Code is installed (which claude)
4. Check `PROJECT_DIR` is a valid Git repository

### Security Scanner finding false positives

1. Review the match context
2. Add patterns to `IGNORE_FILES` if needed
3. Check that secrets are only in `.env` files
4. Use environment variables for runtime config

## Development

### Adding a new agent

1. Create `agents/new-agent/` directory
2. Add `src/agent.ts` with agent logic
3. Add `package.json` with tsx dependency
4. Add `.env.example` with required variables
5. Add `README.md` with documentation
6. Update this file with agent info

### Testing agents

```bash
# Test Telegram Bot
# Use a test Telegram account and bot

# Test Issue Poller
# Create a test GitHub repo and issue

# Test Auto-Resolver
# Requires full setup with Claude Code

# Test Security Scanner
npm run scan agents/telegram-bot/src/
```

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Run security scanner
  run: cd agents/security && npm install && npm run scan:project

- name: Start agents (for E2E tests)
  run: |
    cd agents/telegram-bot && npm install && npm start &
    cd agents/issue-poller && npm install && npm start &
```

## Files

- `agents/telegram-bot/` — Telegram bot (issues + push commands)
- `agents/issue-poller/` — Issue polling agent
- `agents/auto-resolver/` — Auto-resolution agent (Claude Code fixes)
- `agents/code-push/` — Code push agent (validate + commit + push)
- `agents/security/` — Security scanner
- `AGENTS.md` — This file

## License

Same as QuickFinance project
