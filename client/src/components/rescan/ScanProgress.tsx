import React from 'react';

function ScanSummary({ result }: { result: any }) {
  const ts = result.tech_stack;
  const dns = result.dns;
  const sitemap = result.sitemap;

  const rows: { label: string; value: string | null }[] = [
    { label: 'CMS', value: ts?.cms ?? null },
    { label: 'Web server', value: ts?.web_server ?? null },
    { label: 'CDN', value: ts?.cdn ?? null },
    { label: 'Hosting', value: ts?.hosting_provider ?? dns?.hosting_provider ?? null },
    { label: 'HTTPS', value: ts?.https_enforced != null ? (ts.https_enforced ? '✓ Enforced' : '✗ Not enforced') : null },
    { label: 'HSTS', value: ts?.hsts != null ? (ts.hsts ? '✓ Present' : '✗ Absent') : null },
    { label: 'DAP', value: ts?.dap?.detected != null ? (ts.dap.detected ? '✓ Detected' : '✗ Not detected') : null },
    { label: 'USWDS score', value: ts?.uswds?.count != null ? String(ts.uswds.count) : null },
    { label: 'IPv6', value: dns?.ipv6 != null ? (dns.ipv6 ? '✓ Yes' : '✗ No') : null },
    { label: 'NS records', value: dns?.ns_records?.length ? dns.ns_records.slice(0, 2).join(', ') : null },
    { label: 'A records', value: dns?.a_records?.length ? dns.a_records.slice(0, 3).join(', ') : null },
  ];

  const wp = ts?.wordpress;
  if (wp) {
    rows.push({ label: 'WP version', value: wp.version ?? null });
    rows.push({ label: 'WP theme', value: wp.theme ? `${wp.theme}${wp.theme_version ? ` v${wp.theme_version}` : ''}` : null });
    if (wp.plugins?.length) {
      rows.push({ label: `Plugins (${wp.plugins.length})`, value: wp.plugins.slice(0, 8).join(', ') + (wp.plugins.length > 8 ? `… +${wp.plugins.length - 8}` : '') });
    }
  }

  if (ts?.analytics?.length) {
    rows.push({ label: 'Analytics', value: ts.analytics.join(', ') });
  }

  if (ts?.technologies?.length) {
    rows.push({ label: 'Technologies', value: ts.technologies.map((t: any) => t.name).slice(0, 6).join(', ') + (ts.technologies.length > 6 ? ` +${ts.technologies.length - 6}` : '') });
  }

  const visible = rows.filter(r => r.value !== null);

  // WordPress REST API content section
  const wpc = wp?.content;
  const wpContentRows: { label: string; value: string }[] = [];
  if (wpc?.json_api_active) {
    if (wpc.post_count != null) wpContentRows.push({ label: 'Posts', value: String(wpc.post_count) });
    if (wpc.page_count != null) wpContentRows.push({ label: 'Pages', value: String(wpc.page_count) });
    if (wpc.author_count != null) wpContentRows.push({ label: 'Authors', value: String(wpc.author_count) });
    if (wpc.category_count != null) wpContentRows.push({ label: 'Categories', value: String(wpc.category_count) });
    if (wpc.tag_count != null) wpContentRows.push({ label: 'Tags', value: String(wpc.tag_count) });
    if (wpc.media_total != null) {
      const mediaLabel = wpc.media_size_formatted
        ? `${wpc.media_total.toLocaleString()} items (${wpc.media_size_formatted}${wpc.media_scan_complete ? '' : ' partial'})`
        : `${wpc.media_total.toLocaleString()} items`;
      wpContentRows.push({ label: 'Media', value: mediaLabel });
    }
    if (wpc.detected_plugins?.length) {
      const highConf = wpc.detected_plugins.filter((p: any) => p.confidence === 'high').length;
      wpContentRows.push({ label: 'API plugins', value: `${wpc.detected_plugins.length} detected (${highConf} high confidence)` });
    }
    if (wpc.custom_post_types?.length) {
      wpContentRows.push({ label: 'Custom CPTs', value: wpc.custom_post_types.slice(0, 5).join(', ') + (wpc.custom_post_types.length > 5 ? ` +${wpc.custom_post_types.length - 5}` : '') });
    }
    if (wpc.feeds?.length) {
      wpContentRows.push({ label: 'Feeds', value: wpc.feeds.length === 1 ? wpc.feeds[0].replace(/^https?:\/\/[^/]+/, '') : `${wpc.feeds.length} detected` });
    }
  }

  // Sitemap content analysis section
  const sitemapRows: { label: string; value: string }[] = [];
  if (sitemap?.detected) {
    if (sitemap.page_count != null) sitemapRows.push({ label: 'URLs', value: sitemap.page_count.toLocaleString() });
    if (sitemap.sitemaps_found != null) sitemapRows.push({ label: 'Sub-sitemaps', value: String(sitemap.sitemaps_found) });
    if (sitemap.latest_update) sitemapRows.push({ label: 'Latest update', value: sitemap.latest_update.slice(0, 10) });
    if (sitemap.has_clean_urls != null) sitemapRows.push({ label: 'Clean URLs', value: sitemap.has_clean_urls ? '✓ Yes' : '✗ No' });
    if (sitemap.path_depth_avg != null) sitemapRows.push({ label: 'Avg path depth', value: String(sitemap.path_depth_avg) });
    if (sitemap.url_patterns?.length) {
      const top3 = sitemap.url_patterns.slice(0, 3).map((p: any) => `${p.segment} (${p.percentage}%)`).join(', ');
      sitemapRows.push({ label: 'Top sections', value: top3 });
    }
  }

  return (
    <div className="mt-2 bg-green-50 rounded p-2 space-y-1">
      <div className="text-green-700 font-medium">✓ Scan complete — database updated</div>
      {visible.map(r => (
        <div key={r.label} className="flex gap-2">
          <span className="text-gray-500 w-24 shrink-0">{r.label}:</span>
          <span className="text-gray-800 break-all">{r.value}</span>
        </div>
      ))}

      {wpContentRows.length > 0 && (
        <div className="mt-2 pt-2 border-t border-green-200">
          <div className="text-green-600 font-medium text-xs mb-1">WordPress Content (REST API)</div>
          {wpContentRows.map(r => (
            <div key={r.label} className="flex gap-2">
              <span className="text-gray-500 w-24 shrink-0">{r.label}:</span>
              <span className="text-gray-800 break-all">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {sitemapRows.length > 0 && (
        <div className="mt-2 pt-2 border-t border-green-200">
          <div className="text-green-600 font-medium text-xs mb-1">Sitemap Analysis</div>
          {sitemapRows.map(r => (
            <div key={r.label} className="flex gap-2">
              <span className="text-gray-500 w-24 shrink-0">{r.label}:</span>
              <span className="text-gray-800 break-all">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { key: 'redirect', label: 'Redirect chain' },
  { key: 'sitemap', label: 'Sitemap.xml' },
  { key: 'robots', label: 'Robots.txt' },
  { key: 'tech', label: 'Technology detection' },
  { key: 'dns', label: 'DNS records' },
];

interface ProgressState {
  step: string | null;
  completed: Set<string>;
  error: string | null;
  result: any | null;
}

export default function ScanProgress({ progress }: { progress: ProgressState }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
      {STEPS.map((s) => {
        const done = progress.completed.has(s.key);
        const active = progress.step === s.key;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className={`w-4 text-center ${done ? 'text-green-500' : active ? 'text-gov-blue animate-pulse' : 'text-gray-300'}`}>
              {done ? '✓' : active ? '◌' : '○'}
            </span>
            <span className={done ? 'text-gray-700' : active ? 'text-gov-blue font-medium' : 'text-gray-400'}>
              {s.label}
            </span>
          </div>
        );
      })}

      {progress.error && (
        <div role="alert" className="mt-2 text-red-600 bg-red-50 rounded p-2">{progress.error}</div>
      )}

      {progress.result && progress.step === 'done' && (
        <ScanSummary result={progress.result} />
      )}
    </div>
  );
}
