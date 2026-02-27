import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ScanProgress from './ScanProgress';
import { api } from '../../lib/api';
import { computeDiff } from '../../lib/diff';

interface RescanPanelProps {
  domain: string;
  site: Record<string, unknown>;
}

type ScanStep = 'redirect' | 'sitemap' | 'robots' | 'tech' | 'dns' | 'done';

interface ProgressState {
  step: ScanStep | null;
  completed: Set<string>;
  error: string | null;
  result: any | null;
}

export default function RescanPanel({ domain, site }: RescanPanelProps) {
  const qc = useQueryClient();
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState<ProgressState>({
    step: null,
    completed: new Set(),
    error: null,
    result: null,
  });

  const handleRescan = async () => {
    setScanning(true);
    setProgress({ step: 'redirect', completed: new Set(), error: null, result: null });

    try {
      // Import scanner dynamically
      const { scanSite } = await import('../../scanner/orchestrator');

      const result = await scanSite(
        String(site.url || `https://${domain}`),
        (step: string, done: boolean) => {
          setProgress((prev) => {
            const completed = new Set(prev.completed);
            if (done) completed.add(step);
            return { ...prev, step: done ? null : (step as ScanStep), completed };
          });
        }
      );

      // Compute diff between scan result fields and current site record
      const scanFields: Record<string, unknown> = {};
      if (result.tech_stack) {
        const ts = result.tech_stack;
        Object.assign(scanFields, {
          cms: ts.cms,
          web_server: ts.web_server,
          cdn_provider: ts.cdn,
          hosting_provider: ts.hosting_provider,
          https_enforced: ts.https_enforced,
          hsts: ts.hsts,
        });
        if (ts.uswds) {
          const u = ts.uswds;
          Object.assign(scanFields, {
            uswds_count: u.count,
            uswds_usa_classes: u.usa_classes,
            uswds_favicon: u.favicon,
            uswds_banner_heres_how: u.banner_heres_how,
          });
        }
        if (ts.dap) {
          Object.assign(scanFields, { dap: ts.dap.detected, ga_tag_id: ts.dap.ga_tag_id });
        }
        if (ts.wordpress) {
          Object.assign(scanFields, {
            wp_version: ts.wordpress.version,
            wp_theme: ts.wordpress.theme,
          });
        }
      }
      if (result.sitemap) {
        Object.assign(scanFields, {
          sitemap_xml_detected: result.sitemap.detected,
          sitemap_xml_status_code: result.sitemap.status_code,
          sitemap_xml_count: result.sitemap.page_count,
        });
      }
      if (result.robots) {
        Object.assign(scanFields, {
          robots_txt_detected: result.robots.detected,
          robots_txt_status_code: result.robots.status_code,
        });
      }
      if (result.dns) {
        Object.assign(scanFields, {
          ipv6: result.dns.ipv6,
          // hosting_provider from DNS is the fallback if tech_stack didn't get it
          ...(result.dns.hosting_provider && !scanFields.hosting_provider
            ? { hosting_provider: result.dns.hosting_provider }
            : {}),
        });
      }

      const relevantSiteFields: Record<string, unknown> = {};
      for (const key of Object.keys(scanFields)) {
        relevantSiteFields[key] = site[key];
      }
      const diff = computeDiff(relevantSiteFields, scanFields);

      // Post to server (auto-applies)
      await api.postScan(domain, result, diff);

      setProgress((prev) => ({ ...prev, step: 'done', result, error: null }));
      qc.invalidateQueries({ queryKey: ['site', domain] });
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['stats'] });

    } catch (err: any) {
      setProgress((prev) => ({ ...prev, error: err.message, step: null }));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Re-scan Site</div>
        <button
          onClick={handleRescan}
          disabled={scanning}
          className="btn-primary text-xs"
        >
          <span aria-hidden="true">{scanning ? '⟳ ' : '🔄 '}</span>
          {scanning ? 'Scanning…' : 'Re-scan'}
        </button>
      </div>

      {(scanning || progress.step || progress.result || progress.error) && (
        <ScanProgress progress={progress} />
      )}

      {!scanning && !progress.step && !progress.result && !progress.error && (
        <p className="text-xs text-gray-400">
          Re-scan fetches current data from the live site and updates the database.
        </p>
      )}
    </div>
  );
}
