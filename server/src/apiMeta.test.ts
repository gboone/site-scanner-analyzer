import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaFor } from './apiMeta';
import { API_REGISTRY } from './apiRegistry';

test('metaFor returns self matching the registry entry and related entries matching their configured keys', () => {
  const meta = metaFor('report.get');
  const entry = API_REGISTRY['report.get'];

  assert.deepEqual(meta.self, { method: entry.method, path: entry.path, description: entry.description });

  const expectedRelated = (entry.related ?? []).map((key) => {
    const related = API_REGISTRY[key];
    return { method: related.method, path: related.path, description: related.description };
  });
  assert.deepEqual(meta.related, expectedRelated);
  assert.ok(meta.related.length > 0, 'report.get should have at least one related route');
});

test('a key with no related list returns an empty related array, not a throw', () => {
  const meta = metaFor('sites.update');
  assert.deepEqual(meta.related, []);
  assert.equal(meta.self.path, '/api/v1/sites/:domain');
});
