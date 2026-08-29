import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseIpList } from './config.js';

describe('parseIpList', () => {
  it('parses a comma-separated list, trimming whitespace', () => {
    assert.deepEqual(parseIpList('1.2.3.4, 5.6.7.8'), ['1.2.3.4', '5.6.7.8']);
  });

  it('drops empty entries from trailing commas or blank segments', () => {
    assert.deepEqual(parseIpList('1.2.3.4, 5.6.7.8,'), ['1.2.3.4', '5.6.7.8']);
    assert.deepEqual(parseIpList('1.2.3.4,, 5.6.7.8'), ['1.2.3.4', '5.6.7.8']);
  });

  it('returns an empty array for undefined or an empty string', () => {
    assert.deepEqual(parseIpList(undefined), []);
    assert.deepEqual(parseIpList(''), []);
  });
});
