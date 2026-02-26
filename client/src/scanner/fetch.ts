/**
 * Timeout-protected fetch with automatic CORS proxy fallback.
 * Adapted from wp-analyze/assets/js/client-scanner.js WebsiteScanner.fetchWithTimeout()
 */

const PROXY_URL = '/api/v1/proxy';
const DEFAULT_TIMEOUT_MS = 30000;
const USER_AGENT = 'GSA-Site-Scanner-Analyzer/1.0';

export interface ProxyResponse {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  redirected: boolean;
  location: string | null;
}

/**
 * Synthesize a Response-like object from proxy response data
 */
function proxyToResponse(data: ProxyResponse): Response {
  const headersInit: Record<string, string> = {};
  for (const [k, v] of Object.entries(data.headers || {})) {
    headersInit[k.toLowerCase()] = v;
  }
  const headers = new Headers(headersInit);

  // Store location for redirect detection
  if (data.location) headers.set('location', data.location);

  return new Response(data.body || '', {
    status: data.status,
    headers,
  });
}

/**
 * Fetch a URL via the server-side CORS proxy
 */
export async function fetchViaProxy(url: string, method = 'GET'): Promise<Response> {
  const proxyRes = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method }),
  });

  if (!proxyRes.ok) {
    throw new Error(`Proxy error: HTTP ${proxyRes.status}`);
  }

  const data = await proxyRes.json() as ProxyResponse;
  if (!data.success) {
    throw new Error(`Proxy failed: ${(data as any).error || 'unknown error'}`);
  }

  return proxyToResponse(data);
}

/**
 * Fetch with timeout + automatic CORS proxy fallback.
 * Direct fetch is tried first; on CORS/network failure the proxy is used.
 */
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
    });
    clearTimeout(timer);
    return response;
  } catch (err: any) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      throw new Error('Request timeout');
    }

    // CORS / network error → try proxy
    const msg = err.message || '';
    if (
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('CORS') ||
      msg.includes('Network') ||
      msg.includes('fetch')
    ) {
      return fetchViaProxy(url, (fetchOptions.method as string) || 'GET');
    }

    throw err;
  }
}
