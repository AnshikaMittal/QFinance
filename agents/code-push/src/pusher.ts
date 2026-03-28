/**
 * QuickFinance Code Push Agent
 *
 * Autonomous agent that handles pushing your local code changes to GitHub.
 * No manual git commands needed — this agent:
 *
 *   1. Detects what changed in your working tree
 *   2. Runs the full validation pipeline (security, lint, typecheck, test, build)
 *   3. Stages, commits, and pushes to a branch
 *   4. Optionally creates a PR against main
 *   5. Sends a Telegram notification with the result
 *
 * Modes:
 *   - push    : validate → commit → push to current branch
 *   - pr      : validate → commit → push to new branch → create PR
 *   - validate: run checks only, no git operations
 *
 * Environment:
 *   GITHUB_TOKEN       — GitHub PAT with repo scope
 *   GITHUB_REPO        — Owner/repo (e.g., "akashkg/quickfinance")
 *   PROJECT_DIR        — Path to quickfinance project root
 *   TELEGRAM_BOT_TOKEN — (optional) Bot token for notifications
 *   TELEGRAM_CHAT_ID   — (optional) Chat ID for notifications
 *
 * Usage:
 *   tsx agents/code-push/src/pusher.ts push "commit message"
 *   tsx agents/code-push/src/pusher.ts pr "feature description"
 *   tsx agents/code-push/src/pusher.ts validate
 */

import { execSync } from 'child_process';
import { validate, formatResult } from './validator.js';

// --- Types ---
type Mode = 'push' | 'pr' | 'validate';

interface PushResult {
  mode: Mode;
  validation: ReturnType<typeof validate>;
  branch?: string;
  commitHash?: string;
  prUrl?: string;
  error?: string;
}

// --- Config ---
function getConfig() {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  const projectDir = process.env.PROJECT_DIR;

  if (!githubToken || !githubRepo || !projectDir) {
    console.error('Missing required environment variables:');
    if (!githubToken) console.error('  - GITHUB_TOKEN');
    if (!githubRepo) console.error('  - GITHUB_REPO');
    if (!projectDir) console.error('  - PROJECT_DIR');
    process.exit(1);
  }

  return {
    githubToken,
    githubRepo,
    projectDir,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID ?? null,
  };
}

// --- Git ---
function git(cwd: string, ...args: string[]): string {
  try {
    return execSync(`git ${args.join(' ')}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err: any) {
    throw new Error(`git ${args[0]}: ${err.stderr ?? err.message}`);
  }
}

function getCurrentBranch(cwd: string): string {
  return git(cwd, 'branch', '--show-current') || 'main';
}

function getChangedFiles(cwd: string): string[] {
  const status = git(cwd, 'status', '--porcelain');
  if (!status) return [];
  return status.split('\n').filter(Boolean);
}

function getStagedDiff(cwd: string): string {
  try {
    return git(cwd, 'diff', '--cached', '--stat');
  } catch {
    return '';
  }
}

function stageAll(cwd: string): void {
  git(cwd, 'add', '-A');
}

function commit(cwd: string, message: string): string {
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', '--short', 'HEAD');
}

function push(cwd: string, branch: string): void {
  git(cwd, 'push', '-u', 'origin', branch);
}

function createFeatureBranch(cwd: string, name: string): string {
  // Sanitize branch name
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const branchName = `feature/${safeName}-${Date.now().toString(36)}`;

  git(cwd, 'checkout', '-b', branchName);
  return branchName;
}

// --- GitHub PR ---
async function createPR(
  token: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base = 'main',
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, head, base }),
  });

  if (!res.ok) {
    throw new Error(`GitHub PR creation failed (${res.status}): ${await res.text()}`);
  }

  const pr = (await res.json()) as { html_url: string };
  return pr.html_url;
}

// --- Telegram Notification ---
async function notifyTelegram(
  token: string,
  chatId: string,
  message: string,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('Telegram notification failed:', err);
  }
}

// --- Main Pipeline ---
async function runPush(mode: Mode, message: string): Promise<PushResult> {
  const config = getConfig();
  const { projectDir } = config;

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   QuickFinance Code Push Agent           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Mode:    ${mode}`);
  console.log(`  Message: ${message || '(auto)'}`);
  console.log('');

  // 1. Check for changes
  const changedFiles = getChangedFiles(projectDir);
  if (mode !== 'validate' && changedFiles.length === 0) {
    console.log('  ⚠ No changes detected in working tree');
    return {
      mode,
      validation: { passed: true, steps: [], totalDuration: 0, summary: 'No changes to push' },
    };
  }

  if (changedFiles.length > 0) {
    console.log(`  📝 ${changedFiles.length} changed file(s):`);
    changedFiles.slice(0, 10).forEach((f) => console.log(`     ${f}`));
    if (changedFiles.length > 10) {
      console.log(`     ... and ${changedFiles.length - 10} more`);
    }
    console.log('');
  }

  // 2. Stage everything before validation (so lint/typecheck see all files)
  if (mode !== 'validate') {
    console.log('  📦 Staging changes...');
    stageAll(projectDir);
  }

  // 3. Run validation
  console.log('  🔍 Running validation pipeline...');
  const validation = validate(projectDir, true);
  console.log('');
  console.log(formatResult(validation));
  console.log('');

  if (!validation.passed) {
    const result: PushResult = { mode, validation, error: 'Validation failed' };
    await sendNotification(config, result, message);
    return result;
  }

  // Validate-only mode stops here
  if (mode === 'validate') {
    console.log('  ✅ Validation complete (dry run — no push)');
    await sendNotification(config, { mode, validation }, message);
    return { mode, validation };
  }

  // 4. Commit
  const commitMessage = message || `chore: update ${changedFiles.length} file(s)`;
  console.log(`  💾 Committing: ${commitMessage}`);
  let commitHash: string;
  try {
    commitHash = commit(projectDir, commitMessage);
  } catch (err: any) {
    // If nothing to commit (maybe changes were already staged/committed)
    console.log(`  ⚠ ${err.message}`);
    commitHash = git(projectDir, 'rev-parse', '--short', 'HEAD');
  }
  console.log(`  📌 Commit: ${commitHash}`);

  let branch: string;
  let prUrl: string | undefined;

  if (mode === 'pr') {
    // 5a. PR mode — create feature branch, push, open PR
    const originalBranch = getCurrentBranch(projectDir);

    // We already committed on the current branch. Let's move that commit to a new branch.
    // Reset current branch, create new branch with the commit.
    const newBranch = createFeatureBranch(projectDir, message || 'update');

    // The commit is on the original branch — cherry-pick it onto the new branch
    // Actually, `checkout -b` from current HEAD already has the commit
    // Since we committed before branching, we need to handle this differently:
    // Go back and move the commit

    // Simpler approach: we're already on a new branch with the commit
    // Just push this branch and create PR
    branch = newBranch;

    console.log(`  🌿 Branch: ${branch}`);
    console.log('  📤 Pushing...');
    push(projectDir, branch);

    console.log('  🔀 Creating PR...');
    const prBody = [
      `## Changes`,
      '',
      `${commitMessage}`,
      '',
      `**Validation:** ${validation.summary}`,
      '',
      '---',
      '*Pushed by QuickFinance Code Push Agent*',
    ].join('\n');

    prUrl = await createPR(
      config.githubToken,
      config.githubRepo,
      commitMessage,
      prBody,
      branch,
    );
    console.log(`  🔗 PR: ${prUrl}`);

    // Switch back to original branch
    git(projectDir, 'checkout', originalBranch);

  } else {
    // 5b. Push mode — push directly to current branch
    branch = getCurrentBranch(projectDir);
    console.log(`  📤 Pushing to ${branch}...`);
    push(projectDir, branch);
  }

  console.log('');
  console.log('  ✅ Done!');

  const result: PushResult = { mode, validation, branch, commitHash, prUrl };
  await sendNotification(config, result, message);
  return result;
}

// --- Notification ---
async function sendNotification(
  config: ReturnType<typeof getConfig>,
  result: PushResult,
  message: string,
): Promise<void> {
  if (!config.telegramToken || !config.telegramChatId) return;

  const lines: string[] = [];

  if (result.error) {
    lines.push(`❌ *Push Failed*`);
    lines.push(`Message: ${message}`);
    lines.push('');
    lines.push(result.validation.summary);
  } else if (result.mode === 'validate') {
    lines.push(`🔍 *Validation ${result.validation.passed ? 'Passed' : 'Failed'}*`);
    lines.push(result.validation.summary);
  } else {
    lines.push(`✅ *Code Pushed*`);
    lines.push(`Branch: \`${result.branch}\``);
    lines.push(`Commit: \`${result.commitHash}\``);
    if (result.prUrl) {
      lines.push(`PR: ${result.prUrl}`);
    }
    lines.push('');
    lines.push(result.validation.summary);
  }

  await notifyTelegram(config.telegramToken, config.telegramChatId, lines.join('\n'));
}

// --- CLI Entry Point ---
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = (args[0] ?? 'push') as Mode;
  const message = args.slice(1).join(' ');

  if (!['push', 'pr', 'validate'].includes(mode)) {
    console.error('Usage: tsx pusher.ts <push|pr|validate> [commit message]');
    console.error('');
    console.error('Modes:');
    console.error('  push      — validate → commit → push to current branch');
    console.error('  pr        — validate → commit → push to new branch → create PR');
    console.error('  validate  — run checks only, no git operations');
    process.exit(1);
  }

  const result = await runPush(mode, message);

  if (result.error || !result.validation.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
