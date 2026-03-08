/**
 * MCP HTTP routes — two transports on the same router:
 *
 *   POST/GET /mcp          — Streamable HTTP (MCP spec 2025-03-26, stateless)
 *   GET      /mcp/sse      — SSE transport   (MCP spec 2024-11-05, session-based)
 *   POST     /mcp/messages — SSE message channel (paired with /mcp/sse)
 *
 * Streamable HTTP is the current standard and works with Claude Desktop and
 * most modern MCP clients. The SSE endpoints provide backwards-compatible
 * access for clients (e.g. Glean) that send a plain GET without
 * Accept: text/event-stream and expect the older two-endpoint SSE protocol.
 *
 * Both transports share the same createMcpServer() factory, so all 8 tools
 * are available on either endpoint — no duplication.
 */
import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from '../mcp/server';

const router = Router();

// ---------------------------------------------------------------------------
// Streamable HTTP transport  (POST /mcp  +  GET /mcp)
// ---------------------------------------------------------------------------

async function handleMcp(req: Request, res: Response): Promise<void> {
  try {
    // Stateless mode: sessionIdGenerator: undefined disables session management.
    // Each request creates its own server + transport, which is released when done.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error('[mcp] Request error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed' });
    }
  }
}

router.post('/', handleMcp);
router.get('/',  handleMcp);

// ---------------------------------------------------------------------------
// SSE transport  (GET /mcp/sse  +  POST /mcp/messages)
// ---------------------------------------------------------------------------
// Keeps a map of active SSE sessions so POST /mcp/messages can route each
// incoming JSON-RPC message to the correct long-lived SSE connection.

const sseTransports = new Map<string, SSEServerTransport>();

// GET /mcp/sse — client opens a long-lived SSE connection.
// The transport immediately sends an `endpoint` event telling the client
// which URL to POST messages to (/mcp/messages?sessionId=<id>).
router.get('/sse', async (req: Request, res: Response): Promise<void> => {
  try {
    const transport = new SSEServerTransport('/mcp/messages', res);
    const server = createMcpServer();
    await server.connect(transport);
    sseTransports.set(transport.sessionId, transport);
    req.on('close', () => sseTransports.delete(transport.sessionId));
  } catch (err: any) {
    console.error('[mcp/sse] Connection error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'SSE connection failed' });
    }
  }
});

// POST /mcp/messages — client sends JSON-RPC requests here during an SSE session.
router.post('/messages', async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: `No active SSE session: ${sessionId}` });
    return;
  }
  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err: any) {
    console.error('[mcp/messages] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Message handling failed' });
    }
  }
});

export default router;
