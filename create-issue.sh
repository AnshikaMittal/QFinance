#!/bin/bash
# Create GitHub issue for the deployment failure
# Run from the quickfinance project root on your Mac

set -euo pipefail

source .env

TITLE="[Bug]: TypeScript build failure — DashboardView.tsx L311: Declaration or statement expected"

BODY=$(cat <<'ISSUE_EOF'
## Summary

The GitHub Pages deployment (`cd.yml`) is failing with a **TypeScript compilation error** in `src/features/dashboard/components/DashboardView.tsx` at **line 311**.

```
deploy: src/features/dashboard/components/DashboardView.tsx#L311
Declaration or statement expected.
```

The build passes locally on the current working tree, which means the **remote `main` branch** has a different (broken) version of this file — most likely introduced by an auto-resolver PR that was merged after the last manual push.

## Error Details

- **File**: `src/features/dashboard/components/DashboardView.tsx`
- **Line**: 311
- **Error**: `Declaration or statement expected` (TS1128)
- **Stage**: `deploy` step in GitHub Actions (`cd.yml`)
- **Exit code**: 2

## Root Cause Analysis

This is a **syntax error** — the TypeScript compiler found a token where it expected a declaration or statement. Common causes:

1. **Incomplete JSX expression** — a closing tag or brace was deleted by an auto-resolver edit
2. **Stray characters** — leftover merge conflict markers or partial edit artifacts
3. **Broken template literal** — mismatched backticks inside JSX expressions (line 311 in the local version contains a template literal with `card.lastFour`)

The local version of line 311 is valid JSX:
```tsx
{card.name}{card.lastFour && card.lastFour !== '0000' ? ` ••${card.lastFour}` : ''}
```

The auto-resolver likely made an edit to the `MoneySpillsSummary` or `CategoryRow` section of this file (which is a 541-line component) and inadvertently broke the syntax at or near line 311.

## Steps to Reproduce

1. Check out the current `main` branch from remote:
   ```bash
   git fetch origin && git checkout origin/main
   ```
2. Run TypeScript compilation:
   ```bash
   npx tsc --project tsconfig.app.json --noEmit
   ```
3. Observe the error at `DashboardView.tsx:311`

## Expected Behavior

TypeScript compilation should pass with zero errors, and the GitHub Pages deployment should succeed.

## Fix Strategy

1. Pull the remote `main` to inspect the broken file
2. Compare remote line 311 with the local (working) version
3. The local working tree has a clean, tested version of this file — force-push or cherry-pick to overwrite the broken remote version
4. Alternatively, run: `git pull --rebase && npx tsc --noEmit` to identify and fix the exact syntax error, then push

## Affected Components

- **Dashboard** — the main view users see when opening the app
- **Deployment** — GitHub Pages is currently broken; users cannot access the latest version
- **CI/CD pipeline** — all subsequent pushes will also fail until this is fixed

## Priority

**Critical** — The app is not deploying. This blocks all other changes.

## Labels

`bug`, `critical`, `auto-resolver`, `deployment`
ISSUE_EOF
)

# Create the issue via GitHub API
curl -s -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_REPO}/issues" \
  -d "$(jq -n --arg title "$TITLE" --arg body "$BODY" '{title: $title, body: $body, labels: ["bug"]}')" \
  | jq '{number: .number, url: .html_url, title: .title}'

echo ""
echo "✅ Issue created successfully"
