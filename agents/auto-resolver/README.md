# Auto-Resolver Agent

Automatically analyzes pending GitHub issues and generates fixes using Claude Code.

## What It Does

This agent reads pending issues from the local JSON store (populated by the Issue Poller), analyzes them, and uses Claude Code to generate fixes. It then:

1. Detects which module is affected by the issue
2. Invokes Claude Code to generate a fix
3. Commits changes to a new branch
4. Creates a pull request
5. Marks the issue as resolved

## Installation

1. Create a `.env` file in this directory (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. Configure environment variables:
   - `GITHUB_TOKEN`: Personal Access Token with `repo` scope
   - `GITHUB_REPO`: Your repository (e.g., `owner/quickfinance`)
   - `PROJECT_DIR`: Path to the QuickFinance project root
   - `ISSUES_DIR` (optional): Path to issue JSON files (from issue-poller)
   - `POLL_INTERVAL` (optional): Check interval in seconds (default: 60)

3. Ensure:
   - You're in a Git repository with `main` branch
   - Claude Code is installed and configured
   - Git credentials are set up for pushing branches

## Running the Resolver

```bash
# Install dependencies (one-time)
npm install

# Start the resolver
npm start

# Development mode with auto-reload
npm run dev
```

The resolver will check for pending issues every 60 seconds and process them one at a time.

## How It Works

1. **Scan for pending issues:**
   - Reads `issues/` directory from issue-poller
   - Filters for issues with `status: "pending"`

2. **Module detection:**
   - Analyzes issue title and body
   - Maps keywords to affected module (e.g., `bug`, `transaction` → `src/features/transactions`)

3. **Generate fix with Claude Code:**
   - Passes issue description to Claude
   - Claude analyzes and generates fixes
   - Constraints: Only modify files in detected module

4. **Commit and push:**
   - Creates branch: `auto-fix/issue-{number}`
   - Commits changes with reference to issue
   - Pushes to remote

5. **Create pull request:**
   - Opens PR from fix branch to `main`
   - Includes reference to original issue
   - PR auto-closes issue if merged

6. **Update local store:**
   - Marks issue as `resolved`
   - Records PR number and URL

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | — | GitHub Personal Access Token |
| `GITHUB_REPO` | Yes | — | Repository (owner/name) |
| `PROJECT_DIR` | Yes | — | Path to project root |
| `ISSUES_DIR` | No | `../issue-poller/issues` | Path to issue JSON files |
| `POLL_INTERVAL` | No | 60 | Check interval in seconds |

## Module Detection Rules

The resolver maps issue keywords to modules:

- **`src/features/transactions`** — transaction, expense, spending, entry, add transaction
- **`src/features/csv-import`** — csv, import, statement, chase, apple card, parse
- **`src/features/analytics`** — analytics, chart, trend, money spill, budget, spending creep
- **`src/features/budgets`** — budget, limit, goal, overspend
- **`src/features/dashboard`** — dashboard, overview, home, summary
- **`src/features/categories`** — category, categorize, label
- **`src/features/sync`** — sync, backup, github sync, cloud
- **`src/features/settings`** — settings, card, config, theme, dark mode
- **`src/ui`** — button, modal, input, ui, component, style, animation
- **`src/core`** — database, db, schema, type, util, format
- **Fallback** → `src`

## How Claude Code Is Invoked

The resolver calls Claude with constraints:

- **Scope:** Only modify files in the detected module
- **Testing:** Add or update unit tests for changes
- **No external files:** Don't modify outside the module unless critical
- **Follow conventions:** Match existing code style and patterns
- **Tools allowed:** Edit, Write, Read, Glob, Grep, Bash

## Processing Workflow

```
Issue #42 detected (pending)
   ↓
Module: src/features/transactions (keyword match: "transaction")
   ↓
Claude Code generates fix
   ↓
Branch created: auto-fix/issue-42
   ↓
Changes committed and pushed
   ↓
PR #99 opened (links to issue #42)
   ↓
Issue marked as resolved in local store
   ↓
Next pending issue processed...
```

## Error Handling

- **Claude Code fails:** Issue remains `pending`, error logged, retry on next cycle
- **Git error:** Returns to `main`, issue marked `pending` for retry
- **API error:** Skipped, will retry next cycle

## Troubleshooting

**"Missing required environment variables"**
- Ensure all required variables are set in `.env`
- `PROJECT_DIR` must be absolute path to git repository

**"Claude Code failed"**
- Verify Claude Code is installed: `which claude`
- Check that you have `ANTHROPIC_API_KEY` set
- Review Claude Code logs for detailed error

**"No changes to commit"**
- The issue may not require code changes
- Check that Claude actually modified files
- Manually review and mark as `resolved` if needed

**"Git error: not a git repository"**
- Ensure `PROJECT_DIR` is a Git repository
- Check that `main` branch exists

**"PR creation failed"**
- Verify `GITHUB_TOKEN` has push access to the repository
- Check that the branch was actually pushed
- Ensure `main` branch is up to date

## Integration with Other Agents

This agent works alongside:
- **Telegram Bot:** Creates initial issues
- **Issue Poller:** Syncs issues to local store
- **GitHub:** Auto-closes issues when PR is merged
