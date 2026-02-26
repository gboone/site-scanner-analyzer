/**
 * Fetch and parse sitemap.xml, including sitemap index recursion.
 * Adapted from wp-analyze WebsiteScanner.analyzeSitemap() / analyzeSitemapIndex()
 */

import { fetchWithTimeout } from './fetch';
import type { SitemapResult } from 'shared';

const MAX_SUB_SITEMAPS = 20; // Limit recursion depth

export async function analyzeSitemap(baseUrl: string): Promise<SitemapResult> {
  const sitemapUrl = `${baseUrl.replace(/\/$/, '')}/sitemap.xml`;

  let response: Response;
  try {
    response = await fetchWithTimeout(sitemapUrl, { timeoutMs: 20000 });
  } catch (err: any) {
    return {
      detected: false,
      url: sitemapUrl,
      status_code: 0,
      page_count: null,
      pdf_count: null,
      filesize: null,
      lastmod: null,
      error: `Network error: ${err.message}`,
    };
  }

  if (!response.ok) {
    return {
      detected: false,
      url: sitemapUrl,
      status_code: response.status,
      page_count: null,
      pdf_count: null,
      filesize: null,
      lastmod: null,
    };
  }

  const xmlText = await response.text();
  const filesize = new Blob([xmlText]).size;

  let xmlDoc: Document;
  try {
    const parser = new DOMParser();
    xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      return {
        detected: true,
        url: sitemapUrl,
        status_code: response.status,
        page_count: null,
        pdf_count: null,
        filesize,
        lastmod: null,
        error: 'Invalid XML',
      };
    }
  } catch {
    return {
      detected: true,
      url: sitemapUrl,
      status_code: response.status,
      page_count: null,
      pdf_count: null,
      filesize,
      lastmod: null,
      error: 'Parse error',
    };
  }

  // Sitemap index?
  const sitemapElements = xmlDoc.querySelectorAll('sitemap');
  if (sitemapElements.length > 0) {
    return analyzeSitemapIndex(xmlDoc, sitemapUrl, response.status, filesize);
  }

  // Regular sitemap
  const urlElements = xmlDoc.querySelectorAll('url');
  const urls: string[] = [];
  let lastmod: string | null = null;
  let pdfCount = 0;

  urlElements.forEach((el) => {
    const loc = el.querySelector('loc')?.textContent?.trim();
    if (loc) {
      urls.push(loc);
      if (loc.toLowerCase().endsWith('.pdf')) pdfCount++;
    }
    const lm = el.querySelector('lastmod')?.textContent?.trim();
    if (lm && (!lastmod || lm > lastmod)) lastmod = lm;
  });

  return {
    detected: true,
    url: sitemapUrl,
    status_code: response.status,
    page_count: urls.length,
    pdf_count: pdfCount > 0 ? pdfCount : null,
    filesize,
    lastmod,
  };
}

/** Format bytes into a human-readable string (e.g. "886.41 MB") */
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

/** Analyse an array of collected URLs and produce content-type + structure metrics. */
function analyzeUrls(urls: string[], baseHostname: string) {
  const segmentCounts: Record<string, number> = {};
  const yearCounts: Record<string, number> = {};
  const monthCounts: Record<string, number> = {};
  const pathDepths: number[] = [];
  let hasCleanUrls = true;
  let hasNodeIds = false;
  let hasQueryStrings = false;

  for (const raw of urls) {
    try {
      const u = new URL(raw);
      const path = u.pathname.replace(/\/$/, '');

      // URL structure
      if (u.search) hasQueryStrings = hasCleanUrls = false;
      if (/\.(php|asp|aspx|cfm)(\?|$)/.test(path)) hasCleanUrls = false;
      if (/\/node\/\d+/.test(path) || /[?&]id=\d+/.test(raw)) hasNodeIds = true;

      // Path depth
      const depth = path.split('/').filter(Boolean).length;
      pathDepths.push(depth);

      // Level-1 segment (first path component = content type proxy)
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) {
        const seg = parts[0];
        segmentCounts[seg] = (segmentCounts[seg] ?? 0) + 1;
      }
    } catch {
      // Malformed URL — skip
    }
  }

  const total = urls.length;
  const content_types: Record<string, { count: number; percentage: number }> = {};
  const url_patterns: Array<{ segment: string; count: number; percentage: number }> = [];

  for (const [seg, count] of Object.entries(segmentCounts)) {
    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    content_types[seg] = { count, percentage: pct };
    url_patterns.push({ segment: seg, count, percentage: pct });
  }
  url_patterns.sort((a, b) => b.count - a.count);

  const path_depth_avg = pathDepths.length > 0
    ? Math.round((pathDepths.reduce((a, b) => a + b, 0) / pathDepths.length) * 10) / 10
    : null;

  return {
    content_types,
    url_patterns,
    year_counts: yearCounts,
    month_counts: monthCounts,
    has_clean_urls: hasCleanUrls,
    has_node_ids: hasNodeIds,
    has_query_strings: hasQueryStrings,
    path_depth_avg,
  };
}

async function analyzeSitemapIndex(
  indexDoc: Document,
  indexUrl: string,
  indexStatus: number,
  indexFilesize: number
): Promise<SitemapResult> {
  const sitemapElements = Array.from(indexDoc.querySelectorAll('sitemap')).slice(0, MAX_SUB_SITEMAPS);
  const sitemapsFound = sitemapElements.length;
  let totalPages = 0;
  let pdfCount = 0;
  let lastmod: string | null = null;
  const allUrls: string[] = [];
  const publishingByYear: Record<string, number> = {};
  const publishingByMonth: Record<string, number> = {};

  await Promise.allSettled(
    sitemapElements.map(async (el) => {
      const loc = el.querySelector('loc')?.textContent?.trim();
      if (!loc) return;

      try {
        const res = await fetchWithTimeout(loc, { timeoutMs: 15000 });
        if (!res.ok) return;

        const xml = await res.text();
        const parser = new DOMParser();
        const subDoc = parser.parseFromString(xml, 'text/xml');

        subDoc.querySelectorAll('url').forEach((urlEl) => {
          const locEl = urlEl.querySelector('loc')?.textContent?.trim();
          if (locEl) {
            totalPages++;
            allUrls.push(locEl);
            if (locEl.toLowerCase().endsWith('.pdf')) pdfCount++;
          }
          const lm = urlEl.querySelector('lastmod')?.textContent?.trim();
          if (lm) {
            if (!lastmod || lm > lastmod) lastmod = lm;
            // Bucket by year and month
            const year = lm.slice(0, 4);
            const month = lm.slice(0, 7); // YYYY-MM
            if (year.match(/^\d{4}$/)) publishingByYear[year] = (publishingByYear[year] ?? 0) + 1;
            if (month.match(/^\d{4}-\d{2}$/)) publishingByMonth[month] = (publishingByMonth[month] ?? 0) + 1;
          }
        });
      } catch {
        // Sub-sitemap failed — skip it
      }
    })
  );

  const urlAnalysis = analyzeUrls(allUrls, indexUrl);

  return {
    detected: true,
    url: indexUrl,
    status_code: indexStatus,
    page_count: totalPages,
    pdf_count: pdfCount > 0 ? pdfCount : null,
    filesize: indexFilesize,
    lastmod,
    // Content analysis enrichment
    sitemaps_found: sitemapsFound,
    content_types: Object.keys(urlAnalysis.content_types).length > 0 ? urlAnalysis.content_types : undefined,
    url_patterns: urlAnalysis.url_patterns.length > 0 ? urlAnalysis.url_patterns : undefined,
    publishing_by_year: Object.keys(publishingByYear).length > 0 ? publishingByYear : undefined,
    publishing_by_month: Object.keys(publishingByMonth).length > 0 ? publishingByMonth : undefined,
    latest_update: lastmod,
    has_clean_urls: urlAnalysis.has_clean_urls,
    has_node_ids: urlAnalysis.has_node_ids,
    path_depth_avg: urlAnalysis.path_depth_avg,
  };
}
