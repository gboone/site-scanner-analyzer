import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isIpAllowed, ipAllowlistGate, getClientIp, findMalformedEntries, isUnderPath } from './ipAllowlist.js';
import { config } from '../config.js';

describe('isUnderPath', () => {
  it('matches an exact prefix and a prefix followed by a sub-path', () => {
    assert.equal(isUnderPath('/settings', '/settings'), true);
    assert.equal(isUnderPath('/settings/foo', '/settings'), true);
  });

  it('does not match a different string merely sharing the prefix at a non-segment boundary', () => {
    assert.equal(isUnderPath('/settings-admin', '/settings'), false);
  });

  it('is case-insensitive, matching Express\'s own case-insensitive route resolution', () => {
    assert.equal(isUnderPath('/SETTINGS', '/settings'), true);
    assert.equal(isUnderPath('/Api-Keys/5', '/api-keys'), true);
    assert.equal(isUnderPath('/settings', '/SETTINGS'), true);
  });
});

describe('isIpAllowed', () => {
  it('returns true for an IP inside an allowedCidrs entry, false for one outside all entries', () => {
    assert.equal(isIpAllowed('10.0.0.5', ['10.0.0.0/24'], []), true);
    assert.equal(isIpAllowed('10.0.1.5', ['10.0.0.0/24'], []), false);
  });

  it('returns true for an IP inside an automatticCidrs entry even when absent from allowedCidrs', () => {
    assert.equal(isIpAllowed('192.0.2.5', ['10.0.0.0/24'], ['192.0.2.0/24']), true);
  });

  it('returns false when both lists are empty, for any IP', () => {
    assert.equal(isIpAllowed('8.8.8.8', [], []), false);
  });

  it('matches a bare IP entry (no CIDR suffix) as an exact address', () => {
    assert.equal(isIpAllowed('203.0.113.7', ['203.0.113.7'], []), true);
    assert.equal(isIpAllowed('203.0.113.8', ['203.0.113.7'], []), false);
  });

  it('does not match across IPv4/IPv6 families, and correctly matches within IPv6', () => {
    assert.equal(isIpAllowed('::1', ['10.0.0.0/8'], []), false);
    assert.equal(isIpAllowed('2001:db8::1', ['2001:db8::/32'], []), true);
    assert.equal(isIpAllowed('2001:db9::1', ['2001:db8::/32'], []), false);
  });
});

describe('findMalformedEntries', () => {
  it('returns entries that fail to parse as an IP or CIDR range', () => {
    assert.deepEqual(findMalformedEntries(['1.2.3.4', 'not-an-ip', '10.0.0.0/8', '10.0.0.0/999']), ['not-an-ip', '10.0.0.0/999']);
  });

  it('returns an empty array when every entry is valid', () => {
    assert.deepEqual(findMalformedEntries(['1.2.3.4', '10.0.0.0/8', '2001:db8::/32']), []);
  });
});

function mockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  return {
    set(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      statusCode = code;
      return {
        json(payload: unknown) {
          body = payload;
        },
      };
    },
    get headers() {
      return headers;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

describe('ipAllowlistGate', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAllowedIps = process.env.ALLOWED_IPS;

  it('responds 403 with Cache-Control for a disallowed IP in production', async () => {
    process.env.NODE_ENV = 'production';
    const req = { path: '/', headers: { 'x-vip-ip': '9.9.9.9' }, socket: { remoteAddress: '9.9.9.9' } } as any;
    const res = mockRes();
    const next = mock.fn();
    ipAllowlistGate(req, res as any, next);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'ip_not_allowed' });
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() for an allowed IP', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_IPS = '1.2.3.4';
    const { config } = await import('../config.js');
    config.allowedIps = ['1.2.3.4'];
    const req = { path: '/', headers: { 'x-vip-ip': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as any;
    const res = mockRes();
    const next = mock.fn();
    ipAllowlistGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    config.allowedIps = [];
    process.env.NODE_ENV = prevNodeEnv;
    process.env.ALLOWED_IPS = prevAllowedIps;
  });

  it('calls next() unconditionally when NODE_ENV !== production, regardless of IP', () => {
    process.env.NODE_ENV = 'development';
    const req = { path: '/', headers: {}, socket: { remoteAddress: '9.9.9.9' } } as any;
    const res = mockRes();
    const next = mock.fn();
    ipAllowlistGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() unconditionally for a path starting with /api/v1, /agent, or /mcp, regardless of IP or NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    for (const path of ['/api/v1', '/api/v1/sites', '/agent', '/agent/sites', '/mcp']) {
      const req = { path, headers: {}, socket: { remoteAddress: '9.9.9.9' } } as any;
      const res = mockRes();
      const next = mock.fn();
      ipAllowlistGate(req, res as any, next);
      assert.equal(next.mock.calls.length, 1, `expected next() for ${path}`);
    }
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('exempts a differently-cased /api/v1 path, matching Express\'s own case-insensitive routing', () => {
    process.env.NODE_ENV = 'production';
    const req = { path: '/API/v1/SITES', headers: {}, socket: { remoteAddress: '9.9.9.9' } } as any;
    const res = mockRes();
    const next = mock.fn();
    ipAllowlistGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('does NOT exempt a path merely sharing the /api/v1, /agent, or /mcp string prefix at a different segment boundary', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    for (const path of ['/api/v10/sites', '/agent-admin', '/mcp-admin']) {
      const req = { path, headers: { 'x-vip-ip': '9.9.9.9' }, socket: { remoteAddress: '9.9.9.9' } } as any;
      const res = mockRes();
      const next = mock.fn();
      ipAllowlistGate(req, res as any, next);
      assert.equal(res.statusCode, 403, `expected 403 (gated) for ${path}`);
      assert.equal(next.mock.calls.length, 0, `expected no next() for ${path}`);
    }
    process.env.NODE_ENV = prevNodeEnv;
  });
});

describe('getClientIp', () => {
  it('falls back to req.socket.remoteAddress when x-vip-ip is missing', () => {
    const req = { headers: {}, socket: { remoteAddress: '203.0.113.9' } } as any;
    assert.equal(getClientIp(req), '203.0.113.9');
  });

  it('prefers the x-vip-ip header when present', () => {
    const req = { headers: { 'x-vip-ip': '203.0.113.10' }, socket: { remoteAddress: '10.0.0.1' } } as any;
    assert.equal(getClientIp(req), '203.0.113.10');
  });
});
