// Small in-memory sliding-window rate limiter, generalized from the pattern
// in routes/chat.ts. Not distributed — fine for this app's single-instance
// VIP deploy, same tradeoff already accepted by the chat rate limiter.
export function createRateLimiter(max: number, windowMs: number): (key: string) => boolean {
  const hits = new Map<string, number[]>();

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
