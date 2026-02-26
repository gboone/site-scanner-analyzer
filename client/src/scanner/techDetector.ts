/**
 * Technology detection via HTML and header fingerprinting.
 * Adapted from wp-analyze TechnologyDetector class.
 */

import { fetchWithTimeout } from './fetch';
import { detectUswds } from './uswds';
import { detectDap } from './dap';
import { analyzeWpContent } from './wpContent';
import type { TechStackResult, WordPressResult, DetectedTechnology, SecurityHeaders } from 'shared';

interface CmsCandidate {
  name: string;
  score: number;
}

function detectCms(html: string, headers: Record<string, string>): string | null {
  const htmlLower = html.toLowerCase();
  const scores: Record<string, number> = {};

  // WordPress
  let wpScore = 0;
  if (/<meta[^>]*generator[^>]*wordpress/i.test(html)) wpScore += 50;
  if (html.includes('wp-content/')) wpScore += 30;
  if (html.includes('wp-includes/')) wpScore += 30;
  if (html.includes('/wp-json/')) wpScore += 20;
  if (headers['x-powered-by']?.toLowerCase().includes('wordpress')) wpScore += 40;
  scores['WordPress'] = wpScore;

  // Drupal
  let drupalScore = 0;
  if (/drupal/i.test(html)) drupalScore += 30;
  if (html.includes('/sites/default/files/')) drupalScore += 30;
  if (html.includes('Drupal.settings')) drupalScore += 40;
  if (headers['x-generator']?.toLowerCase().includes('drupal')) drupalScore += 50;
  if (headers['x-drupal-cache']) drupalScore += 30;
  scores['Drupal'] = drupalScore;

  // Joomla
  let joomlaScore = 0;
  if (htmlLower.includes('/components/com_')) joomlaScore += 30;
  if (htmlLower.includes('joomla')) joomlaScore += 20;
  if (htmlLower.includes('/media/jui/')) joomlaScore += 30;
  scores['Joomla'] = joomlaScore;

  // Sitecore
  let sitecoreScore = 0;
  if (/<meta[^>]*generator[^>]*sitecore/i.test(html)) sitecoreScore += 50;
  if (headers['x-sitecore-requestid'] || headers['x-sitecore-version']) sitecoreScore += 50;
  const scCookie = headers['set-cookie'] ?? '';
  if (/SC_ANALYTICS_GLOBAL_COOKIE/i.test(scCookie)) sitecoreScore += 50;
  if (html.includes('/-/media/') || html.includes('/~/media/')) sitecoreScore += 40;
  if (html.includes('data-sc-')) sitecoreScore += 30;
  if (html.includes('/api/jss/') || html.includes('/-/jsss/')) sitecoreScore += 30;
  if (/sitecore/i.test(html)) sitecoreScore += 10; // weak on its own; needs corroboration
  scores['Sitecore'] = sitecoreScore;

  // Squarespace
  if (htmlLower.includes('squarespace')) scores['Squarespace'] = 60;

  // Wix
  if (htmlLower.includes('wixsite.com') || htmlLower.includes('wix.com/dpages')) scores['Wix'] = 60;

  // Shopify
  if (htmlLower.includes('shopify') || htmlLower.includes('cdn.shopify.com')) scores['Shopify'] = 60;

  // Find highest scorer above threshold
  let highest: CmsCandidate = { name: '', score: 0 };
  for (const [name, score] of Object.entries(scores)) {
    if (score > highest.score) highest = { name, score };
  }

  return highest.score >= 40 ? highest.name : null;
}

function detectWebServer(headers: Record<string, string>): string | null {
  const server = headers['server'] || '';
  if (!server) return null;
  const s = server.toLowerCase();
  if (s.includes('nginx')) return 'Nginx';
  if (s.includes('apache')) return 'Apache';
  if (s.includes('iis')) return 'IIS';
  if (s.includes('cloudflare')) return 'Cloudflare';
  if (s.includes('litespeed')) return 'LiteSpeed';
  return server.split('/')[0] || null;
}

function detectCdn(headers: Record<string, string>, html: string): string | null {
  if (headers['cf-cache-status'] || headers['cf-ray']) return 'Cloudflare';
  if (headers['x-cache']?.includes('cloudfront') || html.includes('cloudfront.net')) return 'CloudFront';
  if (headers['x-fastly-request-id'] || headers['via']?.includes('fastly')) return 'Fastly';
  if (headers['x-akamai-transformed'] || headers['server']?.includes('AkamaiGHost')) return 'Akamai';
  if (headers['via']?.toLowerCase().includes('squid')) return 'Squid';
  return null;
}

function detectHttpsSecurity(headers: Record<string, string>, finalUrl: string): {
  https_enforced: boolean;
  hsts: boolean;
} {
  const httpsEnforced = finalUrl.startsWith('https://');
  const hsts = !!(headers['strict-transport-security']);
  return { https_enforced: httpsEnforced, hsts };
}

function extractCssUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  const styleRegex = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    try { urls.push(new URL(m[1], baseUrl).href); } catch {}
  }
  while ((m = styleRegex.exec(html)) !== null) {
    try { urls.push(new URL(m[1], baseUrl).href); } catch {}
  }
  return urls.slice(0, 3); // Only check first 3 CSS files
}

/**
 * Deep WordPress detection: version, active theme, and detectable plugins.
 * All signals come from the page HTML already fetched — no extra requests.
 */
function detectWordPress(html: string, baseUrl: string): WordPressResult | null {
  // Only run if WordPress was confirmed
  if (!html.includes('wp-content/') && !html.includes('wp-includes/')) return null;

  // --- Version ---
  // <meta name="generator" content="WordPress 6.4.2" />
  const versionMatch = html.match(/<meta[^>]*generator[^>]*WordPress\s+([\d.]+)/i);
  // Also found in readme.html and feed links: ?ver=6.4.2
  const verFromAsset = html.match(/[?&]ver=([\d]+\.[\d]+(?:\.[\d]+)?)/);
  const version = versionMatch?.[1] ?? verFromAsset?.[1] ?? null;

  // --- Theme ---
  // wp-content/themes/<theme-slug>/
  const themeMatch = html.match(/wp-content\/themes\/([^/"'?]+)/);
  const theme = themeMatch?.[1] ?? null;

  // Theme version from style.css enqueue: themes/slug/style.css?ver=X.Y
  let themeVersion: string | null = null;
  if (theme) {
    const tvMatch = html.match(new RegExp(`themes/${theme}/[^"']*\\?ver=([\\d.]+)`));
    themeVersion = tvMatch?.[1] ?? null;
  }

  // --- Plugins ---
  // Extract all plugin slugs referenced in wp-content/plugins/<slug>/
  const pluginSlugs = new Set<string>();
  const pluginRegex = /wp-content\/plugins\/([^/"'?#\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = pluginRegex.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    // Exclude generic/empty matches
    if (slug && slug.length > 2 && !slug.startsWith('.')) {
      pluginSlugs.add(slug);
    }
  }

  return {
    version,
    theme,
    theme_version: themeVersion,
    plugins: Array.from(pluginSlugs).sort(),
    content: null,
  };
}

async function fetchCssContent(cssUrls: string[]): Promise<string> {
  const results = await Promise.allSettled(
    cssUrls.map(async (url) => {
      try {
        const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
        if (res.ok) return res.text();
        return '';
      } catch {
        return '';
      }
    })
  );
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<string>).value)
    .join('\n');
}

/**
 * Determines whether the fetched page is an authentication gate rather than
 * publicly accessible content. A site is considered login-gated when:
 *   - The server returned HTTP 401 (Basic Auth challenge), OR
 *   - The page has a password input AND either the URL path or the page title
 *     matches common SSO/login patterns (guards against flagging pages that
 *     merely contain an embedded login widget as part of a larger layout).
 */
function detectLoginGate(url: string, html: string, status: number): boolean {
  if (status === 401) return true;

  const hasPasswordInput = /<input[^>]+type=["']?password/i.test(html);
  if (!hasPasswordInput) return false;

  // Only flag as a gate if something else also points to a login context.
  const urlLower = url.toLowerCase();
  const loginUrlPatterns = [
    '/login', '/signin', '/sign-in', '/sso', '/saml', '/auth/',
    '/idp/', '/oauth', '/cas/', '/adfs/', '/accounts/login',
    'login.microsoftonline.com', '.okta.com', '.auth0.com',
    'ping', 'shibboleth', 'login.gov',
  ];
  const urlIsLoginPath = loginUrlPatterns.some((p) => urlLower.includes(p));

  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = titleMatch ? titleMatch[1].toLowerCase() : '';
  const loginTitlePatterns = [
    'log in', 'login', 'sign in', 'sign on', 'single sign',
    'authentication required', 'authenticate', 'sso',
  ];
  const titleIsLogin = loginTitlePatterns.some((p) => title.includes(p));

  return urlIsLoginPath || titleIsLogin;
}

export async function detectTech(url: string): Promise<TechStackResult> {
  let html = '';
  let responseHeaders: Record<string, string> = {};
  let responseStatus = 0;

  try {
    const response = await fetchWithTimeout(url, { timeoutMs: 25000 });
    responseStatus = response.status;
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });
    if (response.ok || response.status === 403) {
      // Even 403 pages often have HTML with detection signals
      html = await response.text();
    }
  } catch {
    // Can't fetch — return minimal result
    return {
      cms: null,
      web_server: null,
      analytics: [],
      cdn: null,
      hosting_provider: null,
      wordpress: null,
      technologies: [],
      security_headers: { csp: null, xss_protection: null },
      uswds: {
        count: 0, usa_classes: 0, usa_class_list: [], favicon: 0, favicon_in_css: 0,
        publicsans_font: 0, inpage_css: 0, string: 0, string_in_css: 0,
        version: 0, semantic_version: null, banner_heres_how: false,
      },
      dap: { detected: false, parameters: null, version: null, ga_tag_id: null },
      https_enforced: url.startsWith('https://'),
      hsts: false,
      login_gate: false,
    };
  }

  // Detect CMS early so we can conditionally run WP REST API fetch in parallel
  const cms = detectCms(html, responseHeaders);

  // Fetch external CSS (for USWDS) and WordPress REST API data in parallel
  const cssUrls = extractCssUrls(html, url);
  const [cssContent, wpContent] = await Promise.all([
    cssUrls.length > 0 ? fetchCssContent(cssUrls) : Promise.resolve(''),
    cms === 'WordPress' ? analyzeWpContent(url) : Promise.resolve(null),
  ]);

  const webServer = detectWebServer(responseHeaders);
  const cdn = detectCdn(responseHeaders, html);
  const { https_enforced, hsts } = detectHttpsSecurity(responseHeaders, url);
  const uswds = detectUswds(html, cssContent);
  const dap = detectDap(html);

  // Build WordPress result with REST API content attached
  const wpBase = cms === 'WordPress' ? detectWordPress(html, url) : null;
  const wordpress: WordPressResult | null = wpBase
    ? { ...wpBase, content: wpContent }
    : null;

  // Analytics detection (from wp-analyze detectAnalytics())
  const analyticsPatterns: Record<string, string[]> = {
    'Google Analytics (DAP)': ['dap.digitalgov.gov'],
    'Google Analytics': ['google-analytics', 'gtag(', 'googleanalytics'],
    'Google Tag Manager': ['googletagmanager', 'gtm.js'],
    'Adobe Analytics': ['omniture', 'adobe analytics', 's_code'],
    'Hotjar': ['static.hotjar.com', 'hjconfig'],
    'Facebook Pixel': ['fbevents.js', 'fbq('],
    'Matomo': ['matomo.js', '_paq.push'],
    'Twitter Analytics': ['static.ads-twitter.com/uwt.js'],
    'LinkedIn Insight': ['snap.licdn.com'],
    'Parsely': ['parsely.com/analytics', 'pkg.parsely.com', 'parsely-analytics'],
    'Chartbeat': ['static.chartbeat.com', 'chartbeat.com/js', '_cbq'],
    'Segment': ['cdn.segment.com', 'analytics.js', 'segment.com/analytics'],
    'Amplitude': ['cdn.amplitude.com', 'amplitude.getinstance', 'amplitude.js'],
    'Mixpanel': ['cdn.mxpnl.com', 'mixpanel.com/libs', 'mixpanel.init'],
    'Fathom Analytics': ['cdn.usefathom.com'],
    'Plausible': ['plausible.io/js'],
    'New Relic': ['js-agent.newrelic.com', 'newrelic.com/js'],
    'Quantum Metric': ['cdn.quantummetric.com', 'ptotal.quantummetric'],
    'Qualtrics': ['siteintercept.qualtrics.com', 'iad1.qualtrics.com'],
  };

  const htmlLower = html.toLowerCase();
  const analytics: string[] = [];
  for (const [tool, patterns] of Object.entries(analyticsPatterns)) {
    if (patterns.some((p) => htmlLower.includes(p.toLowerCase()))) {
      analytics.push(tool);
    }
  }

  // Generic technology detection from HTML fingerprints
  const techPatterns: Record<string, { category: string; patterns: string[] }> = {
    'jQuery':        { category: 'JavaScript Library',   patterns: ['jquery.min.js', 'jquery.js', '/jquery/'] },
    'Next.js':       { category: 'JavaScript Framework', patterns: ['/_next/', '__next', 'next.js'] },
    'Stimulus':      { category: 'JavaScript Framework', patterns: ['stimulus', 'data-controller='] },
    'React':         { category: 'JavaScript Library',   patterns: ['react.production', 'react-dom', '__react'] },
    'Vue.js':        { category: 'JavaScript Framework', patterns: ['vue.min.js', 'vue.js', '__vue__'] },
    'Angular':       { category: 'JavaScript Framework', patterns: ['ng-version=', 'angular.min.js'] },
    'Bootstrap':     { category: 'CSS Framework',        patterns: ['bootstrap.min.css', 'bootstrap.css', 'bootstrap.bundle'] },
    'Tailwind CSS':  { category: 'CSS Framework',        patterns: ['tailwindcss', 'tailwind.min.css'] },
    'Google Fonts':  { category: 'Font Service',         patterns: ['fonts.googleapis.com', 'fonts.gstatic.com'] },
    'Font Awesome':  { category: 'Icon Library',         patterns: ['font-awesome', 'fontawesome'] },
    'AMP':           { category: 'Web Framework',        patterns: ['<html amp', '<html ⚡'] },
    'Cloudflare JS': { category: 'CDN / Security',       patterns: ['cloudflare.com/cdn-cgi/'] },
  };

  const technologies: DetectedTechnology[] = [];
  for (const [name, { category, patterns }] of Object.entries(techPatterns)) {
    if (patterns.some(p => htmlLower.includes(p.toLowerCase()))) {
      technologies.push({ name, category });
    }
  }

  // Security headers
  const security_headers: SecurityHeaders = {
    csp: responseHeaders['content-security-policy'] ?? null,
    xss_protection: responseHeaders['x-xss-protection'] ?? null,
  };

  const login_gate = detectLoginGate(url, html, responseStatus);

  // hosting_provider is filled in by the orchestrator from DNS results
  return {
    cms, web_server: webServer, analytics, cdn, hosting_provider: null,
    wordpress, technologies, security_headers, uswds, dap,
    https_enforced, hsts, login_gate,
  };
}
