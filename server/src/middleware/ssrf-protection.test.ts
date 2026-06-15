import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateUrlForSsrf } from './ssrf-protection.js';

// All tests use raw IP addresses or hostnames that resolve without network I/O,
// so the suite is safe to run offline and in CI.

describe('validateUrlForSsrf — bad inputs', () => {
  it('rejects an unparseable URL string', async () => {
    assert.notEqual(await validateUrlForSsrf('not-a-url'), null);
  });

  it('rejects ftp:// protocol', async () => {
    const err = await validateUrlForSsrf('ftp://example.com/file');
    assert.ok(err !== null && err.includes('HTTP'));
  });

  it('rejects file:// protocol', async () => {
    assert.notEqual(await validateUrlForSsrf('file:///etc/passwd'), null);
  });
});

describe('validateUrlForSsrf — blocked hostnames (no DNS needed)', () => {
  it('blocks localhost', async () => {
    const err = await validateUrlForSsrf('http://localhost/api');
    assert.ok(err !== null && err.toLowerCase().includes('blocked'));
  });

  it('blocks metadata.google.internal', async () => {
    const err = await validateUrlForSsrf('http://metadata.google.internal/');
    assert.ok(err !== null && err.toLowerCase().includes('blocked'));
  });

  it('blocks 169.254.169.254 (listed in hostname blocklist)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://169.254.169.254/latest/meta-data/'), null);
  });
});

describe('validateUrlForSsrf — private IPv4 CIDR ranges', () => {
  it('blocks 127.0.0.1 (loopback /8)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://127.0.0.1/'), null);
  });

  it('blocks 127.0.0.2 (also in loopback /8)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://127.0.0.2/'), null);
  });

  it('blocks 10.0.0.1 (RFC 1918 /8)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://10.0.0.1/'), null);
  });

  it('blocks 10.255.255.255 (RFC 1918 /8 boundary)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://10.255.255.255/'), null);
  });

  it('blocks 172.16.0.1 (RFC 1918 /12)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://172.16.0.1/'), null);
  });

  it('blocks 172.31.255.255 (RFC 1918 /12 boundary)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://172.31.255.255/'), null);
  });

  it('blocks 192.168.1.1 (RFC 1918 /16)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://192.168.1.1/'), null);
  });

  it('blocks 100.64.0.1 (carrier-grade NAT /10)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://100.64.0.1/'), null);
  });

  it('blocks 169.254.0.1 (link-local /16, not in hostname blocklist)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://169.254.0.1/'), null);
  });

  it('does not block 172.15.255.255 (just outside RFC 1918 /12)', async () => {
    assert.equal(await validateUrlForSsrf('http://172.15.255.255/'), null);
  });

  it('does not block 172.32.0.0 (just outside RFC 1918 /12)', async () => {
    assert.equal(await validateUrlForSsrf('http://172.32.0.0/'), null);
  });
});

describe('validateUrlForSsrf — private IPv6 ranges', () => {
  it('blocks ::1 (loopback)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://[::1]/'), null);
  });

  it('blocks fc00::1 (ULA /7)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://[fc00::1]/'), null);
  });

  it('blocks fe80::1 (link-local /10)', async () => {
    assert.notEqual(await validateUrlForSsrf('http://[fe80::1]/'), null);
  });
});

describe('validateUrlForSsrf — allowed addresses', () => {
  it('allows public IPv4 1.1.1.1', async () => {
    assert.equal(await validateUrlForSsrf('http://1.1.1.1/'), null);
  });

  it('allows public IPv4 8.8.8.8 over https', async () => {
    assert.equal(await validateUrlForSsrf('https://8.8.8.8/'), null);
  });
});
