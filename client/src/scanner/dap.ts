/**
 * DAP (Digital Analytics Program) and Google Analytics detection.
 * Extracts dap_parameters from the script src query string.
 */
import type { DapResult } from 'shared';

const DAP_DOMAINS = ['dap.digitalgov.gov'];
const DAP_SCRIPT_PATTERN = /dap\.digitalgov\.gov\/Universal-Federated-Analytics[^"'\s]*/i;
const GA4_TAG_PATTERN = /G-[A-Z0-9]{10,}/g;
const UA_TAG_PATTERN = /UA-\d{4,}-\d+/g;

export function detectDap(html: string): DapResult {
  const htmlLower = html.toLowerCase();

  // Is DAP loaded?
  const detected = DAP_DOMAINS.some((d) => htmlLower.includes(d));

  if (!detected) {
    return { detected: false, parameters: null, version: null, ga_tag_id: null };
  }

  // Extract parameters from the DAP script src
  let parameters: Record<string, string> | null = null;
  const scriptMatch = html.match(DAP_SCRIPT_PATTERN);
  if (scriptMatch) {
    try {
      const srcUrl = scriptMatch[0];
      const queryStart = srcUrl.indexOf('?');
      if (queryStart !== -1) {
        const queryString = srcUrl.slice(queryStart + 1);
        const params: Record<string, string> = {};
        queryString.split('&').forEach((pair) => {
          const [key, value] = pair.split('=');
          if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
        });
        if (Object.keys(params).length > 0) parameters = params;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Extract GA4 and UA tag IDs
  const ga4Tags = [...new Set(html.match(GA4_TAG_PATTERN) || [])];
  const uaTags = [...new Set(html.match(UA_TAG_PATTERN) || [])];
  const allTags = [...ga4Tags, ...uaTags];

  // Extract DAP version
  let version: string | null = null;
  const versionMatch = html.match(/\/\/[^"']*dap\.digitalgov\.gov[^"']*\?[^"']*ver=([^&"'\s]+)/i);
  if (versionMatch) version = versionMatch[1];

  // Also look for the version comment in the script
  const versionCommentMatch = html.match(/DAP[^<]{0,100}v(\d+\.\d+)/i);
  if (!version && versionCommentMatch) version = versionCommentMatch[1];

  return {
    detected: true,
    parameters,
    version,
    ga_tag_id: allTags.length > 0 ? allTags.join(',') : null,
  };
}
