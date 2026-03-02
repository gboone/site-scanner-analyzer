export const SAMPLE_QUERIES = [
  {
    label: 'Sites count by agency',
    sql: `SELECT agency, COUNT(*) as site_count
FROM sites
WHERE agency IS NOT NULL
GROUP BY agency
ORDER BY site_count DESC;`,
  },
  {
    label: 'Live sites missing sitemap',
    sql: `SELECT domain, agency, bureau, title
FROM sites
WHERE live = 1 AND sitemap_xml_detected = 0
ORDER BY agency, domain;`,
  },
  {
    label: 'Sites with USWDS but no DAP',
    sql: `SELECT domain, agency, uswds_count
FROM sites
WHERE uswds_count > 0 AND dap = 0 AND live = 1
ORDER BY uswds_count DESC;`,
  },
  {
    label: 'USWDS adoption rate by bureau',
    sql: `SELECT
  bureau,
  COUNT(*) as total,
  SUM(CASE WHEN uswds_count > 0 THEN 1 ELSE 0 END) as has_uswds,
  ROUND((100.0 * SUM(CASE WHEN uswds_count > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)), 1) as uswds_pct,
  ROUND(AVG(uswds_count), 1) as avg_uswds_score
FROM sites
WHERE bureau IS NOT NULL
GROUP BY bureau
HAVING COUNT(*) > 1
ORDER BY uswds_pct DESC;`,
  },
  {
    label: 'Top third-party domains (across all sites)',
    sql: `SELECT
  elem AS third_party_domain,
  COUNT(DISTINCT s.domain) AS site_count
FROM sites s, JSON_TABLE(
  s.third_party_service_domains,
  '$[*]' COLUMNS (elem VARCHAR(500) PATH '$')
) AS jt
WHERE s.third_party_service_domains IS NOT NULL
  AND JSON_VALID(s.third_party_service_domains)
GROUP BY jt.elem
ORDER BY site_count DESC
LIMIT 20;`,
  },
  {
    label: 'Sites with non-200 status codes',
    sql: `SELECT domain, agency, status_code, live, title
FROM sites
WHERE status_code != 200
ORDER BY status_code, agency;`,
  },
  {
    label: 'HTTPS enforcement summary',
    sql: `SELECT
  agency,
  COUNT(*) as total,
  SUM(https_enforced) as https_count,
  SUM(hsts) as hsts_count,
  ROUND((100.0 * SUM(https_enforced) / NULLIF(COUNT(*), 0)), 1) as https_pct
FROM sites
GROUP BY agency
ORDER BY https_pct ASC;`,
  },
  {
    label: 'Sites with login providers',
    sql: `SELECT domain, agency, login_provider, live, cms
FROM sites
WHERE login_provider IS NOT NULL
ORDER BY login_provider, domain;`,
  },
  {
    label: 'Large sitemaps (> 1000 URLs)',
    sql: `SELECT domain, agency, sitemap_xml_count, sitemap_xml_pdf_count, pageviews
FROM sites
WHERE sitemap_xml_detected = 1 AND sitemap_xml_count > 1000
ORDER BY sitemap_xml_count DESC;`,
  },
  {
    label: 'USWDS class list for a specific domain',
    sql: `SELECT elem AS css_class
FROM sites, JSON_TABLE(
  uswds_usa_class_list,
  '$[*]' COLUMNS (elem VARCHAR(500) PATH '$')
) AS jt
WHERE domain = 'www.va.gov'
  AND JSON_VALID(uswds_usa_class_list)
ORDER BY jt.elem;`,
  },
  {
    label: 'Recently scanned sites (last 30 days)',
    sql: `SELECT domain, agency, scan_date, status_code, live
FROM sites
WHERE scan_date > DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 30 DAY), '%Y-%m-%d')
ORDER BY scan_date DESC;`,
  },
  {
    label: 'Sites table columns',
    sql: `SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sites'
ORDER BY ordinal_position;`,
  },
];
