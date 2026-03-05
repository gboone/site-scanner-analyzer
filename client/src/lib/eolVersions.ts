/**
 * EOL (End-of-Life) software rules for the report builder.
 * Each rule checks whether a site record indicates potentially outdated software.
 * Add new entries as software reaches EOL or our detection improves.
 */

export interface EolRule {
  /** Human-readable label shown in the report */
  label: string;
  /** Brief explanation of why this is flagged */
  reason: string;
  /** Returns true if the site record matches this EOL condition */
  matches: (site: Record<string, unknown>) => boolean;
}

export const EOL_RULES: EolRule[] = [
  {
    label: 'Drupal 7',
    reason: 'Drupal 7 reached end-of-life January 2025.',
    matches: (s) => {
      const cms = String(s.cms ?? '').toLowerCase();
      const ver = String(s.wp_version ?? '');
      return cms.includes('drupal') && (ver.startsWith('7.') || ver === '');
    },
  },
  {
    label: 'WordPress < 6.0',
    reason: 'WordPress versions below 6.0 no longer receive security backports.',
    matches: (s) => {
      const cms = String(s.cms ?? '').toLowerCase();
      if (!cms.includes('wordpress')) return false;
      const ver = String(s.wp_version ?? '');
      if (!ver) return false;
      const major = parseInt(ver.split('.')[0], 10);
      return !isNaN(major) && major < 6;
    },
  },
  {
    label: 'SharePoint 2013/2016',
    reason: 'SharePoint 2013 reached end-of-life April 2023; SharePoint 2016 reaches EOL July 2025.',
    matches: (s) => {
      const cms = String(s.cms ?? '').toLowerCase();
      return cms.includes('sharepoint 2013') || cms.includes('sharepoint 2016');
    },
  },
];

/**
 * Returns the EOL rules that match a given site record.
 */
export function getEolFlags(site: Record<string, unknown>): EolRule[] {
  return EOL_RULES.filter((rule) => rule.matches(site));
}

/**
 * Given an array of site records, returns the count of sites with at least one EOL flag.
 */
export function countEolRisk(sites: Record<string, unknown>[]): number {
  return sites.filter((s) => getEolFlags(s).length > 0).length;
}
