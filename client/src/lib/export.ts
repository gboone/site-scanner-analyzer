/**
 * Export helpers for briefing documents and reports.
 * BriefingView.tsx wires these to its export/print buttons.
 */

import type { StatsResponse } from 'shared';
import type { ReportConfig } from '../store/uiStore';

/**
 * Download a briefing as a Markdown file.
 * Opens the server-side export endpoint in a new tab which serves the
 * file as an attachment — cleaner than a blob URL since the server already
 * owns the content.
 */
export function exportMarkdown(briefingId: number, base = '/api/v1'): void {
  window.open(`${base}/briefings/export/${briefingId}`, '_blank');
}

/**
 * Print the current page — best used in tandem with print-optimised CSS
 * that hides the sidebar/nav and expands the briefing prose to full width.
 */
export function exportPDF(): void {
  window.print();
}

// ─── PowerPoint export ─────────────────────────────────────────────────────

const THEME = {
  blue:      '005EA2',
  blueLight: '73B3E7',
  green:     '2E7D32',
  red:       'C62828',
  gray:      '6B7280',
  lightGray: 'F3F4F6',
  white:     'FFFFFF',
  dark:      '111827',
};

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function pctFmt(n: number | undefined | null): string {
  if (n == null) return '—';
  return `${n}%`;
}

/**
 * Export a dashboard / multi-site report as a PowerPoint file.
 * Uses pptxgenjs (dynamically imported to keep the main bundle lean).
 *
 * @param config  The current ReportConfig from uiStore
 * @param stats   The StatsResponse for the current scope
 */
export async function exportPPT(config: ReportConfig, stats: StatsResponse): Promise<void> {
  // Dynamic import keeps pptxgenjs out of the initial bundle
  const pptxgen = (await import('pptxgenjs')).default;
  const prs = new pptxgen();

  const scopeLabel = config.label
    ?? (config.scope === 'agency' ? config.agency ?? 'Agency'
      : config.scope === 'sql'   ? 'SQL Query Results'
      :                            'Selected Sites');

  const total = stats.total_sites;
  const generatedAt = new Date(config.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  // ── Slide 1: Title ──────────────────────────────────────────────────────
  const title = prs.addSlide();
  title.background = { color: THEME.blue };

  title.addText('Federal Website Analysis', {
    x: 0.5, y: 0.8, w: 9, h: 0.6,
    fontSize: 28, bold: true, color: THEME.white, fontFace: 'Arial',
  });

  title.addText(scopeLabel, {
    x: 0.5, y: 1.6, w: 9, h: 0.5,
    fontSize: 18, color: THEME.blueLight, fontFace: 'Arial',
  });

  title.addText(`${fmt(total)} sites · Generated ${generatedAt}`, {
    x: 0.5, y: 2.3, w: 9, h: 0.35,
    fontSize: 11, color: THEME.white, fontFace: 'Arial', italic: true,
  });

  // ── Slide 2: Executive Summary ──────────────────────────────────────────
  const summary = prs.addSlide();
  summary.addText('Executive Summary', {
    x: 0.5, y: 0.25, w: 9, h: 0.45,
    fontSize: 20, bold: true, color: THEME.dark, fontFace: 'Arial',
  });

  const summaryRows: [string, string, string][] = [
    ['Metric', 'Count', '%'],
    ['Total Sites',         fmt(total),                          '—'],
    ['Live',                fmt(stats.live_count),               pctFmt(stats.live_pct)],
    ['HTTPS Enforced',      fmt(stats.https_enforced_count),     pctFmt(stats.https_enforced_pct)],
    ['Has USWDS',           fmt(stats.uswds_any_count),          pctFmt(stats.uswds_any_pct)],
    ['Has DAP',             fmt(stats.dap_count),                pctFmt(stats.dap_pct)],
    ['Sitemap Detected',    fmt(stats.sitemap_detected_count),   pctFmt(stats.sitemap_detected_pct)],
  ];

  if (stats.eol_risk_count > 0) {
    summaryRows.push(['EOL CMS Risk', fmt(stats.eol_risk_count), '⚠️']);
  }

  if (stats.scan_coverage) {
    summaryRows.push(
      ['Never Scanned', fmt(stats.scan_coverage.never_scanned_count), ''],
      ['Stale (>90d)',  fmt(stats.scan_coverage.stale_count),         ''],
    );
  }

  summary.addTable(
    summaryRows.map((row, i) => row.map((cell) => ({
      text: cell,
      options: {
        bold: i === 0,
        fontSize: i === 0 ? 11 : 10,
        fontFace: 'Arial',
        color: i === 0 ? THEME.white : THEME.dark,
        fill: i === 0 ? { color: THEME.blue } : i % 2 === 0 ? { color: THEME.lightGray } : { color: THEME.white },
      },
    }))),
    {
      x: 0.5, y: 0.85, w: 9, h: 4.0,
      colW: [3.5, 2.5, 2.5],
      border: { type: 'solid', pt: 0.5, color: 'D1D5DB' },
    }
  );

  // ── Slide 3: CMS Breakdown ──────────────────────────────────────────────
  if (stats.by_cms?.length) {
    const cms = prs.addSlide();
    cms.addText('CMS Breakdown', {
      x: 0.5, y: 0.25, w: 9, h: 0.45,
      fontSize: 20, bold: true, color: THEME.dark, fontFace: 'Arial',
    });

    const cmsRows = [
      [{ text: 'CMS', options: { bold: true, color: THEME.white, fill: { color: THEME.blue }, fontSize: 11, fontFace: 'Arial' } },
       { text: 'Sites', options: { bold: true, color: THEME.white, fill: { color: THEME.blue }, fontSize: 11, fontFace: 'Arial' } }],
      ...stats.by_cms.slice(0, 15).map((r, i) => [
        { text: r.cms || 'Unknown', options: { fontSize: 10, fontFace: 'Arial', color: THEME.dark, fill: i % 2 === 0 ? { color: THEME.lightGray } : { color: THEME.white } } },
        { text: fmt(r.count),       options: { fontSize: 10, fontFace: 'Arial', color: THEME.dark, fill: i % 2 === 0 ? { color: THEME.lightGray } : { color: THEME.white } } },
      ]),
    ];

    cms.addTable(cmsRows, {
      x: 0.5, y: 0.85, w: 6, h: 4.0,
      colW: [4, 2],
      border: { type: 'solid', pt: 0.5, color: 'D1D5DB' },
    });
  }

  // ── Slide 4: Bureau Breakdown ───────────────────────────────────────────
  if (stats.by_bureau?.length) {
    const bureau = prs.addSlide();
    bureau.addText('Bureau Breakdown', {
      x: 0.5, y: 0.25, w: 9, h: 0.45,
      fontSize: 20, bold: true, color: THEME.dark, fontFace: 'Arial',
    });

    const bureauRows = [
      [
        { text: 'Bureau', options: { bold: true, color: THEME.white, fill: { color: THEME.blue }, fontSize: 10, fontFace: 'Arial' } },
        { text: 'Sites',  options: { bold: true, color: THEME.white, fill: { color: THEME.blue }, fontSize: 10, fontFace: 'Arial' } },
        { text: 'USWDS Avg', options: { bold: true, color: THEME.white, fill: { color: THEME.blue }, fontSize: 10, fontFace: 'Arial' } },
        { text: 'DAP %', options: { bold: true, color: THEME.white, fill: { color: THEME.blue }, fontSize: 10, fontFace: 'Arial' } },
      ],
      ...stats.by_bureau.slice(0, 15).map((b, i) => {
        const fill = i % 2 === 0 ? { color: THEME.lightGray } : { color: THEME.white };
        const opts = { fontSize: 9, fontFace: 'Arial', color: THEME.dark, fill };
        return [
          { text: b.bureau.split(' - ').pop() ?? b.bureau, options: opts },
          { text: fmt(b.count),                             options: opts },
          { text: `${Number(b.uswds_avg ?? 0).toFixed(1)}`,  options: opts },
          { text: `${b.dap_pct ?? 0}%`,                    options: opts },
        ];
      }),
    ];

    bureau.addTable(bureauRows, {
      x: 0.3, y: 0.85, w: 9.4, h: 4.5,
      colW: [4, 1.5, 2, 1.5],
      border: { type: 'solid', pt: 0.5, color: 'D1D5DB' },
    });
  }

  // ── Slide 5: Performance ────────────────────────────────────────────────
  const perf = stats.performance_summary;
  if (perf && (perf.lcp.good + perf.lcp.needs_improvement + perf.lcp.poor) > 0) {
    const perfSlide = prs.addSlide();
    perfSlide.addText('Performance', {
      x: 0.5, y: 0.25, w: 9, h: 0.45,
      fontSize: 20, bold: true, color: THEME.dark, fontFace: 'Arial',
    });

    const makePerf = (label: string, d: { good: number; needs_improvement: number; poor: number; no_data: number }, yOff: number) => {
      const tot = d.good + d.needs_improvement + d.poor + d.no_data || 1;
      perfSlide.addText(label, { x: 0.5, y: yOff, w: 9, h: 0.3, fontSize: 13, bold: true, color: THEME.dark, fontFace: 'Arial' });
      const rows = [
        ['Good', 'Needs Work', 'Poor', 'No Data'],
        [fmt(d.good), fmt(d.needs_improvement), fmt(d.poor), fmt(d.no_data)],
        [pctFmt(Math.round(d.good / tot * 100)), pctFmt(Math.round(d.needs_improvement / tot * 100)), pctFmt(Math.round(d.poor / tot * 100)), pctFmt(Math.round(d.no_data / tot * 100))],
      ];
      const colors = [THEME.green, 'F59E0B', THEME.red, THEME.gray];
      perfSlide.addTable(
        rows.map((row, ri) => row.map((cell, ci) => ({
          text: cell,
          options: {
            bold: ri === 0,
            fontSize: 10,
            fontFace: 'Arial',
            color: ri === 0 ? THEME.white : THEME.dark,
            fill: ri === 0 ? { color: colors[ci] } : { color: THEME.white },
          },
        }))),
        { x: 0.5, y: yOff + 0.35, w: 9, colW: [2.25, 2.25, 2.25, 2.25], border: { type: 'solid', pt: 0.5, color: 'D1D5DB' } }
      );
    };

    makePerf('Largest Contentful Paint (LCP)', perf.lcp, 0.85);
    makePerf('Cumulative Layout Shift (CLS)',   perf.cls, 2.5);
  }

  // ── Slide 6: Notes ──────────────────────────────────────────────────────
  const notes = prs.addSlide();
  notes.background = { color: THEME.lightGray };
  notes.addText('Notes', {
    x: 0.5, y: 0.25, w: 9, h: 0.45,
    fontSize: 20, bold: true, color: THEME.dark, fontFace: 'Arial',
  });
  notes.addText(
    [
      `• Report generated: ${generatedAt}`,
      `• Scope: ${scopeLabel}`,
      `• Total sites in scope: ${fmt(total)}`,
      `• Data sourced from the Site Scanner Analyzer`,
      `• USWDS scores reflect the scoring rubric used by pulse.cio.gov`,
      `• Stale scan threshold: 90 days`,
      `• EOL CMS: Drupal 7, WordPress <6.0, SharePoint 2013/2016`,
    ].join('\n'),
    {
      x: 0.5, y: 0.9, w: 9, h: 4.0,
      fontSize: 11, fontFace: 'Arial', color: THEME.gray,
      breakLine: true,
    }
  );

  await prs.writeFile({ fileName: `report-${Date.now()}.pptx` });
}
