/**
 * QuickFinance Auto-Resolver
 *
 * Reads pending issues from local store, uses Claude to analyze and fix them,
 * then creates PRs with the fixes.
 *
 * Architecture:
 *   1. Scan issues/ directory for pending issues
 *   2. For each pending issue:
 *      a. Read the issue description
 *      b. Determine which module is affected
 *      c. Shell out to Claude Code to generate the fix
 *      d. Create a branch, commit changes, push, and open a PR
 *      e. Update local issue status
 *
 * Environment:
 *   GITHUB_TOKEN    — GitHub PAT with repo scope
 *   GITHUB_REPO     — Owner/repo
 *   ISSUES_DIR      — Local issues directory (default: ../issue-poller/issues)
 *   PROJECT_DIR     — Path to quickfinance project root
 *   POLL_INTERVAL   — Check interval in seconds (default: 60)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root
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

  return { githubToken, githubRepo, projectDir, issuesDir, pollInterval };
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

  return 'src'; // fallback: whole src
}

// --- Git Operations ---
function git(projectDir: string, ...args: string[]): string {
  try {
    return execSync(`git ${args.join(' ')}`, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err: any) {
    throw new Error(`Git error: ${err.stderr ?? err.message}`);
  }
}

function createBranch(projectDir: string, issueNumber: number): string {
  const branchName = `auto-fix/issue-${issueNumber}`;

  // Stash any local changes (e.g. issue JSON updates) before pulling
  const dirty = git(projectDir, 'status', '--porcelain');
  const stashed = dirty.length > 0;
  if (stashed) {
    git(projectDir, 'stash', '--include-untracked');
  }

  // Ensure we're on main and up to date
  git(projectDir, 'checkout', 'main');
  git(projectDir, 'pull', 'origin', 'main', '--rebase');

  // Restore stashed changes
  if (stashed) {
    try {
      git(projectDir, 'stash', 'pop');
    } catch { /* ignore conflicts — issue JSONs are local-only */ }
  }

  // Create and switch to new branch
  try {
    git(projectDir, 'checkout', '-b', branchName);
  } catch {
    // Branch might already exist
    git(projectDir, 'checkout', branchName);
    git(projectDir, 'rebase', 'main');
  }

  return branchName;
}

function commitAndPush(projectDir: string, branchName: string, message: string): void {
  git(projectDir, 'add', '-A');

  const status = git(projectDir, 'status', '--porcelain');
  if (!status) {
    throw new Error('No changes to commit');
  }

  git(projectDir, 'commit', '-m', message);
  git(projectDir, 'push', '-u', 'origin', branchName);
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

// --- Claude Integration ---
function invokeClaudeCode(projectDir: string, module: string, issue: LocalIssue): boolean {
  const prompt = [
    `Fix the following issue in the QuickFinance project.`,
    `Only modify files within the "${module}" directory.`,
    `After making changes, add or update relevant unit tests.`,
    ``,
    `Issue #${issue.number}: ${issue.title}`,
    ``,
    issue.body,
    ``,
    `Important:`,
    `- Make minimal, focused changes`,
    `- Follow existing code patterns and conventions`,
    `- Add unit tests for any new or changed functionality`,
    `- Do not modify files outside "${module}" unless absolutely necessary`,
    `- Use TypeScript strict mode (noUncheckedIndexedAccess is enabled)`,
  ].join('\n');

  try {
    // Use claude code CLI to apply the fix
    execSync(
      `claude -p "${prompt.replace(/"/g, '\\"')}" --allowedTools "Edit,Write,Read,Glob,Grep,Bash" --max-turns 20`,
      {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000, // 5 minute timeout
      },
    );
    return true;
  } catch (err: any) {
    console.error(`Claude Code error: ${err.message}`);
    return false;
  }
}

// --- Resolve Issue ---
async function resolveIssue(config: ReturnType<typeof getConfig>, issue: LocalIssue): Promise<void> {
  console.log(`\n🔧 Resolving #${issue.number}: ${issue.title}`);

  // Mark as in progress
  issue.status = 'in_progress';
  updateIssue(config.issuesDir, issue);

  try {
    // 1. Detect affected module
    const module = detectAffectedModule(issue);
    console.log(`   📂 Affected module: ${module}`);

    // 2. Create branch
    const branch = createBranch(config.projectDir, issue.number);
    console.log(`   🌿 Branch: ${branch}`);

    // 3. Invoke Claude Code to fix the issue
    console.log(`   🤖 Invoking Claude Code...`);
    const success = invokeClaudeCode(config.projectDir, module, issue);

    if (!success) {
      throw new Error('Claude Code failed to generate a fix');
    }

    // 4. Commit and push
    const commitMsg = `fix: resolve #${issue.number} — ${issue.title}\n\nAuto-resolved by QuickFinance Agent\nCloses #${issue.number}`;
    commitAndPush(config.projectDir, branch, commitMsg);
    console.log(`   📤 Pushed to ${branch}`);

    // 5. Create PR
    const prTitle = `fix: resolve #${issue.number} — ${issue.title}`;
    const prBody = [
      `## Auto-Resolved Issue`,
      '',
      `Closes #${issue.number}`,
      '',
      `**Original issue:** ${issue.url}`,
      '',
      `**Module:** \`${module}\``,
      '',
      '---',
      '*This PR was automatically generated by the QuickFinance Auto-Resolver agent.*',
      '*It will be auto-merged if all CI checks pass.*',
    ].join('\n');

    const pr = await createPullRequest(config.githubToken, config.githubRepo, prTitle, prBody, branch);
    console.log(`   ✅ PR #${pr.number}: ${pr.html_url}`);

    // 6. Update issue status
    issue.status = 'resolved';
    issue.resolution = {
      prNumber: pr.number,
      prUrl: pr.html_url,
      resolvedAt: new Date().toISOString(),
    };
    updateIssue(config.issuesDir, issue);

    // 7. Return to main
    git(config.projectDir, 'checkout', 'main');

  } catch (err: any) {
    console.error(`   ❌ Failed: ${err.message}`);

    issue.status = 'pending'; // Reset to pending for retry
    issue.resolution = {
      error: err.message,
      resolvedAt: new Date().toISOString(),
    };
    updateIssue(config.issuesDir, issue);

    // Return to main on failure
    try {
      git(config.projectDir, 'checkout', 'main');
    } catch { /* ignore */ }
  }
}

// --- Main Loop ---
async function main(): Promise<void> {
  const config = getConfig();

  console.log('🤖 QuickFinance Auto-Resolver started');
  console.log(`   Repo: ${config.githubRepo}`);
  console.log(`   Project: ${config.projectDir}`);
  console.log(`   Issues: ${config.issuesDir}`);
  console.log(`   Poll interval: ${config.pollInterval}s`);
  console.log('');

  while (true) {
    try {
      const pending = getPendingIssues(config.issuesDir);

      if (pending.length > 0) {
        console.log(`[${new Date().toLocaleTimeString()}] ${pending.length} pending issue(s)`);

        // Process one at a time
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
