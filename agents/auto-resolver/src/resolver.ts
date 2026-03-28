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

import { execSync, spawn } from 'child_process';
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
    autoMerged?: boolean;
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

  return { githubToken, githubRepo, projectDir, issuesDir, pollInterval, worktreeBase };
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

  if (existsSync(worktreePath)) {
    try { shell(`git worktree remove --force '${worktreePath}'`, projectDir); } catch { /* ignore */ }
    try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  shell('git fetch origin main', projectDir);
  try { shell(`git branch -D '${branchName}'`, projectDir); } catch { /* ignore */ }
  shell(`git worktree add -b '${branchName}' '${worktreePath}' origin/main`, projectDir);

  console.log('   📦 Installing dependencies in worktree...');
  shell('npm ci --ignore-scripts 2>/dev/null || npm install', worktreePath);

  return worktreePath;
}

function removeWorktreeSync(projectDir: string, worktreePath: string): void {
  try { execSync(`rm -rf '${worktreePath}/node_modules'`, { stdio: 'pipe', timeout: 30000 }); } catch { /* ignore */ }
  try { shell(`git worktree remove --force '${worktreePath}'`, projectDir); } catch { /* ignore */ }
  try { rmSync(worktreePath, { recursive: true, force: true }); } catch { /* ignore */ }
}

function removeWorktreeAsync(projectDir: string, worktreePath: string): void {
  const script = `rm -rf '${worktreePath}/node_modules' && git -C '${projectDir}' worktree remove --force '${worktreePath}' 2>/dev/null; rm -rf '${worktreePath}' 2>/dev/null`;
  const child = spawn('bash', ['-c', script], { stdio: 'ignore', detached: true });
  child.unref();
  console.log('   🧹 Worktree cleanup spawned in background');
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
    `You are a code editor. Fix this issue in as few steps as possible.`,
    ``,
    `Issue #${issue.number}: ${issue.title}`,
    issue.body ? `\nDetails: ${issue.body}` : '',
    ``,
    `The relevant code is in "${module}". For navigation/tab/layout changes, edit src/App.tsx.`,
    ``,
    `Rules:`,
    `- DO NOT explore the codebase extensively. Go directly to the file that needs changing.`,
    `- Make the edit. Verify with one Read of the changed file. Done.`,
    `- No more than 5-8 tool calls total.`,
    `- Only touch src/ files. Never touch agents/, config, or .env files.`,
    `- TypeScript strict mode is on (noUncheckedIndexedAccess).`,
    `- If the issue is already fixed, exit immediately with no changes.`,
  ].join('\n');

  const promptFile = join(worktreePath, '.claude-prompt.tmp');
  writeFileSync(promptFile, prompt, 'utf-8');

  try {
    execSync(
      `${claudeBin} --allowedTools "Edit,Read,Glob,Grep" --max-turns 10 -p "$(cat '${promptFile}')"`,
      {
        cwd: worktreePath,
        timeout: 300000,
        shell: '/bin/bash',
        stdio: 'inherit',
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
    body: JSON.stringify({ title, body, head: branch, base: 'main' }),
  });

  if (!res.ok) {
    throw new Error(`GitHub PR error (${res.status}): ${await res.text()}`);
  }

  return res.json() as Promise<{ number: number; html_url: string }>;
}

// --- Auto-Merge PR ---
async function mergePullRequest(
  githubToken: string,
  repo: string,
  prNumber: number,
  retries = 5,
  delayMs = 5000,
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const checkRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!checkRes.ok) {
      console.log(`   ⏳ Merge check failed (${checkRes.status}), attempt ${attempt}/${retries}`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    const prData = await checkRes.json() as { mergeable: boolean | null; mergeable_state: string };

    if (prData.mergeable === null) {
      console.log(`   ⏳ Mergeability pending, attempt ${attempt}/${retries}...`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    if (!prData.mergeable) {
      console.log(`   ⚠️  PR is not mergeable (state: ${prData.mergeable_state}), skipping auto-merge`);
      return false;
    }

    const mergeRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ merge_method: 'squash' }),
    });

    if (mergeRes.ok) {
      console.log(`   🔀 PR #${prNumber} auto-merged (squash)`);
      return true;
    }

    const errBody = await mergeRes.text();
    console.log(`   ⏳ Merge attempt ${attempt}/${retries} failed (${mergeRes.status}): ${errBody}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  console.log(`   ⚠️  Auto-merge failed after ${retries} attempts — PR remains open for manual review`);
  return false;
}

// --- Wait for GitHub Pages Deployment ---
async function waitForDeployment(
  githubToken: string,
  repo: string,
  commitSha: string,
  maxWaitMs = 300_000,
  pollMs = 15_000,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  console.log(`   ⏳ Waiting for GitHub Pages deployment (commit ${commitSha.slice(0, 7)})...`);

  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/deployments?sha=${commitSha}&environment=github-pages&per_page=1`,
        { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' } },
      );

      if (res.ok) {
        const deployments = (await res.json()) as Array<{ id: number }>;
        if (deployments.length > 0) {
          const deploymentId = deployments[0]!.id;
          const statusRes = await fetch(
            `https://api.github.com/repos/${repo}/deployments/${deploymentId}/statuses?per_page=1`,
            { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' } },
          );

          if (statusRes.ok) {
            const statuses = (await statusRes.json()) as Array<{ state: string }>;
            if (statuses.length > 0) {
              const state = statuses[0]!.state;
              if (state === 'success') { console.log(`   🚀 Deployment successful!`); return true; }
              if (state === 'failure' || state === 'error') { console.log(`   ❌ Deployment failed (state: ${state})`); return false; }
            }
          }
        }
      }
    } catch { /* network hiccup — retry */ }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  console.log(`   ⚠️  Deployment timed out after ${maxWaitMs / 1000}s`);
  return false;
}

// --- Get merge commit SHA ---
async function getMergeCommitSha(
  githubToken: string,
  repo: string,
  prNumber: number,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { merge_commit_sha: string | null };
      return data.merge_commit_sha;
    }
  } catch { /* best effort */ }
  return null;
}

// --- Telegram Notification ---
async function notifyTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ALLOWED_CHAT_IDS;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });
  } catch { /* best effort — don't break the pipeline */ }
}

// --- Close GitHub Issue ---
async function closeGitHubIssue(
  githubToken: string,
  repo: string,
  issueNumber: number,
): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });

  if (!res.ok) {
    console.log(`   ⚠️  Failed to close issue #${issueNumber} on GitHub (${res.status}): ${await res.text()}`);
    return false;
  }

  console.log(`   ✅ Issue #${issueNumber} closed on GitHub`);
  return true;
}

// --- Delete Remote Branch ---
async function deleteRemoteBranch(githubToken: string, repo: string, branch: string): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (res.ok) { console.log(`   🗑️  Deleted remote branch ${branch}`); }
  } catch { /* best effort */ }
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

    // 2. Create isolated worktree
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

    // 6. Auto-merge the PR
    const merged = await mergePullRequest(config.githubToken, config.githubRepo, pr.number);
    if (merged) {
      console.log(`   🔀 Issue #${issue.number} merged to main — awaiting deployment`);
      deleteRemoteBranch(config.githubToken, config.githubRepo, branchName).catch(() => {});

      // 7. Wait for GitHub Pages deployment
      let deployed = false;
      const mergeCommitSha = await getMergeCommitSha(config.githubToken, config.githubRepo, pr.number);
      if (mergeCommitSha) {
        deployed = await waitForDeployment(config.githubToken, config.githubRepo, mergeCommitSha);
      } else {
        console.log(`   ⚠️  Could not get merge commit SHA — skipping deployment check`);
      }

      // 8. Close the GitHub issue
      await closeGitHubIssue(config.githubToken, config.githubRepo, issue.number);

      // 9. Notify on Telegram with deployment status
      const siteUrl = `https://${config.githubRepo.split('/')[0]?.toLowerCase()}.github.io/${config.githubRepo.split('/')[1]}/`;
      if (deployed) {
        await notifyTelegram(
          `✅ *Issue #${issue.number} resolved and deployed*\n\n` +
          `*${issue.title}*\n` +
          `PR: ${pr.html_url}\n` +
          `🚀 Live: ${siteUrl}\n\n` +
          `_Auto-resolved by QuickFinance Agent_`
        );
        issue.status = 'resolved';
        issue.resolution = { prNumber: pr.number, prUrl: pr.html_url, resolvedAt: new Date().toISOString(), autoMerged: true };
        console.log(`   🎉 Issue #${issue.number} deployed successfully!`);
      } else {
        await notifyTelegram(
          `🔀 *Issue #${issue.number} merged but deployment unconfirmed*\n\n` +
          `*${issue.title}*\n` +
          `PR: ${pr.html_url}\n` +
          `🌐 Site: ${siteUrl}\n\n` +
          `_Check GitHub Pages status manually_`
        );
        issue.status = 'resolved';
        issue.resolution = { prNumber: pr.number, prUrl: pr.html_url, resolvedAt: new Date().toISOString(), autoMerged: true, error: 'Deployment unconfirmed' };
        console.log(`   ⚠️  Issue #${issue.number} merged but deployment did not confirm`);
      }
    } else {
      // Merge failed — notify
      await notifyTelegram(
        `🔀 *Issue #${issue.number} — PR created*\n\n` +
        `*${issue.title}*\n` +
        `PR: ${pr.html_url}\n` +
        `⚠️ Auto-merge failed — needs manual review`
      );
      issue.status = 'in_progress';
      issue.resolution = { prNumber: pr.number, prUrl: pr.html_url, resolvedAt: new Date().toISOString(), autoMerged: false };
      console.log(`   ⚠️  Issue #${issue.number} PR created but not merged — manual review needed`);
    }

    updateIssue(config.issuesDir, issue);
    console.log(`   ✅ Done — moving to next issue\n`);

    // 10. Worktree cleanup in background
    if (worktreePath) {
      removeWorktreeAsync(config.projectDir, worktreePath);
      worktreePath = '';
    }

  } catch (err: any) {
    console.error(`   ❌ Failed: ${err.message}`);

    await notifyTelegram(
      `❌ *Issue #${issue.number} failed to resolve*\n\n` +
      `*${issue.title}*\n` +
      `Error: ${err.message.slice(0, 200)}`
    );

    issue.status = 'pending';
    issue.resolution = { error: err.message, resolvedAt: new Date().toISOString() };
    updateIssue(config.issuesDir, issue);

    if (worktreePath) {
      console.log('   🧹 Cleaning up worktree...');
      removeWorktreeSync(config.projectDir, worktreePath);
      worktreePath = '';
    }

  } finally {
    if (worktreePath) {
      removeWorktreeAsync(config.projectDir, worktreePath);
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
