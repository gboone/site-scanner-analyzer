import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isValidToken, isValidKeyRow, apiTokenGate, mcpAuthGate } from './apiToken.js';
import { config } from '../config.js';

describe('isValidKeyRow', () => {
  it('returns true only for a found, non-revoked row', () => {
    assert.equal(isValidKeyRow({ revoked_at: null }), true);
  });

  it('returns false for a revoked row', () => {
    assert.equal(isValidKeyRow({ revoked_at: '2026-01-01T00:00:00Z' }), false);
  });

  it('returns false when no row was found', () => {
    assert.equal(isValidKeyRow(undefined), false);
  });
});

describe('isValidToken', () => {
  it('returns true for the correct token, false for an incorrect one, false for missing', () => {
    assert.equal(isValidToken('secret', 'secret'), true);
    assert.equal(isValidToken('wrong', 'secret'), false);
    assert.equal(isValidToken(undefined, 'secret'), false);
  });

  it('returns false (never throws) when expected is set but provided is a different length', () => {
    assert.doesNotThrow(() => isValidToken('short', 'a-much-longer-expected-token'));
    assert.equal(isValidToken('short', 'a-much-longer-expected-token'), false);
  });

  it('returns false for any input, including an empty string, when expected is unset/empty', () => {
    assert.equal(isValidToken('', ''), false);
    assert.equal(isValidToken('anything', ''), false);
    assert.equal(isValidToken(undefined, ''), false);
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

// path defaults to '/sites' -- apiTokenGate is mounted via app.use('/api/v1', apiTokenGate),
// so req.path here is mount-relative (Express strips '/api/v1'), matching a real request
// to /api/v1/sites. Pass path explicitly to simulate a different route, e.g. '/health'.
//
// method defaults to 'POST' (not the more "realistic" 'GET') deliberately: every legacy
// test below exercises SCANNER_API_TOKEN/rate-limit/dual-path logic, none of it scoped to
// route or method, and this default keeps them out of the new per-user-key DB-lookup
// branch (isInPerUserKeyScope requires method === 'GET'), which needs a live database this
// test suite doesn't provision (see apiToken.ts's Research Findings / the plan this shipped
// from). Tests that specifically exercise per-user-key route scoping pass method: 'GET'.
function mockReq(ip: string, authorization?: string, path: string = '/sites', method: string = 'POST') {
  return {
    path,
    method,
    headers: { 'x-vip-ip': ip, ...(authorization ? { authorization } : {}) },
    socket: { remoteAddress: ip },
  } as any;
}

describe('apiTokenGate', () => {
  const prevNodeEnv = process.env.NODE_ENV;

  it('401s with no Authorization header, for an IP not in ALLOWED_IPS/AUTOMATTIC_NETWORK_CIDRS', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.1');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'invalid_token' });
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s with a well-formed but wrong bearer token, same disallowed IP', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.2', 'Bearer wrong-token');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() with the correct token, from an arbitrary/non-allowed IP', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.3', 'Bearer correct-token');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() with the correct token on a GET request, regardless of per-user-key route scope', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.20', 'Bearer correct-token', '/settings', 'GET');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('429s once the rate limit is exceeded, whether the token is valid or wrong on every call', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';

    for (const [ip, authorization] of [
      ['198.51.100.4', 'Bearer correct-token'],
      ['198.51.100.5', 'Bearer wrong-token'],
    ] as const) {
      let last429 = false;
      for (let i = 0; i < 61; i++) {
        const req = mockReq(ip, authorization);
        const res = mockRes();
        const next = mock.fn();
        await apiTokenGate(req, res as any, next);
        last429 = res.statusCode === 429;
      }
      assert.equal(last429, true, `expected 429 after exceeding the limit for ${ip}`);
    }
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() immediately with no Authorization header when the IP is in ALLOWED_IPS', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = ['198.51.100.6'];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.6');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    config.allowedIps = [];
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('never returns 429 for an allowed IP with no token, even past what would be the rate-limit threshold', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = ['198.51.100.7'];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    let any429 = false;
    for (let i = 0; i < 65; i++) {
      const req = mockReq('198.51.100.7');
      const res = mockRes();
      const next = mock.fn();
      await apiTokenGate(req, res as any, next);
      if (res.statusCode === 429) any429 = true;
    }
    assert.equal(any429, false);
    config.allowedIps = [];
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() unconditionally when NODE_ENV !== production, regardless of IP or Authorization', async () => {
    process.env.NODE_ENV = 'development';
    config.scannerApiToken = '';
    const req = mockReq('198.51.100.8');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() unconditionally for /api/v1/health (legacy liveness check), with no token and a disallowed IP', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.9', undefined, '/health');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    assert.equal(res.statusCode, 200);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s with an empty SCANNER_API_TOKEN in production, for a disallowed IP with no Authorization header', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = '';
    const req = mockReq('198.51.100.10');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('still 429s a correct token once a wrong-token guessing streak has exhausted the rate limit for that IP', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const ip = '198.51.100.11';
    for (let i = 0; i < 60; i++) {
      const req = mockReq(ip, 'Bearer wrong-token');
      await apiTokenGate(req, mockRes() as any, mock.fn());
    }
    const req = mockReq(ip, 'Bearer correct-token');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 429);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  // Per-user-key route scoping (U3) — these never reach the DB, since
  // isInPerUserKeyScope short-circuits before any await when the request is
  // out of scope, so they're fully automated with no live database needed.
  // The "a valid/revoked key does/doesn't admit" and "a DB error fails
  // closed" scenarios require a live api_keys row and are manual/integration
  // scenarios only (see the plan this shipped from).
  it('401s a GET /settings request even with a well-formed bearer token (excluded from per-user-key scope)', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.12', 'Bearer some-per-user-key', '/settings', 'GET');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s a GET /api-keys request even with a well-formed bearer token (excluded from per-user-key scope)', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.13', 'Bearer some-per-user-key', '/api-keys', 'GET');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s a differently-cased /SETTINGS or /Api-Keys request even with a well-formed bearer token (regression: Express routes case-insensitively, so the scope check must too)', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    for (const path of ['/SETTINGS', '/Api-Keys']) {
      const req = mockReq('198.51.100.15', 'Bearer some-per-user-key', path, 'GET');
      const res = mockRes();
      const next = mock.fn();
      await apiTokenGate(req, res as any, next);
      assert.equal(res.statusCode, 401, `expected 401 for ${path}`);
      assert.equal(next.mock.calls.length, 0, `expected no next() for ${path}`);
    }
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s a non-GET request (e.g. POST /query) even with a well-formed bearer token (excluded from per-user-key scope)', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.14', 'Bearer some-per-user-key', '/query', 'POST');
    const res = mockRes();
    const next = mock.fn();
    await apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });
});

describe('mcpAuthGate', () => {
  const prevNodeEnv = process.env.NODE_ENV;

  it('401s with no Authorization header', async () => {
    process.env.NODE_ENV = 'production';
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.30', undefined, '/', 'POST');
    const res = mockRes();
    const next = mock.fn();
    await mcpAuthGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s with a well-formed but wrong bearer token', async () => {
    process.env.NODE_ENV = 'production';
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.31', 'Bearer wrong-token', '/', 'POST');
    const res = mockRes();
    const next = mock.fn();
    await mcpAuthGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() with the correct SCANNER_API_TOKEN', async () => {
    process.env.NODE_ENV = 'production';
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.32', 'Bearer correct-token', '/', 'POST');
    const res = mockRes();
    const next = mock.fn();
    await mcpAuthGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s even from an IP in ALLOWED_IPS with no token — unlike apiTokenGate, there is no IP-allow dual path', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = ['198.51.100.33'];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.33', undefined, '/', 'POST');
    const res = mockRes();
    const next = mock.fn();
    await mcpAuthGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    config.allowedIps = [];
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('429s once the rate limit is exceeded for that IP', async () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const ip = '198.51.100.34';
    let last429 = false;
    for (let i = 0; i < 61; i++) {
      const req = mockReq(ip, 'Bearer wrong-token', '/', 'POST');
      const res = mockRes();
      const next = mock.fn();
      await mcpAuthGate(req, res as any, next);
      last429 = res.statusCode === 429;
    }
    assert.equal(last429, true);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() unconditionally when NODE_ENV !== production, regardless of Authorization', async () => {
    process.env.NODE_ENV = 'development';
    config.scannerApiToken = '';
    const req = mockReq('198.51.100.35', undefined, '/', 'POST');
    const res = mockRes();
    const next = mock.fn();
    await mcpAuthGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });
});
