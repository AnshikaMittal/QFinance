/**
 * QuickFinance Telegram Bot
 *
 * Receives messages from Telegram and creates GitHub Issues,
 * plus triggers code push operations.
 *
 * Commands:
 *   /bug <description>     — Report a bug
 *   /feature <description> — Request a feature
 *   /issue <description>   — General issue
 *   /push <message>        — Validate + commit + push to current branch
 *   /pr <message>          — Validate + commit + push to new branch + create PR
 *   /validate              — Run checks only (no git ops)
 *   /status                — Check bot status
 *
 * Environment:
 *   TELEGRAM_BOT_TOKEN — Bot token from @BotFather
 *   GITHUB_TOKEN       — GitHub PAT with repo scope
 *   GITHUB_REPO        — Owner/repo (e.g., "akashkg/quickfinance")
 *   PROJECT_DIR        — Path to quickfinance project root (for push commands)
 *   ALLOWED_CHAT_IDS   — Comma-separated chat IDs (optional, for security)
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env file (no external dependency needed)
function loadEnv(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, '..', '.env');
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
  } catch {
    // .env file not found — rely on environment variables
  }
}

loadEnv();

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; first_name?: string };
    text?: string;
    date: number;
  };
}

interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
}

// --- Config ---
function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;

  if (!token || !githubToken || !githubRepo) {
    console.error('Missing required environment variables:');
    if (!token) console.error('  - TELEGRAM_BOT_TOKEN');
    if (!githubToken) console.error('  - GITHUB_TOKEN');
    if (!githubRepo) console.error('  - GITHUB_REPO');
    process.exit(1);
  }

  const allowedChatIds = process.env.ALLOWED_CHAT_IDS
    ? process.env.ALLOWED_CHAT_IDS.split(',').map(Number)
    : null;

  const projectDir = process.env.PROJECT_DIR ?? null;

  return { token, githubToken, githubRepo, allowedChatIds, projectDir };
}

// --- Telegram API ---
async function telegramRequest(token: string, method: string, body?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  });
}

async function getUpdates(token: string, offset: number): Promise<TelegramUpdate[]> {
  const data = await telegramRequest(token, 'getUpdates', {
    offset,
    timeout: 30, // long polling
  });
  return data.result ?? [];
}

// --- GitHub API ---
async function createGitHubIssue(
  githubToken: string,
  repo: string,
  title: string,
  body: string,
  labels: string[],
): Promise<GitHubIssue> {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${err}`);
  }

  return res.json() as Promise<GitHubIssue>;
}

// --- Command Handlers ---
type IssueType = 'bug' | 'feature' | 'issue';

const LABELS: Record<IssueType, string[]> = {
  bug: ['bug', 'telegram-bot'],
  feature: ['enhancement', 'telegram-bot'],
  issue: ['telegram-bot'],
};

const EMOJIS: Record<IssueType, string> = {
  bug: '🐛',
  feature: '✨',
  issue: '📋',
};

async function handleIssueCommand(
  config: ReturnType<typeof getConfig>,
  chatId: number,
  type: IssueType,
  description: string,
  userName: string,
): Promise<string> {
  if (!description.trim()) {
    return `Please provide a description. Usage: /${type} <description>`;
  }

  try {
    const title = `[${type.toUpperCase()}] ${description.slice(0, 80)}${description.length > 80 ? '...' : ''}`;
    const body = [
      `## ${EMOJIS[type]} ${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
      '',
      `**Description:** ${description}`,
      '',
      `**Reported by:** ${userName} (via Telegram)`,
      `**Date:** ${new Date().toISOString()}`,
      '',
      '---',
      '*Created automatically by QuickFinance Telegram Bot*',
    ].join('\n');

    const issue = await createGitHubIssue(
      config.githubToken,
      config.githubRepo,
      title,
      body,
      LABELS[type],
    );

    return `${EMOJIS[type]} Issue #${issue.number} created!\n\n${issue.html_url}`;
  } catch (err) {
    console.error(`Failed to create issue:`, err);
    return `❌ Failed to create issue. Please try again later.`;
  }
}

// --- Code Push Handler ---
async function handlePushCommand(
  config: ReturnType<typeof getConfig>,
  chatId: number,
  mode: 'push' | 'pr' | 'validate',
  message: string,
): Promise<string> {
  if (!config.projectDir) {
    return '❌ PROJECT_DIR not set. Cannot run push commands without a project path.';
  }

  if (mode !== 'validate' && !message.trim()) {
    return `Please provide a commit message. Usage: /${mode} <message>`;
  }

  try {
    // Invoke the code-push agent as a subprocess
    const args = mode === 'validate' ? 'validate' : `${mode} ${message}`;
    const env = {
      ...process.env,
      GITHUB_TOKEN: config.githubToken,
      GITHUB_REPO: config.githubRepo,
      PROJECT_DIR: config.projectDir,
      TELEGRAM_BOT_TOKEN: config.token,
      TELEGRAM_CHAT_ID: String(chatId),
    };

    // Run async — don't block the bot's polling loop
    const pushScript = 'npx tsx agents/code-push/src/pusher.ts';
    const child = execSync(`${pushScript} ${args}`, {
      cwd: config.projectDir,
      encoding: 'utf-8',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 600000, // 10 min timeout for full pipeline
    });

    // The pusher sends its own Telegram notification with full details,
    // but we also return a quick confirmation here
    const lastLine = child.trim().split('\n').pop() ?? '';
    if (lastLine.includes('Done') || lastLine.includes('✅')) {
      return `✅ ${mode === 'validate' ? 'Validation' : 'Push'} completed successfully!`;
    }
    return `📋 ${mode} finished.\n\n${lastLine}`;
  } catch (err: any) {
    const output = [err.stdout ?? '', err.stderr ?? ''].join('\n').trim();
    const preview = output.slice(-300);
    return `❌ ${mode} failed:\n\n\`${preview}\``;
  }
}

// --- Message Router ---
async function handleMessage(config: ReturnType<typeof getConfig>, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const userName = message.chat.first_name ?? 'Unknown';

  // Security: check allowed chat IDs
  if (config.allowedChatIds && !config.allowedChatIds.includes(chatId)) {
    await sendMessage(config.token, chatId, '⛔ Unauthorized. Your chat ID is not in the allowed list.');
    console.log(`Blocked message from unauthorized chat: ${chatId}`);
    return;
  }

  const text = message.text.trim();

  // Parse command
  if (text.startsWith('/bug ')) {
    const reply = await handleIssueCommand(config, chatId, 'bug', text.slice(5), userName);
    await sendMessage(config.token, chatId, reply);
  } else if (text.startsWith('/feature ')) {
    const reply = await handleIssueCommand(config, chatId, 'feature', text.slice(9), userName);
    await sendMessage(config.token, chatId, reply);
  } else if (text.startsWith('/issue ')) {
    const reply = await handleIssueCommand(config, chatId, 'issue', text.slice(7), userName);
    await sendMessage(config.token, chatId, reply);
  } else if (text.startsWith('/push ')) {
    await sendMessage(config.token, chatId, '📤 Starting push pipeline...');
    const reply = await handlePushCommand(config, chatId, 'push', text.slice(6));
    await sendMessage(config.token, chatId, reply);
  } else if (text.startsWith('/pr ')) {
    await sendMessage(config.token, chatId, '🔀 Starting PR pipeline...');
    const reply = await handlePushCommand(config, chatId, 'pr', text.slice(4));
    await sendMessage(config.token, chatId, reply);
  } else if (text === '/validate') {
    await sendMessage(config.token, chatId, '🔍 Running validation...');
    const reply = await handlePushCommand(config, chatId, 'validate', '');
    await sendMessage(config.token, chatId, reply);
  } else if (text === '/status') {
    const hasPush = config.projectDir ? '✅' : '❌';
    const reply = [
      '✅ *QuickFinance Bot* is running',
      '',
      `📡 Repo: \`${config.githubRepo}\``,
      `${hasPush} Push agent: ${config.projectDir ? 'configured' : 'not configured (set PROJECT\\_DIR)'}`,
      `⏰ Uptime: ${formatUptime(process.uptime())}`,
      '',
      '*Issue Commands:*',
      '/bug <desc> — Report a bug',
      '/feature <desc> — Request a feature',
      '/issue <desc> — General issue',
      '',
      '*Code Push Commands:*',
      '/push <msg> — Validate + commit + push',
      '/pr <msg> — Validate + commit + create PR',
      '/validate — Run checks only',
      '',
      '/status — This message',
    ].join('\n');
    await sendMessage(config.token, chatId, reply);
  } else if (text.startsWith('/')) {
    await sendMessage(config.token, chatId,
      '🤔 Unknown command. Try /push, /pr, /validate, /bug, /feature, /issue, or /status');
  }
  // Ignore non-command messages
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// --- Main Loop ---
async function main(): Promise<void> {
  const config = getConfig();
  let offset = 0;

  console.log('🤖 QuickFinance Telegram Bot started');
  console.log(`📡 Connected to repo: ${config.githubRepo}`);
  if (config.allowedChatIds) {
    console.log(`🔒 Restricted to chat IDs: ${config.allowedChatIds.join(', ')}`);
  }

  // Polling loop
  while (true) {
    try {
      const updates = await getUpdates(config.token, offset);

      for (const update of updates) {
        await handleMessage(config, update);
        offset = update.update_id + 1;
      }
    } catch (err) {
      console.error('Polling error:', err);
      // Wait 5s before retry
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main().catch(console.error);
