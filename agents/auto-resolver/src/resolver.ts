/**
 * QuickFinance Auto-Resolver
 *
 * Reads pending issues from local store, uses Claude to analyze and fix them,
 * then creates PRs with the fixes.
 *
 * Architecture:
 *   - Uses `git worktree` to create an isolated clean copy per issue
 *   - Never touches the user's working tree (no checkout, no pull, no stash)
 *   - Claude Code runs inside the worktree, so dirty main tree is irrelevant
 *   - After push + PR, worktree is cleaned up
 *
 * Environment:
 *   GITHUB_TOKEN    — GitHub PAT with repo scope
 *   GITHUB_REPO     — Owner/repo
 *   ISSUES_DIR      — Local issues directory
 *   PROJECT_DIR     — Path to quickfinance project root
 *   POLL_INTERVAL   — Check interval in seconds (default: 60)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from agent dir then project root
function loadEnv(): void {
  const __dir = dirname(fileURLToPath(import.meta.url));
  for (const envPath of [resolve(__dir, '..', '.env'), resolve(__dir, '..', '..', '..', '.env')]) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch { /* skip if not found */ }
  }
}

loadEnv();

interface LocalIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'skipped';
  createdAt: string;
  updatedAt: string;
  fetchedAt: string;
  resolution?: {
    prNumber?: number;
    prUrl?: string;
    resolvedAt?: string;
    error?: string;
  };
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

  const __dir = dirname(fileURLToPath(import.meta.url));
  const issuesDir = process.env.ISSUES_DIR ?? join(__dir, '..', '..', 'issue-poller', 'issues');
  const pollInterval = parseInt(process.env.POLL_INTERVAL ?? '60', 10);
  const worktreeBase = join(projectDir, '..', '.qf-worktrees');

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  return { githubToken, githubRepo, projectDir, issuesDir, pollInterval, worktreeBase, telegramToken, telegramChatId };
}

// --- Issue Store ---
function getPendingIssues(issuesDir: string): LocalIssue[] {
  if (!existsSync(issuesDir)) return [];

  return readdirSync(issuesDir)
    .filter((f) => f.startsWith('issue-') && f.endsWith('.json'))
    .map((f) => {
      try {
        const content = readFileSync(join(issuesDir, f), 'utf-8');
        return JSON.parse(content) as LocalIssue;
      } catch {
        return null;
      }
    })
    .filter((i): i is LocalIssue => i !== null && i.status === 'pending');
}

function updateIssue(issuesDir: string, issue: LocalIssue): void {
  const filePath = join(issuesDir, `issue-${issue.number}.json`);
  writeFileSync(filePath, JSON.stringify(issue, null, 2), 'utf-8');
}

// --- Module Detection ---
function detectAffectedModule(issue: LocalIssue): string {
  const text = `${issue.title} ${issue.body}`.toLowerCase();

  // App-level issues that touch root files (App.tsx, routing, navigation, tabs)
  const appLevelKeywords = ['tab', 'navigation', 'nav', 'route', 'layout', 'move', 'reorder', 'swap', 'sidebar', 'menu'];
  if (appLevelKeywords.some((kw) => text.includes(kw))) {
    return 'src';
  }

  const moduleKeywords: Record<string, string[]> = {
    'src/features/transactions': ['transaction', 'expense', 'spending', 'entry', 'add transaction'],
    'src/features/csv-import': ['csv', 'import', 'statement', 'chase', 'apple card', 'parse', 'pdf statement', 'pdf import'],
    'src/features/budgets': ['budget', 'limit', 'goal', 'overspend'],
    'src/features/analytics': ['analytics', 'chart', 'trend', 'money spill', 'spending creep'],
    'src/features/dashboard': ['dashboard', 'overview', 'home', 'summary'],
    'src/features/categories': ['category', 'categorize', 'label'],
    'src/features/sync': ['sync', 'backup', 'github sync', 'cloud'],
    'src/features/settings': ['settings', 'card', 'config', 'theme', 'dark mode'],
    'src/ui': ['button', 'modal', 'input', 'ui', 'component', 'style', 'animation'],
    'src/core': ['database', 'db', 'schema', 'type', 'util', 'format'],
  };

  for (const [module, keywords] of Object.entries(moduleKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return module;
    }
  }

  return 'src';
}

// --- Shell helpers ---
function shell(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: '/bin/bash',
    }).trim();
  } catch (err: any) {
    throw new Error(err.stderr?.trim() || err.message);
  }
}

// --- Worktree Management ---
function createWorktree(projectDir: string, worktreeBase: string, branchName: string): string {
  mkdirSync(worktreeBase, { recursive: true });
  const worktreePath = join(worktreeBase, branchName);

  // Clean up stale worktree if it exists
  if (existsSync(worktreePath)) {
    try { shell(`git worktree remove --force '${worktreePath}'`, projectDir); } catch { /* ignore */ }
    try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  // Fetch latest from remote (safe — doesn't touch working tree)
  shell('git fetch origin main', projectDir);

  // Delete the branch if it exists from a previous attempt
  try { shell(`git branch -D '${branchName}'`, projectDir); } catch { /* ignore */ }

  // Create worktree with new branch based on origin/main
  shell(`git worktree add -b '${branchName}' '${worktreePath}' origin/main`, projectDir);

  // Install dependencies in worktree so Claude Code can run tests/build
  console.log('   📦 Installing dependencies in worktree...');
  shell('npm ci --ignore-scripts 2>/dev/null || npm install', worktreePath);

  return worktreePath;
}

function removeWorktree(projectDir: string, worktreePath: string): void {
  try { shell(`git worktree remove --force '${worktreePath}'`, projectDir); } catch { /* ignore */ }
  try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* ignore */ }
}

// --- Claude Integration ---
function findClaudeBinary(): string {
  const candidates = [
    'claude',
    `${process.env.HOME}/.claude/bin/claude`,
    `${process.env.HOME}/.npm-global/bin/claude`,
    '/usr/local/bin/claude',
  ];

  for (const bin of candidates) {
    try {
      execSync(`${bin} --version`, { stdio: 'pipe', encoding: 'utf-8' });
      return bin;
    } catch { /* not here, try next */ }
  }

  return 'npx -y @anthropic-ai/claude-code';
}

let claudeBin: string | null = null;

function invokeClaudeCode(worktreePath: string, module: string, issue: LocalIssue): boolean {
  if (!claudeBin) {
    claudeBin = findClaudeBinary();
    console.log(`   🔍 Using Claude CLI: ${claudeBin}`);
  }

  const prompt = [
    `Fix the following issue in the QuickFinance project.`,
    `Focus on files within the "${module}" directory, but modify other src/ files if needed (e.g. App.tsx for layout/navigation changes).`,
    ``,
    `Issue #${issue.number}: ${issue.title}`,
    ``,
    issue.body,
    ``,
    `Important:`,
    `- Make minimal, focused changes`,
    `- Follow existing code patterns and conventions`,
    `- Do not modify agent files or config files`,
    `- Use TypeScript strict mode (noUncheckedIndexedAccess is enabled)`,
  ].join('\n');

  const promptFile = join(worktreePath, '.claude-prompt.tmp');
  writeFileSync(promptFile, prompt, 'utf-8');

  try {
    execSync(
      `${claudeBin} --print --allowedTools "Edit,Write,Read,Glob,Grep,Bash" --max-turns 20 < "${promptFile}"`,
      {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: 300000,
        shell: '/bin/bash',
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.claude/bin:${process.env.HOME}/.npm-global/bin:/usr/local/bin:${process.env.PATH}`,
        },
      },
    );
    return true;
  } catch (err: any) {
    console.error(`   Claude Code exit code: ${err.status}`);
    return false;
  } finally {
    try { execSync(`rm -f "${promptFile}"`, { stdio: 'pipe' }); } catch { /* ignore */ }
  }
}

// --- GitHub PR ---
async function createPullRequest(
  githubToken: string,
  repo: string,
  title: string,
  body: string,
  branch: string,
): Promise<{ number: number; html_url: string }> {
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body,
      head: branch,
      base: 'main',
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub PR error (${res.status}): ${await res.text()}`);
  }

  return res.json() as Promise<{ number: number; html_url: string }>;
}

// --- Telegram Notification ---
async function notifyTelegram(
  config: ReturnType<typeof getConfig>,
  issue: LocalIssue,
  outcome: { success: true; prNumber: number; prUrl: string; branch: string } | { success: false; error: string },
): Promise<void> {
  if (!config.telegramToken || !config.telegramChatId) return;

  const lines: string[] = [];

  if (outcome.success) {
    lines.push(`✅ *Issue #${issue.number} Resolved*`);
    lines.push(`${issue.title}`);
    lines.push('');
    lines.push(`Branch: \`${outcome.branch}\``);
    lines.push(`PR: [#${outcome.prNumber}](${outcome.prUrl})`);
  } else {
    lines.push(`❌ *Issue #${issue.number} Resolution Failed*`);
    lines.push(`${issue.title}`);
    lines.push('');
    lines.push(`Error: ${outcome.error}`);
  }

  try {
    await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: lines.join('\n'),
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('   ⚠ Telegram notification failed:', err);
  }
}

// --- Resolve Issue ---
async function resolveIssue(config: ReturnType<typeof getConfig>, issue: LocalIssue): Promise<void> {
  console.log(`\n🔧 Resolving #${issue.number}: ${issue.title}`);

  issue.status = 'in_progress';
  updateIssue(config.issuesDir, issue);

  const branchName = `auto-fix/issue-${issue.number}`;
  let worktreePath = '';

  try {
    // 1. Detect affected module
    const module = detectAffectedModule(issue);
    console.log(`   📂 Affected module: ${module}`);

    // 2. Create isolated worktree (never touches main working tree)
    console.log(`   🌿 Creating worktree for ${branchName}...`);
    worktreePath = createWorktree(config.projectDir, config.worktreeBase, branchName);
    console.log(`   📁 Worktree: ${worktreePath}`);

    // 3. Invoke Claude Code inside the worktree
    console.log(`   🤖 Invoking Claude Code...`);
    const success = invokeClaudeCode(worktreePath, module, issue);

    if (!success) {
      throw new Error('Claude Code failed to generate a fix');
    }

    // 4. Commit and push from the worktree
    const commitMsg = `fix(issue-${issue.number}): ${issue.title}`;
    shell('git add -A', worktreePath);

    const status = shell('git status --porcelain', worktreePath);
    if (!status) {
      throw new Error('No changes to commit — Claude Code made no modifications');
    }

    shell(`git commit -m '${commitMsg.replace(/'/g, "'\\''")}'`, worktreePath);
    shell(`git push -u origin '${branchName}'`, worktreePath);
    console.log(`   📤 Pushed to ${branchName}`);

    // 5. Create PR
    const prTitle = `fix: resolve #${issue.number} - ${issue.title}`;
    const prBody = [
      `## Auto-Resolved Issue`,
      '',
      `Closes #${issue.number}`,
      '',
      `**Original issue:** ${issue.url}`,
      `**Module:** \`${module}\``,
      '',
      '---',
      '*This PR was automatically generated by the QuickFinance Auto-Resolver agent.*',
    ].join('\n');

    const pr = await createPullRequest(config.githubToken, config.githubRepo, prTitle, prBody, branchName);
    console.log(`   ✅ PR #${pr.number}: ${pr.html_url}`);

    // 6. Update issue status
    issue.status = 'resolved';
    issue.resolution = {
      prNumber: pr.number,
      prUrl: pr.html_url,
      resolvedAt: new Date().toISOString(),
    };
    updateIssue(config.issuesDir, issue);

    // 7. Notify via Telegram
    await notifyTelegram(config, issue, {
      success: true,
      prNumber: pr.number,
      prUrl: pr.html_url,
      branch: branchName,
    });

  } catch (err: any) {
    console.error(`   ❌ Failed: ${err.message}`);

    issue.status = 'pending';
    issue.resolution = {
      error: err.message,
      resolvedAt: new Date().toISOString(),
    };
    updateIssue(config.issuesDir, issue);

    // Notify failure via Telegram
    await notifyTelegram(config, issue, {
      success: false,
      error: err.message,
    });

  } finally {
    // 8. Always clean up worktree
    if (worktreePath) {
      console.log('   🧹 Cleaning up worktree...');
      removeWorktree(config.projectDir, worktreePath);
    }
  }
}

// --- Main Loop ---
async function main(): Promise<void> {
  const config = getConfig();

  console.log('🤖 QuickFinance Auto-Resolver started');
  console.log(`   Repo: ${config.githubRepo}`);
  console.log(`   Project: ${config.projectDir}`);
  console.log(`   Issues: ${config.issuesDir}`);
  console.log(`   Worktrees: ${config.worktreeBase}`);
  console.log(`   Poll interval: ${config.pollInterval}s`);
  console.log('');

  while (true) {
    try {
      const pending = getPendingIssues(config.issuesDir);

      if (pending.length > 0) {
        console.log(`[${new Date().toLocaleTimeString()}] ${pending.length} pending issue(s)`);

        const issue = pending[0];
        if (issue) {
          await resolveIssue(config, issue);
        }
      }
    } catch (err) {
      console.error('Resolver error:', err);
    }

    await new Promise((r) => setTimeout(r, config.pollInterval * 1000));
  }
}

main().catch(console.error);
