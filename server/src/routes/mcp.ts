/**
 * MCP HTTP route — mounts the MCP server at POST/GET /mcp.
 *
 * Uses Streamable HTTP transport in stateless mode (no persistent session):
 * a new McpServer + transport are created for each request, which keeps the
 * implementation simple and works well for read-only data tools.
 *
 * Glean and other HTTP-based AI clients should POST JSON-RPC messages to /mcp.
 * SSE streaming (long-lived connections) is also supported via GET /mcp.
 */
import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../mcp/server';

const router = Router();

// Handle both POST (JSON-RPC call) and GET (SSE stream) on the same path.
// The StreamableHTTPServerTransport.handleRequest() inspects req.method internally.
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

export default router;
