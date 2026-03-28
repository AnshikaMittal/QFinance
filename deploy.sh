#!/usr/bin/env bash
#
# QuickFinance Deploy Script (thin wrapper)
#
# Delegates to the code-push agent which handles:
#   - Secret scanning
#   - Linting
#   - Type checking
#   - Unit tests
#   - Production build
#   - Git commit + push
#
# Usage:
#   ./deploy.sh push "commit message"    — validate + commit + push
#   ./deploy.sh pr "feature description" — validate + commit + create PR
#   ./deploy.sh validate                 — run checks only
#   ./deploy.sh                          — defaults to 'push'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env file if present
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Default mode
MODE="${1:-push}"
shift 2>/dev/null || true
MESSAGE="$*"

# Ensure required env vars
export PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"
export GITHUB_TOKEN="${GITHUB_TOKEN:?Set GITHUB_TOKEN — create one at https://github.com/settings/tokens}"
export GITHUB_REPO="${GITHUB_REPO:?Set GITHUB_REPO — e.g. akashkg/quickfinance}"

# Run the code-push agent
exec npx tsx "$SCRIPT_DIR/agents/code-push/src/pusher.ts" "$MODE" $MESSAGE
