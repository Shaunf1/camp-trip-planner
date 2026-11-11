// The chat runs on the user's own Claude login: it calls the locally signed-in Claude Code CLI
// (`claude -p`) with a JSON schema, so no API key is needed or read.
import { spawn } from 'node:child_process';
import os from 'node:os';
import { CHAT_SYSTEM_PROMPT, PLAN_SCHEMA } from './chat-schema';

export const CLAUDE_MODEL = 'claude-sonnet-5-5';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

function run(args: string[], input: string | null, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    // never let an API key in the environment take over from the login
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const child = spawn(CLAUDE_BIN, args, { cwd: os.tmpdir(), env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

let statusCache: { at: number; value: ChatStatus } | null = null;
export interface ChatStatus {
  configured: boolean;
  model: string;
  reason?: string;
}

export async function claudeStatus(): Promise<ChatStatus> {
  if (statusCache && Date.now() - statusCache.at < 30000) return statusCache.value;
  let value: ChatStatus;
  try {
    const r = await run(['auth', 'status', '--json'], null, 20000);
    const s = JSON.parse(r.stdout || '{}');
    value = s.loggedIn
      ? { configured: true, model: CLAUDE_MODEL }
      : { configured: false, model: CLAUDE_MODEL, reason: 'not-signed-in' };
  } catch (e: any) {
    value = { configured: false, model: CLAUDE_MODEL, reason: e?.code === 'ENOENT' ? 'no-cli' : 'not-signed-in' };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

export async function claudePlanChange(messages: { role: string; content: string }[], plan: unknown) {
  const history = messages.slice(-16);
  const last = history[history.length - 1];
  const earlier = history.slice(0, -1).map((m) => `${m.role === 'user' ? 'Traveller' : 'You'}: ${m.content}`);
  const prompt = [
    earlier.length ? `Conversation so far:\n${earlier.join('\n')}\n` : '',
    `Current plan (JSON):\n${JSON.stringify(plan)}\n`,
    `Traveller's request: ${last.content}`,
  ].join('\n');
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', CLAUDE_MODEL,
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--no-session-persistence',
    '--system-prompt', CHAT_SYSTEM_PROMPT,
    '--json-schema', JSON.stringify(PLAN_SCHEMA),
  ];
  const r = await run(args, prompt, 180000);
  let out: any;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Claude Code didn't answer (${(r.stderr || r.stdout).trim().slice(0, 200) || `exit ${r.code}`})`);
  }
  if (out.is_error) {
    statusCache = null;
    throw new Error(`Claude Code: ${String(out.result || out.subtype).slice(0, 300)}`);
  }
  const s = out.structured_output ?? safeJson(out.result);
  if (!s) throw new Error('Claude did not return a plan change');
  return { reply: String(s.reply || ''), operations: Array.isArray(s.operations) ? s.operations : [] };
}

function safeJson(t: unknown) {
  try {
    return typeof t === 'string' ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
