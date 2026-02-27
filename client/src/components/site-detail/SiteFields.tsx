import React from 'react';
import RescanPanel from '../rescan/RescanPanel';

function Bool({ val }: { val: unknown }) {
  if (val === null || val === undefined) return <span className="text-gray-300">—</span>;
  const bool = val === true || val === 1 || val === '1';
  return bool
    ? <span className="badge badge-green">✓ Yes</span>
    : <span className="badge badge-red">✗ No</span>;
}

function Val({ val, json }: { val: unknown; json?: boolean }) {
  if (val === null || val === undefined) return <span className="text-gray-300">—</span>;
  if (json && typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return (
          <div className="flex flex-wrap gap-1 mt-1">
            {parsed.slice(0, 10).map((v, i) => (
              <span key={i} className="badge badge-gray">{String(v)}</span>
            ))}
            {parsed.length > 10 && <span className="text-gray-400 text-xs">+{parsed.length - 10} more</span>}
          </div>
        );
      }
      return <pre className="text-xs bg-gray-50 p-1 rounded overflow-auto max-h-24">{JSON.stringify(parsed, null, 2)}</pre>;
    } catch {
      return <span className="font-mono text-xs break-all">{String(val)}</span>;
    }
  }
  return <span className="font-mono text-xs break-all">{String(val)}</span>;
}

const SECTIONS = [
  {
    title: 'Status',
    fields: [
      ['live', 'Live', 'bool'],
      ['status_code', 'HTTP Status'],
      ['redirect', 'Redirects', 'bool'],
      ['https_enforced', 'HTTPS Enforced', 'bool'],
      ['hsts', 'HSTS', 'bool'],
      ['media_type', 'Media Type'],
      ['hostname', 'CDN/Host'],
    ],
  },
  {
    title: 'Hosting & Infrastructure',
    fields: [
      ['hosting_provider', 'Hosting Provider'],
      ['web_server', 'Web Server'],
      ['cdn_provider', 'CDN'],
      ['dns_a_records', 'A Records', 'json'],
      ['dns_aaaa_records', 'AAAA Records', 'json'],
      ['dns_ns_records', 'NS Records', 'json'],
      ['dns_mx_records', 'MX Records', 'json'],
    ],
  },
  {
    title: 'Analytics',
    fields: [
      ['dap', 'DAP', 'bool'],
      ['dap_parameters', 'DAP Parameters', 'json'],
      ['dap_version', 'DAP Version'],
      ['ga_tag_id', 'GA Tag ID'],
      ['pageviews', 'Pageviews'],
      ['analytics_platforms', 'Detected Platforms', 'json'],
    ],
  },
  {
    title: 'USWDS',
    fields: [
      ['uswds_count', 'USWDS Score'],
      ['uswds_usa_classes', 'USA Classes'],
      ['uswds_banner_heres_how', 'Banner', 'bool'],
      ['uswds_publicsans_font', 'Public Sans', 'bool'],
      ['uswds_semantic_version', 'Version'],
      ['uswds_usa_class_list', 'Class List', 'json'],
    ],
  },
  {
    title: 'Sitemap',
    fields: [
      ['sitemap_xml_detected', 'Detected', 'bool'],
      ['sitemap_xml_status_code', 'Status Code'],
      ['sitemap_xml_count', 'URL Count'],
      ['sitemap_xml_pdf_count', 'PDF Count'],
      ['sitemap_xml_filesize', 'Filesize'],
      ['sitemap_xml_lastmod', 'Last Modified'],
      ['sitemap_sitemaps_found', 'Sub-sitemaps'],
      ['sitemap_latest_update', 'Latest Update'],
      ['sitemap_has_clean_urls', 'Clean URLs', 'bool'],
      ['sitemap_path_depth_avg', 'Avg Path Depth'],
    ],
  },
  {
    title: 'Robots.txt',
    fields: [
      ['robots_txt_detected', 'Detected', 'bool'],
      ['robots_txt_status_code', 'Status Code'],
      ['robots_txt_filesize', 'Filesize'],
      ['robots_txt_crawl_delay', 'Crawl Delay'],
      ['robots_txt_sitemap_locations', 'Sitemap Locations', 'json'],
    ],
  },
  {
    title: 'WordPress',
    fields: [
      ['wp_version', 'WP Version'],
      ['wp_theme', 'Theme'],
      ['wp_theme_version', 'Theme Version'],
      ['wp_plugins', 'Plugins', 'json'],
      ['wp_post_count', 'Posts'],
      ['wp_page_count', 'Pages'],
      ['wp_author_count', 'Authors'],
      ['wp_media_total', 'Media Items'],
      ['wp_media_size_formatted', 'Media Size'],
      ['wp_json_api_active', 'JSON API', 'bool'],
      ['wp_custom_post_types', 'Custom CPTs', 'json'],
      ['wp_feeds', 'Feeds', 'json'],
    ],
  },
  {
    title: 'Technologies',
    fields: [
      ['detected_technologies', 'Detected', 'json'],
      ['security_header_csp', 'CSP Header'],
      ['security_header_xss', 'X-XSS-Protection'],
    ],
  },
  {
    title: 'Technical',
    fields: [
      ['cms', 'CMS'],
      ['ipv6', 'IPv6', 'bool'],
      ['login_provider', 'Login Provider'],
      ['site_search', 'Site Search', 'bool'],
      ['viewport_meta_tag', 'Viewport Meta', 'bool'],
      ['main_element_present', '<main> Element', 'bool'],
      ['language', 'Language'],
      ['cumulative_layout_shift', 'CLS'],
      ['largest_contentful_paint', 'LCP (ms)'],
    ],
  },
  {
    title: 'SEO / Metadata',
    fields: [
      ['title', 'Title'],
      ['description', 'Description'],
      ['keywords', 'Keywords'],
      ['og_title', 'OG Title'],
      ['og_type', 'OG Type'],
    ],
  },
  {
    title: 'Third-Party Services',
    fields: [
      ['third_party_service_count', 'Count'],
      ['third_party_service_domains', 'Domains', 'json'],
    ],
  },
  {
    title: 'WWW Check',
    fields: [
      ['www_status_code', 'Status Code'],
      ['www_title', 'Title'],
    ],
  },
];

interface SiteFieldsProps {
  site: Record<string, unknown>;
  domain: string;
}

export default function SiteFields({ site, domain }: SiteFieldsProps) {
  return (
    <div className="divide-y divide-gray-100">
      {/* Re-scan panel */}
      <div className="p-4">
        <RescanPanel domain={domain} site={site} />
      </div>

      {/* Field sections */}
      {SECTIONS.map((section) => (
        <div key={section.title} className="px-4 py-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {section.title}
          </div>
          <dl className="space-y-1.5">
            {section.fields.map(([key, label, type]) => {
              const val = site[key];
              if (val === null || val === undefined) return null;
              return (
                <div key={key} className="flex gap-2">
                  <dt className="w-32 flex-shrink-0 text-gray-500 text-xs pt-0.5">{label}</dt>
                  <dd className="flex-1 text-xs text-gray-900 min-w-0">
                    {type === 'bool' ? (
                      <Bool val={val} />
                    ) : type === 'json' ? (
                      <Val val={val} json />
                    ) : (
                      <Val val={val} />
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}
