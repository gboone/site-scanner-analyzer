import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMcpTools } from './server';
import { TOOLS } from '../services/claude-chat';

test('toMcpTools carries every claude-chat tool over with name, description, and inputSchema', () => {
  const mcpTools = toMcpTools();
  assert.equal(mcpTools.length, TOOLS.length);
  for (const [i, t] of TOOLS.entries()) {
    assert.equal(mcpTools[i].name, t.name);
    assert.equal(mcpTools[i].description, t.description);
    assert.deepEqual(mcpTools[i].inputSchema, t.input_schema);
  }
});

test('toMcpTools includes run_sql and list_sites alongside the structured tools', () => {
  const names = toMcpTools().map((t) => t.name);
  assert.deepEqual(
    [...names].sort(),
    ['get_agency_report', 'get_site', 'get_stats', 'list_sites', 'resolve_agency', 'run_sql'].sort()
  );
});
