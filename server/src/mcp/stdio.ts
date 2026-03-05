/**
 * Stdio entry point for the MCP server.
 *
 * Run this as a standalone process for Claude Desktop or other local MCP clients.
 *
 * Usage:
 *   node server/dist/mcp/stdio.js
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "site-scanner": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/server/dist/mcp/stdio.js"]
 *       }
 *     }
 *   }
 *
 * NOTE: Do NOT write to stdout in this process — it corrupts the JSON-RPC stream.
 *       Use console.error() for any debugging output.
 */
import '../config'; // Load env vars first
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server';

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp/stdio] Server running on stdin/stdout');
}

main().catch((err) => {
  console.error('[mcp/stdio] Fatal error:', err);
  process.exit(1);
});
