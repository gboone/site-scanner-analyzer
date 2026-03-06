/**
 * MCP server factory.
 *
 * Creates a new McpServer instance with all tools registered.
 * Called once per HTTP request (stateless mode) or once for the stdio process.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'site-scanner',
    version: '1.0.0',
  });

  registerTools(server);

  return server;
}
