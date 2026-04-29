/**
 * PUBLIC_ONLY_CONDITION — shared SQL WHERE clause fragment for filtering
 * public-facing government websites.
 *
 * Applied in:
 *   - GET /api/v1/report        (routes/report.ts)
 *   - GET /api/v1/sites?public_only=true  (routes/sites.ts)
 *   - DB startup backfill of the `is_public` column   (db/index.ts)
 *
 * What this filter removes:
 *   1. Redirects, non-live sites, non-200 status codes
 *   2. Non-.gov base domains (vendor-hosted / non-federal)
 *   3. Auth-credential errors on sitemap or robots.txt scans
 *   5. Non-production environment subdomains (staging, UAT, test, dev, demo…)
 *   6. FTP servers, OWA / Exchange / VMware Horizon portals (by domain prefix)
 *   7. VPN / remote-access portals (by domain prefix)
 *
 * NOTE: All LIKE comparisons are case-insensitive in MySQL's default
 * collation (utf8mb4_unicode_ci), so patterns are written in lowercase.
 */
export const PUBLIC_ONLY_CONDITION = `(redirect = 0 OR redirect IS NULL)
  AND live = 1
  AND (status_code = 200 OR status_code IS NULL)
  -- base_domain must be a .gov domain; non-.gov entries are vendor-hosted or non-federal
  AND (base_domain IS NULL OR base_domain LIKE '%.gov')
  -- Credential errors on sitemap / robots indicate an auth-gated site
  AND (sitemap_xml_scan_status IS NULL OR sitemap_xml_scan_status != 'invalid_auth_credentials')
  AND (robots_txt_scan_status IS NULL OR robots_txt_scan_status != 'invalid_auth_credentials')
  AND (
    -- Exclude non-production environment subdomains (staging / UAT / test / dev)
    domain NOT LIKE 'staging.%'
    AND domain NOT LIKE 'uat.%'
    AND domain NOT LIKE 'test.%'
    AND domain NOT LIKE 'dev.%'
    AND domain NOT LIKE 'demo.%'
    AND domain NOT LIKE 'qa.%'
    AND domain NOT LIKE 'stg.%'
    AND domain NOT LIKE 'sit.%'
    AND domain NOT LIKE 'preprod.%'
    AND domain NOT LIKE 'pre-prod.%'
    AND domain NOT LIKE 'sandbox.%'
    AND domain NOT LIKE 'training.%'
    AND domain NOT LIKE 'www-test.%'
    AND domain NOT LIKE 'www-dev.%'
    AND domain NOT LIKE 'www-stg.%'
    AND domain NOT LIKE '%.staging.%'
    AND domain NOT LIKE '%.uat.%'
    AND domain NOT LIKE '%.test.%'
    AND domain NOT LIKE '%.dev.%'
    AND domain NOT LIKE '%.demo.%'
    AND domain NOT LIKE '%.qa.%'
    AND domain NOT LIKE '%.stg.%'
    AND domain NOT LIKE '%-staging.%'
    AND domain NOT LIKE '%-uat.%'
    AND domain NOT LIKE '%-test.%'
    AND domain NOT LIKE '%-dev.%'
    AND domain NOT LIKE '%-demo.%'
    -- Exclude FTP servers and file-transfer services
    AND domain NOT LIKE 'ftp.%'
    AND domain NOT LIKE 'sftp.%'
    AND domain NOT LIKE 'files.%'
    AND domain NOT LIKE 'sharefiles.%'
    -- Exclude email / webmail portals
    AND domain NOT LIKE 'mail.%'
    AND domain NOT LIKE 'webmail.%'
    -- Exclude Microsoft Exchange / OWA portals
    AND domain NOT LIKE 'owa.%'
    AND domain NOT LIKE 'exchange.%'
    -- Exclude VMware Horizon virtual-desktop portals
    AND domain NOT LIKE 'horizon.%'
    -- Exclude VPN / remote-access portals by subdomain
    AND domain NOT LIKE 'vpn.%'
    AND domain NOT LIKE 'vpngateway.%'
    AND domain NOT LIKE 'webvpn.%'
    AND domain NOT LIKE 'sslvpn.%'
    AND domain NOT LIKE 'remote.%'
    AND domain NOT LIKE 'citrix.%'
    AND domain NOT LIKE 'pulse.%'
    AND domain NOT LIKE 'anyconnect.%'
    AND domain NOT LIKE 'connect.%'
    AND domain NOT LIKE 'access.%'
    AND domain NOT LIKE '%.vpn.%'
    AND domain NOT LIKE '%-vpn.%'
  )
`;
