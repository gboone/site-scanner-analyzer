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

  // ── Title exclusions: authentication ─────────────────────────────────────

  it('excludes login titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%login%'"));
  });

  it('excludes access denied titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%access denied%'"));
  });

  it('excludes unauthorized titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%unauthorized%'"));
  });

  // ── Title exclusions: IT security banners ────────────────────────────────

  it('excludes IT security titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%it security%'"));
  });

  it('excludes authorized users only titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%authorized users only%'"));
  });

  it('excludes computer fraud titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%computer fraud%'"));
  });

  // ── Title exclusions: MAX.gov / OMB portals ───────────────────────────────

  it('excludes max.gov titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%max.gov%'"));
  });

  it('excludes max portal titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%max portal%'"));
  });

  it('excludes maxauth titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%maxauth%'"));
  });

  it('excludes omb max titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%omb max%'"));
  });

  // ── Title exclusions: git auth screens ───────────────────────────────────

  it('excludes gitlab titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%gitlab%'"));
  });

  it('excludes gitea titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%gitea%'"));
  });

  // ── Title exclusions: VPN product screens ────────────────────────────────

  it('excludes vpn titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%vpn%'"));
  });

  it('excludes anyconnect titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%anyconnect%'"));
  });

  it('excludes citrix titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%citrix%'"));
  });

  it('excludes globalprotect titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%globalprotect%'"));
  });

  it('excludes pulse secure titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%pulse secure%'"));
  });

  it('excludes remote access titles', () => {
    assert.ok(PUBLIC_ONLY_CONDITION.includes("title NOT LIKE '%remote access%'"));
  });
});
