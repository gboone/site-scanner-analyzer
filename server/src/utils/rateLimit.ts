// Small in-memory sliding-window rate limiter, generalized from the pattern
// in routes/chat.ts. Not distributed — fine for this app's single-instance
// VIP deploy, same tradeoff already accepted by the chat rate limiter.
//
// Keys here are attacker-influenced (the caller's reported IP), so a
// per-call check alone can't bound memory: a key that goes idle after its
// last request never gets touched again to be evicted. A periodic sweep
// drops any key with no timestamps left in the window, independent of
// whether that key is ever called again.
export function createRateLimiter(max: number, windowMs: number): (key: string) => boolean {
  const hits = new Map<string, number[]>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits) {
      if (!timestamps.some((t) => now - t < windowMs)) hits.delete(key);
    }
  }, windowMs);
  sweep.unref(); // don't keep the process alive just for this timer

  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
