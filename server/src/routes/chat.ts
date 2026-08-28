import { Router, Request, Response } from 'express';
import { chat, listModels, type ChatMessage, type ChatContext } from '../services/claude-chat';

export const chatRouter = Router();
export const modelsRouter = Router();

// Simple in-memory rate limiter: max 20 chat turns per IP per 5 minutes.
const chatRateLimit = new Map<string, number[]>();
const CHAT_RATE_LIMIT = 20;
const CHAT_RATE_WINDOW_MS = 5 * 60 * 1000;

function allowChat(ip: string): boolean {
  const now = Date.now();
  const hits = (chatRateLimit.get(ip) ?? []).filter((t) => now - t < CHAT_RATE_WINDOW_MS);
  if (hits.length >= CHAT_RATE_LIMIT) return false;
  hits.push(now);
  chatRateLimit.set(ip, hits);
  return true;
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m) =>
        m && typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
  );
}

// POST /api/v1/chat — body { messages: [{ role, content }] }
chatRouter.post('/', async (req: Request, res: Response) => {
  const ip = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  if (!allowChat(ip)) {
    res.status(429).json({ error: 'Too many chat requests. Please wait a few minutes.' });
    return;
  }

  const { messages, context } = req.body as { messages?: unknown; context?: unknown };
  if (!isValidMessages(messages)) {
    res.status(400).json({ error: 'messages must be a non-empty array of { role, content }' });
    return;
  }

  // context is optional and best-effort; the service sanitizes everything it embeds.
  const safeContext: ChatContext | undefined =
    context && typeof context === 'object' && !Array.isArray(context) ? (context as ChatContext) : undefined;

  try {
    const result = await chat(messages, safeContext);
    res.json(result);
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 500) console.error('[chat] error:', err?.message ?? err);
    res.status(status).json({ error: err?.message ?? 'Chat failed' });
  }
});

// GET /api/v1/models — models the configured key can access
modelsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await listModels());
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({ error: err?.message ?? 'Failed to list models' });
  }
});
