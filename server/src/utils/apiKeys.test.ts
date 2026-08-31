import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKeyToken, hashToken, isAllowedOwnerEmail } from './apiKeys.js';

describe('generateApiKeyToken', () => {
  it('returns "ssk_" followed by exactly 64 hex characters', () => {
    const token = generateApiKeyToken();
    assert.match(token, /^ssk_[0-9a-f]{64}$/);
  });

  it('produces different values on successive calls', () => {
    assert.notEqual(generateApiKeyToken(), generateApiKeyToken());
  });
});

describe('hashToken', () => {
  it('is deterministic and produces a 64-character hex string', () => {
    const hash = hashToken('some-token-value');
    assert.equal(hash, hashToken('some-token-value'));
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different inputs', () => {
    assert.notEqual(hashToken('token-a'), hashToken('token-b'));
  });
});

describe('isAllowedOwnerEmail', () => {
  it('returns true for @a8c.com and @automattic.com addresses', () => {
    assert.equal(isAllowedOwnerEmail('someone@a8c.com'), true);
    assert.equal(isAllowedOwnerEmail('someone@automattic.com'), true);
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    assert.equal(isAllowedOwnerEmail('Someone@A8C.COM'), true);
    assert.equal(isAllowedOwnerEmail('  someone@automattic.com  '), true);
  });

  it('rejects a lookalike domain', () => {
    assert.equal(isAllowedOwnerEmail('someone@a8c.com.evil.example'), false);
  });

  it('rejects a subdomain', () => {
    assert.equal(isAllowedOwnerEmail('someone@sub.a8c.com'), false);
  });

  it('rejects a missing "@" and an empty string', () => {
    assert.equal(isAllowedOwnerEmail('a8c.com'), false);
    assert.equal(isAllowedOwnerEmail(''), false);
  });

  it('rejects an address with more than one "@" even if it ends with an allowed domain', () => {
    assert.equal(isAllowedOwnerEmail('attacker@evil.com@a8c.com'), false);
  });

  it('rejects an address longer than 254 characters', () => {
    const longLocalPart = 'a'.repeat(250);
    assert.equal(isAllowedOwnerEmail(`${longLocalPart}@a8c.com`), false);
  });
});
