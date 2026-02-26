/**
 * Export helpers for briefing documents.
 * BriefingView.tsx wires these to its export/print buttons.
 */

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
