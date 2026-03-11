/**
 * PUBLIC_ONLY_CONDITION — shared SQL WHERE clause fragment for filtering
 * public-facing government websites.
 *
 * Applied in:
 *   - GET /api/v1/report        (routes/report.ts)
 *   - GET /api/v1/sites?public_only=true  (routes/sites.ts)
 *
 * What this filter removes:
 *   1. Redirects, non-live sites, non-200 status codes
 *   2. Non-production environment subdomains (staging, UAT, test, dev, demo…)
 *   3. VPN / remote-access portals (by domain prefix and title)
 *   4. Internal systems identified by page title:
 *      - Authentication / access-control pages
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
  AND (excluded = 0 OR excluded IS NULL)
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
      -- Generic server / infrastructure pages
      AND title NOT LIKE '%default website%'
      AND title NOT LIKE '%welcome to iis%'
      AND title NOT LIKE '%welcome to default%'
      AND title NOT LIKE '%outlook%'
      AND title NOT LIKE '%webmail%'
      AND title NOT LIKE '%forbidden%'
      AND title NOT LIKE '%page not found%'
      -- IT security / government computer-notice banners
      AND title NOT LIKE '%it security%'
      AND title NOT LIKE '%authorized users only%'
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
