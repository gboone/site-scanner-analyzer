/**
 * USWDS (US Web Design System) detection.
 * Maps to the 11 uswds_* fields in the GSA Site Scanner schema.
 * Logic based on patterns from wp-analyze TechnologyDetector and GSA scanner docs.
 */
import type { UswdsResult } from 'shared';

// Known USWDS favicon hash (sha256 of the standard favicon)
const USWDS_FAVICON_SIGNATURE = 'uswds';
const PUBLIC_SANS_PATTERNS = ['public-sans', 'PublicSans', 'public_sans'];
const USWDS_STRINGS = ['uswds', 'us-banner', 'usa-banner', 'uswds-'];

export function detectUswds(html: string, cssContent: string): UswdsResult {
  const htmlLower = html.toLowerCase();

  // Count usa- classes
  const usaClassMatches = html.match(/class="[^"]*\busa-[\w-]+/g) || [];
  const usaClassSet = new Set<string>();
  for (const match of usaClassMatches) {
    const classes = match.replace(/class="/, '').split(/\s+/);
    for (const cls of classes) {
      if (cls.startsWith('usa-')) usaClassSet.add(cls);
    }
  }
  const usaClassList = Array.from(usaClassSet).sort();

  // Count USA classes (total usage, not unique)
  const usaClassCount = (html.match(/\busa-[\w-]+/g) || []).length;

  // USWDS string in HTML
  let uswdsString = 0;
  for (const s of USWDS_STRINGS) {
    uswdsString += (htmlLower.match(new RegExp(s.toLowerCase(), 'g')) || []).length;
  }

  // USWDS string in CSS
  const cssLower = cssContent.toLowerCase();
  let uswdsStringInCss = 0;
  for (const s of USWDS_STRINGS) {
    uswdsStringInCss += (cssLower.match(new RegExp(s.toLowerCase(), 'g')) || []).length;
  }

  // Public Sans font
  const publicsansFont = PUBLIC_SANS_PATTERNS.some(
    (p) => html.includes(p) || cssContent.includes(p)
  ) ? 1 : 0;

  // USWDS favicon detection
  const hasFavicon = htmlLower.includes('uswds') && htmlLower.includes('favicon') ? 1 : 0;
  const hasFaviconInCss = cssLower.includes('uswds') && cssLower.includes('favicon') ? 1 : 0;

  // Inline CSS with USWDS
  const inlineCssMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  let uswdsInpageCss = 0;
  for (const block of inlineCssMatches) {
    if (block.toLowerCase().includes('usa-') || block.toLowerCase().includes('uswds')) {
      uswdsInpageCss++;
    }
  }

  // Banner "here's how you know" detection
  const bannerHowPatterns = [
    'here\'s how you know',
    'heres how you know',
    'usa-banner',
    'gov-banner',
  ];
  const bannerHereshow = bannerHowPatterns.some((p) => htmlLower.includes(p));

  // Version detection
  let semanticVersion: string | null = null;
  const versionMatch = html.match(/uswds[- /]+([\d]+\.[\d]+\.[\d]+)/i);
  if (versionMatch) semanticVersion = versionMatch[1];

  // Aggregate USWDS count (matches GSA methodology: sum of component signals)
  const uswdsCount =
    usaClassCount +
    uswdsString +
    uswdsStringInCss +
    publicsansFont * 20 +
    hasFavicon * 10 +
    uswdsInpageCss * 5;

  return {
    count: uswdsCount,
    usa_classes: usaClassCount,
    usa_class_list: usaClassList,
    favicon: hasFavicon,
    favicon_in_css: hasFaviconInCss,
    publicsans_font: publicsansFont,
    inpage_css: uswdsInpageCss,
    string: uswdsString,
    string_in_css: uswdsStringInCss,
    version: semanticVersion ? 1 : 0,
    semantic_version: semanticVersion,
    banner_heres_how: bannerHereshow,
  };
}
