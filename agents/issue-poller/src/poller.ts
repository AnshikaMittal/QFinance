/**
 * QuickFinance Issue Poller
 *
 * Polls GitHub Issues at regular intervals and stores them locally
 * as JSON files for the Claude auto-resolver to pick up.
 *
 * Environment:
 *   GITHUB_TOKEN    — GitHub PAT with repo scope
 *   GITHUB_REPO     — Owner/repo
 *   POLL_INTERVAL   — Poll interval in seconds (default: 300 = 5 min)
 *   ISSUES_DIR      — Local directory to store issues (default: ./issues)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root
function loadEnv(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Try agent-level .env first, then project root .env
  for (const envPath of [resolve(__dirname, '..', '.env'), resolve(__dirname, '..', '..', '..', '.env')]) {
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

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string }>;
  html_url: string;
  created_at: string;
  updated_at: string;
  assignee: { login: string } | null;
}

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

  if (!githubToken || !githubRepo) {
    console.error('Missing required environment variables:');
    if (!githubToken) console.error('  - GITHUB_TOKEN');
    if (!githubRepo) console.error('  - GITHUB_REPO');
    process.exit(1);
  }

  const pollInterval = parseInt(process.env.POLL_INTERVAL ?? '300', 10);
  const issuesDir = process.env.ISSUES_DIR ?? join(process.cwd(), 'issues');

  return { githubToken, githubRepo, pollInterval, issuesDir };
}

// --- GitHub API ---
async function fetchOpenIssues(token: string, repo: string): Promise<GitHubIssue[]> {
  const allIssues: GitHubIssue[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}&sort=updated&direction=desc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
    }

    const issues = (await res.json()) as GitHubIssue[];

    // Filter out pull requests (GitHub API returns PRs as issues too)
    const realIssues = issues.filter((i) => !('pull_request' in i));
    allIssues.push(...realIssues);

    if (issues.length < 100) break;
    page++;
  }

  return allIssues;
}

// --- Local Store ---
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getLocalIssue(issuesDir: string, number: number): LocalIssue | null {
  const filePath = join(issuesDir, `issue-${number}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as LocalIssue;
  } catch {
    return null;
  }
}

function saveLocalIssue(issuesDir: string, issue: LocalIssue): void {
  const filePath = join(issuesDir, `issue-${issue.number}.json`);
  writeFileSync(filePath, JSON.stringify(issue, null, 2), 'utf-8');
}

function getLocalIssueNumbers(issuesDir: string): number[] {
  if (!existsSync(issuesDir)) return [];

  return readdirSync(issuesDir)
    .filter((f) => f.startsWith('issue-') && f.endsWith('.json'))
    .map((f) => parseInt(f.replace('issue-', '').replace('.json', ''), 10))
    .filter((n) => !isNaN(n));
}

// --- Sync Logic ---
function shouldAutoResolve(issue: GitHubIssue): boolean {
  const labels = issue.labels.map((l) => l.name.toLowerCase());

  // Don't auto-resolve issues that are manually assigned or have "manual" label
  if (issue.assignee) return false;
  if (labels.includes('manual')) return false;
  if (labels.includes('wontfix')) return false;

  // Auto-resolve bugs and features from telegram bot
  return labels.includes('telegram-bot') || labels.includes('bug') || labels.includes('enhancement');
}

async function syncIssues(config: ReturnType<typeof getConfig>): Promise<{ synced: number; new: number }> {
  const remoteIssues = await fetchOpenIssues(config.githubToken, config.githubRepo);
  let newCount = 0;

  for (const remote of remoteIssues) {
    const existing = getLocalIssue(config.issuesDir, remote.number);

    if (!existing) {
      // New issue
      const local: LocalIssue = {
        number: remote.number,
        title: remote.title,
        body: remote.body ?? '',
        labels: remote.labels.map((l) => l.name),
        url: remote.html_url,
        status: shouldAutoResolve(remote) ? 'pending' : 'skipped',
        createdAt: remote.created_at,
        updatedAt: remote.updated_at,
        fetchedAt: new Date().toISOString(),
      };

      saveLocalIssue(config.issuesDir, local);
      newCount++;

      console.log(
        `  📥 #${remote.number}: ${remote.title} [${local.status}]`,
      );
    } else if (existing.status !== 'resolved' && existing.updatedAt !== remote.updated_at) {
      // Updated issue — refresh but keep status
      existing.title = remote.title;
      existing.body = remote.body ?? '';
      existing.labels = remote.labels.map((l) => l.name);
      existing.updatedAt = remote.updated_at;
      existing.fetchedAt = new Date().toISOString();

      saveLocalIssue(config.issuesDir, existing);
      console.log(`  🔄 #${remote.number}: updated`);
    }
  }

  // Mark closed remote issues as resolved locally
  const remoteNumbers = new Set(remoteIssues.map((i) => i.number));
  const localNumbers = getLocalIssueNumbers(config.issuesDir);

  for (const num of localNumbers) {
    if (!remoteNumbers.has(num)) {
      const local = getLocalIssue(config.issuesDir, num);
      if (local && local.status !== 'resolved') {
        local.status = 'resolved';
        saveLocalIssue(config.issuesDir, local);
        console.log(`  ✅ #${num}: closed remotely, marked resolved`);
      }
    }
  }

  return { synced: remoteIssues.length, new: newCount };
}

// --- Main Loop ---
async function main(): Promise<void> {
  const config = getConfig();
  ensureDir(config.issuesDir);

  console.log('📡 QuickFinance Issue Poller started');
  console.log(`   Repo: ${config.githubRepo}`);
  console.log(`   Poll interval: ${config.pollInterval}s`);
  console.log(`   Issues dir: ${config.issuesDir}`);
  console.log('');

  while (true) {
    try {
      console.log(`[${new Date().toLocaleTimeString()}] Polling issues...`);
      const { synced, new: newCount } = await syncIssues(config);
      console.log(`  📊 ${synced} open issues, ${newCount} new`);
    } catch (err) {
      console.error('Poll error:', err);
    }

    await new Promise((r) => setTimeout(r, config.pollInterval * 1000));
  }
}

main().catch(console.error);
