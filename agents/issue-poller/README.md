# Issue Poller Agent

Periodically polls GitHub Issues and syncs them to a local JSON store for processing by the auto-resolver.

## What It Does

This agent continuously monitors your GitHub repository for open issues. It:

- Polls GitHub at regular intervals (default: every 5 minutes)
- Fetches all open issues and filters out pull requests
- Stores issues locally as JSON files
- Marks new issues as `pending` for auto-resolution
- Tracks issue status changes (created, updated, closed)
- Automatically marks closed issues as `resolved`

## Installation

1. Create a `.env` file in this directory (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. Configure environment variables:
   - `GITHUB_TOKEN`: Personal Access Token with `repo` scope
   - `GITHUB_REPO`: Your repository (e.g., `owner/quickfinance`)
   - `POLL_INTERVAL` (optional): Polling interval in seconds (default: 300)
   - `ISSUES_DIR` (optional): Directory to store issue JSON files (default: `./issues`)

## Running the Poller

```bash
# Install dependencies (one-time)
npm install

# Start the poller
npm start

# Development mode with auto-reload
npm run dev
```

The poller will create an `issues/` directory (or custom directory) and start syncing issues.

## How It Works

1. **Polling cycle:**
   - Fetches all open issues from GitHub API (paginated, 100 per page)
   - Compares with local store

2. **New issues:**
   - Creates `issue-{number}.json` file
   - Marks as `pending` if eligible for auto-resolution
   - Marks as `skipped` if manually assigned or labeled `manual`

3. **Updated issues:**
   - Updates title, body, labels, timestamps
   - Preserves existing status

4. **Closed issues:**
   - Marks locally as `resolved`
   - Keeps JSON file for reference

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | — | GitHub Personal Access Token |
| `GITHUB_REPO` | Yes | — | Repository (owner/name) |
| `POLL_INTERVAL` | No | 300 | Poll interval in seconds |
| `ISSUES_DIR` | No | `./issues` | Directory for JSON storage |

## Issue JSON Structure

Each issue is stored as `issue-{number}.json`:

```json
{
  "number": 42,
  "title": "[BUG] Login page not working",
  "body": "The login page crashes when...",
  "labels": ["bug", "telegram-bot"],
  "url": "https://github.com/owner/repo/issues/42",
  "status": "pending",
  "createdAt": "2026-03-25T12:00:00Z",
  "updatedAt": "2026-03-26T15:30:00Z",
  "fetchedAt": "2026-03-26T16:00:00Z",
  "resolution": {
    "prNumber": 123,
    "prUrl": "https://github.com/owner/repo/pull/123",
    "resolvedAt": "2026-03-26T16:45:00Z"
  }
}
```

**Status values:**
- `pending` — Ready for auto-resolver to process
- `in_progress` — Being resolved
- `resolved` — Resolved (PR created or issue closed)
- `skipped` — Not eligible for auto-resolution

## Auto-Resolution Eligibility

Issues are marked `pending` if:
- No assignee is set
- Not labeled with `manual` or `wontfix`
- Labeled with `telegram-bot`, `bug`, or `enhancement`

All other issues are marked `skipped` and won't be auto-resolved.

## Troubleshooting

**"Missing required environment variables"**
- Ensure `GITHUB_TOKEN` and `GITHUB_REPO` are set in `.env`

**"GitHub API error"**
- Verify `GITHUB_TOKEN` has `repo` scope
- Check repository name format: `owner/repo`
- Ensure token hasn't expired

**Issues not syncing**
- Check `ISSUES_DIR` exists and is writable
- Verify `POLL_INTERVAL` is reasonable (at least 60 seconds recommended)
- Check logs for API errors
