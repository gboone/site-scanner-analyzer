import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_ONLY_CONDITION } from './publicFilter.js';

describe('PUBLIC_ONLY_CONDITION', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof PUBLIC_ONLY_CONDITION, 'string');
    assert.ok(PUBLIC_ONLY_CONDITION.length > 0);
  });

  // ── Core liveness conditions ──────────────────────────────────────────────

  it('requires live = 1', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes('live = 1'));
  });

  it('requires status_code 200 or null', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes('status_code = 200'));
  });

  it('excludes redirects', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes('redirect = 0 OR redirect IS NULL'));
  });

  // ── Non-production domain exclusions ──────────────────────────────────────

  it('excludes staging. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'staging.%'"));
  });

  it('excludes uat. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'uat.%'"));
  });

  it('excludes test. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'test.%'"));
  });

  it('excludes dev. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'dev.%'"));
  });

  it('excludes demo. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'demo.%'"));
  });

  it('excludes qa. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'qa.%'"));
  });

  it('excludes stg. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'stg.%'"));
  });

  it('excludes sit. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'sit.%'"));
  });

  it('excludes preprod. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'preprod.%'"));
  });

  it('excludes sandbox. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'sandbox.%'"));
  });

  it('excludes training. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'training.%'"));
  });

  it('excludes mid-domain .staging. pattern', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE '%.staging.%'"));
  });

  it('excludes hyphenated -staging. pattern', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE '%-staging.%'"));
  });

  // ── VPN domain exclusions ─────────────────────────────────────────────────

  it('excludes vpn. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'vpn.%'"));
  });

  it('excludes webvpn. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'webvpn.%'"));
  });

  it('excludes sslvpn. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'sslvpn.%'"));
  });

  it('excludes citrix. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'citrix.%'"));
  });

  it('excludes remote. prefix domains', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE 'remote.%'"));
  });

  it('excludes mid-domain .vpn. pattern', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE '%.vpn.%'"));
  });

  it('excludes hyphenated -vpn. pattern', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("domain NOT LIKE '%-vpn.%'"));
  });
});
