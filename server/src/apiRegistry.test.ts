import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_REGISTRY, buildSchemaResponse, type RouteEntry, type RouteKey } from './apiRegistry';

const ENTRIES = Object.entries(API_REGISTRY) as [string, RouteEntry][];

test('every related key resolves to an existing registry key', () => {
  for (const [key, entry] of ENTRIES) {
    for (const relatedKey of entry.related ?? []) {
      assert.ok(
        relatedKey in API_REGISTRY,
        `"${key}" lists related key "${relatedKey}" which does not exist in API_REGISTRY`
      );
    }
  }
});

test('every entry has a non-empty method, path, and description', () => {
  for (const [key, entry] of ENTRIES) {
    assert.ok(entry.method, `"${key}" is missing method`);
    assert.ok(entry.path?.startsWith('/'), `"${key}" path should start with "/"`);
    assert.ok(entry.description?.trim().length, `"${key}" is missing a description`);
  }
});

test('no two entries share the same method + path', () => {
  const seen = new Map<string, string>();
  for (const [key, entry] of ENTRIES) {
    const routeKey = `${entry.method} ${entry.path}`;
    const existing = seen.get(routeKey);
    assert.ok(!existing, `"${routeKey}" is registered by both "${existing}" and "${key}"`);
    seen.set(routeKey, key);
  }
});

test('every entry with a related list has at least one entry in it', () => {
  for (const [key, entry] of ENTRIES) {
    if (entry.related) {
      assert.ok(entry.related.length > 0, `"${key}" has an empty related list — omit it or add entries`);
    }
  }
});

test('buildSchemaResponse still documents GET /healthz and GET /api/v1/report with full detail (Glean regression guard)', () => {
  const schema = buildSchemaResponse() as any;
  assert.ok(schema.endpoints['GET /healthz']);
  assert.equal(schema.endpoints['GET /healthz'].description, API_REGISTRY['health.healthz'].description);

  const report = schema.endpoints['GET /api/v1/report'];
  assert.ok(report, 'GET /api/v1/report missing from schema');
  assert.deepEqual(report.parameters, API_REGISTRY['report.get'].parameters);
  assert.deepEqual(report.responses, API_REGISTRY['report.get'].responses);
});

test('buildSchemaResponse covers every mounted route and excludes /agent and /cache-healthcheck', () => {
  const schema = buildSchemaResponse() as any;
  const routeKeys = Object.keys(schema.endpoints);
  assert.equal(routeKeys.length, Object.keys(API_REGISTRY).length);

  for (const key of Object.keys(API_REGISTRY) as RouteKey[]) {
    const entry = API_REGISTRY[key];
    assert.ok(routeKeys.includes(`${entry.method} ${entry.path}`), `schema is missing ${entry.method} ${entry.path}`);
  }

  assert.ok(!routeKeys.some((k) => k.includes('/agent')), 'schema should not include /agent routes');
  assert.ok(!routeKeys.some((k) => k.includes('/cache-healthcheck')), 'schema should not include /cache-healthcheck');

  // Spot checks
  assert.ok(routeKeys.includes('POST /api/v1/query'));
  assert.ok(routeKeys.includes('GET /api/v1/scheduler/status'));
});

test('buildSchemaResponse().info.version is a real semver read from package.json, not a stale literal', () => {
  const schema = buildSchemaResponse() as any;
  assert.match(schema.info.version, /^\d+\.\d+\.\d+/);
  assert.notEqual(schema.info.version, '0.0.0', 'version fell back to the read-failure default');
});
