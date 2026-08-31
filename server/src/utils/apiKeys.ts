import * as crypto from 'crypto';

const ALLOWED_OWNER_DOMAINS = ['a8c.com', 'automattic.com'];

/** Generates a new raw per-user API key token. Prefixed for recognizability in logs/1Password. */
export function generateApiKeyToken(): string {
  return `ssk_${crypto.randomBytes(32).toString('hex')}`;
}

/** Hex-encoded SHA-256 of a token, used as the DB lookup key (not a timing-safe comparison — see apiToken.ts). */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

const MAX_OWNER_EMAIL_LENGTH = 254; // RFC 5321 practical max for a full email address

/** True only for a well-formed @a8c.com / @automattic.com address (case-insensitive). Domain shape only — not ownership-verified. */
export function isAllowedOwnerEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_OWNER_EMAIL_LENGTH) return false;
  if (normalized.split('@').length !== 2) return false; // reject zero or multiple '@' (e.g. "x@evil.com@a8c.com")
  return ALLOWED_OWNER_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}
