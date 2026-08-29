import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from './rateLimit.js';

describe('createRateLimiter', () => {
  it('allows the first N calls for a key within the window and rejects the next one', () => {
    const limiter = createRateLimiter(2, 60_000);
    assert.equal(limiter('k'), true);
    assert.equal(limiter('k'), true);
    assert.equal(limiter('k'), false);
  });

  it('tracks separate keys independently', () => {
    const limiter = createRateLimiter(1, 60_000);
    assert.equal(limiter('a'), true);
    assert.equal(limiter('b'), true);
    assert.equal(limiter('a'), false);
  });

  it('allows a call again after the window has elapsed', () => {
    const now = mock.method(Date, 'now', () => 0);
    const limiter = createRateLimiter(1, 1000);
    assert.equal(limiter('k'), true);
    assert.equal(limiter('k'), false);
    now.mock.mockImplementation(() => 2000);
    assert.equal(limiter('k'), true);
    now.mock.restore();
  });
});
