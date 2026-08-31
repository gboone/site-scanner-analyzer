/**
 * MCP (Model Context Protocol) endpoint — lets external MCP clients (e.g.
 * Claude Desktop) call the same read-only tools claude-chat.ts already
 * exposes to in-app Chat, over the standard MCP Streamable HTTP transport.
 *
 * Stateless by design: every request gets its own Server/transport pair
 * (sessionIdGenerator: undefined), since every tool call is a self-contained
 * REST call over loopback with no need for session state or SSE streaming.
 */
import { Router, Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, runTool } from '../services/claude-chat';

const SERVER_INFO = { name: 'site-scanner-analyzer', version: '1.0.0' };

/** Maps claude-chat.ts's Anthropic tool schemas to MCP's tool shape. Exported for testing. */
export function toMcpTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  }));
}

function buildServer(): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toMcpTools() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const text = await runTool(name, args ?? {});
    return { content: [{ type: 'text', text }] };
  });

  return server;
}

export const mcpRouter = Router();

mcpRouter.post('/', async (req: Request, res: Response) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error('[mcp] request error:', err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Stateless mode supports POST only — no server-initiated SSE stream (GET)
// or session teardown (DELETE) to serve, since there's no session to tear down.
mcpRouter.get('/', (_req, res) => {
  res.status(405).json({ error: 'method_not_allowed' });
});
mcpRouter.delete('/', (_req, res) => {
  res.status(405).json({ error: 'method_not_allowed' });
});
