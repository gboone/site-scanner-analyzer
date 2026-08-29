import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isValidToken, apiTokenGate } from './apiToken.js';
import { config } from '../config.js';

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
function mockReq(ip: string, authorization?: string, path: string = '/sites') {
  return {
    path,
    headers: { 'x-vip-ip': ip, ...(authorization ? { authorization } : {}) },
    socket: { remoteAddress: ip },
  } as any;
}

describe('apiTokenGate', () => {
  const prevNodeEnv = process.env.NODE_ENV;

  it('401s with no Authorization header, for an IP not in ALLOWED_IPS/AUTOMATTIC_NETWORK_CIDRS', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.1');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'invalid_token' });
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s with a well-formed but wrong bearer token, same disallowed IP', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.2', 'Bearer wrong-token');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() with the correct token, from an arbitrary/non-allowed IP', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.3', 'Bearer correct-token');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('429s once the rate limit is exceeded, whether the token is valid or wrong on every call', () => {
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
        apiTokenGate(req, res as any, next);
        last429 = res.statusCode === 429;
      }
      assert.equal(last429, true, `expected 429 after exceeding the limit for ${ip}`);
    }
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() immediately with no Authorization header when the IP is in ALLOWED_IPS', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = ['198.51.100.6'];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.6');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    config.allowedIps = [];
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('never returns 429 for an allowed IP with no token, even past what would be the rate-limit threshold', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = ['198.51.100.7'];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    let any429 = false;
    for (let i = 0; i < 65; i++) {
      const req = mockReq('198.51.100.7');
      const res = mockRes();
      const next = mock.fn();
      apiTokenGate(req, res as any, next);
      if (res.statusCode === 429) any429 = true;
    }
    assert.equal(any429, false);
    config.allowedIps = [];
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() unconditionally when NODE_ENV !== production, regardless of IP or Authorization', () => {
    process.env.NODE_ENV = 'development';
    config.scannerApiToken = '';
    const req = mockReq('198.51.100.8');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('calls next() unconditionally for /api/v1/health (legacy liveness check), with no token and a disallowed IP', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const req = mockReq('198.51.100.9', undefined, '/health');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(next.mock.calls.length, 1);
    assert.equal(res.statusCode, 200);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('401s with an empty SCANNER_API_TOKEN in production, for a disallowed IP with no Authorization header', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = '';
    const req = mockReq('198.51.100.10');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('still 429s a correct token once a wrong-token guessing streak has exhausted the rate limit for that IP', () => {
    process.env.NODE_ENV = 'production';
    config.allowedIps = [];
    config.automatticNetworkCidrs = [];
    config.scannerApiToken = 'correct-token';
    const ip = '198.51.100.11';
    for (let i = 0; i < 60; i++) {
      const req = mockReq(ip, 'Bearer wrong-token');
      apiTokenGate(req, mockRes() as any, mock.fn());
    }
    const req = mockReq(ip, 'Bearer correct-token');
    const res = mockRes();
    const next = mock.fn();
    apiTokenGate(req, res as any, next);
    assert.equal(res.statusCode, 429);
    assert.equal(next.mock.calls.length, 0);
    process.env.NODE_ENV = prevNodeEnv;
  });
});
