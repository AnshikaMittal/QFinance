# Telegram Bot Agent

Receives issue reports from Telegram and automatically creates GitHub Issues.

## What It Does

This agent provides a Telegram bot that allows users to report bugs, request features, and file general issues directly from Telegram. Each report is automatically converted into a GitHub Issue with appropriate labels and context.

**Supported commands:**
- `/bug <description>` — Report a bug
- `/feature <description>` — Request a feature
- `/issue <description>` — File a general issue
- `/status` — Check bot health and connection status

## Installation

1. Create a `.env` file in this directory (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. Configure environment variables:
   - `TELEGRAM_BOT_TOKEN`: Create via [@BotFather](https://t.me/botfather) on Telegram
   - `GITHUB_TOKEN`: Create a Personal Access Token with `repo` scope on GitHub
   - `GITHUB_REPO`: Your repository (e.g., `owner/quickfinance`)
   - `ALLOWED_CHAT_IDS` (optional): Comma-separated list of Telegram chat IDs to restrict access

## Running the Bot

```bash
# Install dependencies (one-time)
npm install

# Start the bot
npm start

# Development mode with auto-reload
npm run dev
```

The bot will start polling Telegram for new messages and create GitHub Issues when commands are issued.

## How It Works

1. User sends `/bug Fix the login page` to the bot
2. Bot validates the message and parses the command
3. Bot creates a GitHub Issue with:
   - Title: `[BUG] Fix the login page`
   - Body: Includes description, reporter name, timestamp
   - Labels: `bug`, `telegram-bot`
4. Bot replies with the issue number and URL

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from @BotFather |
| `GITHUB_TOKEN` | Yes | — | GitHub Personal Access Token |
| `GITHUB_REPO` | Yes | — | Repository (owner/name) |
| `ALLOWED_CHAT_IDS` | No | — | Comma-separated chat IDs for access control |

## Security

- If `ALLOWED_CHAT_IDS` is set, only messages from those Telegram chat IDs will be processed
- The GitHub token should have `repo` scope only
- Never commit `.env` files to version control

## Troubleshooting

**"Missing required environment variables"**
- Ensure all required variables are set in `.env`
- Check that the file has no typos

**"Polling error"**
- Verify the `TELEGRAM_BOT_TOKEN` is correct
- Check your internet connection
- The bot will retry automatically after 5 seconds

**"GitHub API error"**
- Verify `GITHUB_TOKEN` has `repo` scope
- Check that `GITHUB_REPO` is in correct format (`owner/repo`)
- Ensure the repository exists and is accessible
