import { fetchWithTimeout } from './fetch';
import type { RobotsResult } from 'shared';

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsResult> {
  const robotsUrl = `${baseUrl.replace(/\/$/, '')}/robots.txt`;

  let response: Response;
  try {
    response = await fetchWithTimeout(robotsUrl, { timeoutMs: 15000 });
  } catch (err: any) {
    return {
      detected: false,
      url: robotsUrl,
      status_code: 0,
      filesize: null,
      crawl_delay: null,
      sitemap_locations: null,
      error: err.message,
    };
  }

  if (!response.ok) {
    return {
      detected: false,
      url: robotsUrl,
      status_code: response.status,
      filesize: null,
      crawl_delay: null,
      sitemap_locations: null,
    };
  }

  const text = await response.text();
  const filesize = new Blob([text]).size;
  const lines = text.split('\n');

  let crawlDelay: number | null = null;
  const sitemapLocations: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^crawl-delay:\s*(\d+)/i.test(trimmed)) {
      const m = trimmed.match(/^crawl-delay:\s*(\d+)/i);
      if (m) crawlDelay = parseFloat(m[1]);
    }
    if (/^sitemap:\s*(.+)/i.test(trimmed)) {
      const m = trimmed.match(/^sitemap:\s*(.+)/i);
      if (m) sitemapLocations.push(m[1].trim());
    }
  }

  return {
    detected: true,
    url: robotsUrl,
    status_code: response.status,
    filesize,
    crawl_delay: crawlDelay,
    sitemap_locations: sitemapLocations.length > 0 ? sitemapLocations : null,
  };
}
