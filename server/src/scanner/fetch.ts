/**
 * Server-side fetch wrapper — no CORS constraints, no proxy fallback.
 * Uses Node's built-in fetch (available in Node 18+).
 */

const DEFAULT_TIMEOUT_MS = 30000;
const USER_AGENT = 'GSA-Site-Scanner-Analyzer/1.0';

// ProxyResponse is not used server-side but exported for interface compatibility
export interface ProxyResponse {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  redirected: boolean;
  location: string | null;
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...(fetchOptions.headers as Record<string, string> ?? {}),
      },
    });
    clearTimeout(timer);
    return response;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  }
}

// Server-side has no CORS constraints — proxy just does a direct fetch
export async function fetchViaProxy(url: string, method = 'GET'): Promise<Response> {
  return fetchWithTimeout(url, { method });
}
