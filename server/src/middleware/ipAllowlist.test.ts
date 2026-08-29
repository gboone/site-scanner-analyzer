import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isIpAllowed, ipAllowlistGate, getClientIp } from './ipAllowlist.js';

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

  it('calls next() unconditionally for a path starting with /api/v1 or /agent, regardless of IP or NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    for (const path of ['/api/v1/sites', '/agent/sites']) {
      const req = { path, headers: {}, socket: { remoteAddress: '9.9.9.9' } } as any;
      const res = mockRes();
      const next = mock.fn();
      ipAllowlistGate(req, res as any, next);
      assert.equal(next.mock.calls.length, 1, `expected next() for ${path}`);
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
