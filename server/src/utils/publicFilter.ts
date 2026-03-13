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
 *   3. Non-completed www_scan_status (inaccessible or error state per GSA data)
 *   4. Auth-credential errors on sitemap or robots.txt scans
 *   5. Non-production environment subdomains (staging, UAT, test, dev, demo…)
 *   6. FTP servers, OWA / Exchange / VMware Horizon portals (by domain prefix)
 *   7. VPN / remote-access portals (by domain prefix and title)
 *   8. Internal systems identified by page title:
 *      - Authentication / access-control pages
 *      - Access-restriction banners ("internal use only", "employees only", etc.)
 *      - FTP / file-browser directory listings
 *      - Error pages beyond 404 (service unavailable, bad gateway, etc.)
 *      - Operations / support-desk portals
 *      - Vendor-specific internal tools (VMware, ServiceNow, etc.)
 *      - Generic IIS / default server pages
 *      - IT security / government computer-notice banners
 *      - MAX.gov and OMB collaboration portals
 *      - Git / version-control authentication screens
 *      - VPN product login screens
 *
 * NOTE: All LIKE comparisons are case-insensitive in MySQL's default
 * collation (utf8mb4_unicode_ci), so patterns are written in lowercase.
 */
export const PUBLIC_ONLY_CONDITION = `(redirect = 0 OR redirect IS NULL)
  AND live = 1
  AND (status_code = 200 OR status_code IS NULL)
  -- base_domain must be a .gov domain; non-.gov entries are vendor-hosted or non-federal
  AND (base_domain IS NULL OR base_domain LIKE '%.gov')
  -- GSA www scan must have completed (null = not yet evaluated, which is allowed)
  AND (www_scan_status IS NULL OR www_scan_status = 'completed')
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
  AND (
    title IS NULL OR title = '' OR (
      -- Authentication / access-control pages
      title NOT LIKE '%login%'
      AND title NOT LIKE '%log in%'
      AND title NOT LIKE '%sign in%'
      AND title NOT LIKE '%sign-in%'
      AND title NOT LIKE '%request rejected%'
      AND title NOT LIKE '%access denied%'
      AND title NOT LIKE '%unauthorized%'
      AND title NOT LIKE '%invalid credentials%'
      AND title NOT LIKE '%authentication required%'
      AND title NOT LIKE '%please authenticate%'
      AND title NOT LIKE '%two-factor%'
      AND title NOT LIKE '%two factor%'
      AND title NOT LIKE '%multi-factor%'
      -- Access-restriction banners
      AND title NOT LIKE '%internal access%'
      AND title NOT LIKE '%internal use only%'
      AND title NOT LIKE '%for internal use%'
      AND title NOT LIKE '%internal only%'
      AND title NOT LIKE '%restricted access%'
      AND title NOT LIKE '%for authorized personnel%'
      AND title NOT LIKE '%authorized users only%'
      AND title NOT LIKE '%employees only%'
      AND title NOT LIKE '%staff only%'
      AND title NOT LIKE '%for official use only%'
      -- FTP / file browsers
      AND title NOT LIKE '%index of /%'
      AND title NOT LIKE '%directory listing%'
      AND title NOT LIKE '%parent directory%'
      AND title NOT LIKE '%ftp server%'
      AND title NOT LIKE '%file browser%'
      AND title NOT LIKE '%webdav%'
      -- Error pages (beyond the 200-status gate above)
      AND title NOT LIKE '%service unavailable%'
      AND title NOT LIKE '%bad gateway%'
      AND title NOT LIKE '%temporarily unavailable%'
      AND title NOT LIKE '%site is offline%'
      AND title NOT LIKE '%under maintenance%'
      -- Generic server / infrastructure pages
      AND title NOT LIKE '%default website%'
      AND title NOT LIKE '%welcome to iis%'
      AND title NOT LIKE '%welcome to default%'
      AND title NOT LIKE '%outlook%'
      AND title NOT LIKE '%webmail%'
      AND title NOT LIKE '%forbidden%'
      AND title NOT LIKE '%page not found%'
      -- Operations / support-desk portals
      AND title NOT LIKE '%operations portal%'
      AND title NOT LIKE '%operations center%'
      AND title NOT LIKE '%network operations%'
      AND title NOT LIKE '%security operations center%'
      AND title NOT LIKE '%ops portal%'
      AND title NOT LIKE '%help desk%'
      AND title NOT LIKE '%helpdesk%'
      AND title NOT LIKE '%service desk%'
      AND title NOT LIKE '%servicedesk%'
      -- Vendor-specific internal tools
      AND title NOT LIKE '%vmware%'
      AND title NOT LIKE '%horizon view%'
      AND title NOT LIKE '%workspace one%'
      AND title NOT LIKE '%jira service%'
      AND title NOT LIKE '%servicenow%'
      -- IT security / government computer-notice banners
      AND title NOT LIKE '%it security%'
      AND title NOT LIKE '%unauthorized access is prohibited%'
      AND title NOT LIKE '%computer fraud%'
      AND title NOT LIKE '%information systems security%'
      -- MAX.gov and OMB internal collaboration portals
      AND title NOT LIKE '%max.gov%'
      AND title NOT LIKE '%max portal%'
      AND title NOT LIKE '%maxportal%'
      AND title NOT LIKE '%max auth%'
      AND title NOT LIKE '%maxauth%'
      AND title NOT LIKE '%omb max%'
      -- Git / version-control authentication screens
      AND title NOT LIKE '%gitlab%'
      AND title NOT LIKE '%gitea%'
      AND title NOT LIKE '%gogs%'
      AND title NOT LIKE '%sign in · git%'
      -- VPN / remote-access product login screens
      AND title NOT LIKE '%vpn%'
      AND title NOT LIKE '%anyconnect%'
      AND title NOT LIKE '%ssl vpn%'
      AND title NOT LIKE '%webvpn%'
      AND title NOT LIKE '%citrix%'
      AND title NOT LIKE '%pulse secure%'
      AND title NOT LIKE '%globalprotect%'
      AND title NOT LIKE '%remote access%'
      AND title NOT LIKE '%juniper network%'
    )
  )`;
