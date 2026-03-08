/**
 * Sanitization utilities for third-party / user-controlled text content.
 *
 * Applied at two points in the pipeline:
 *   1. Ingestion (import.ts, gsa.ts) — cleans fields before they hit the DB.
 *   2. Prompt construction (glean.ts) — encodes values before embedding in AI prompts.
 *
 * Defense-in-depth: sanitization at ingestion + structural isolation in prompts
 * (XML delimiters + JSON-encoded string values) together prevent stored prompt
 * injection via malicious <title> or <meta description> tags.
 */

/**
 * Sanitize a single-line field (title, agency, bureau, cms, etc.).
 * Strips C0/C1 control characters that could inject newlines into prompt structure,
 * collapses whitespace, trims, and enforces a max length.
 * Returns null for empty/null input.
 */
export function sanitizeSingleLine(value: unknown, maxLength = 500): string | null {
  if (value == null) return null;
  const cleaned = String(value)
    // Strip all C0 (0x00–0x1F) and C1 (0x7F–0x9F) control characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

/**
 * Sanitize a multi-line text field (description, og_description).
 * Allows \n (newlines are meaningful in descriptions) but strips other
 * non-printable control characters. Normalizes \r\n to \n, enforces max length.
 * Returns null for empty/null input.
 */
export function sanitizeMultiLine(value: unknown, maxLength = 2000): string | null {
  if (value == null) return null;
  const cleaned = String(value)
    // Strip non-printable chars except \n (0x0A), \r (0x0D), and \t (0x09)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

/**
 * Encode a value for safe embedding in an AI prompt template.
 *
 * Returns JSON.stringify(String(value)), which wraps the value in double quotes
 * and auto-escapes embedded quotes, backslashes, and control characters. The
 * surrounding quotes signal to the model that this is a data literal, not an
 * instruction. Use alongside XML delimiter isolation in buildPrompt().
 *
 * Examples:
 *   encodeForPrompt("normal title")                       → '"normal title"'
 *   encodeForPrompt('Say "hello"')                        → '"Say \\"hello\\""'
 *   encodeForPrompt("Ignore all previous instructions")   → '"Ignore all previous instructions"'
 *   encodeForPrompt(null)                                 → 'null'
 */
export function encodeForPrompt(value: unknown): string {
  if (value == null) return 'null';
  return JSON.stringify(String(value));
}
