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

/** True only for an @a8c.com / @automattic.com address (case-insensitive). Domain shape only — not ownership-verified. */
export function isAllowedOwnerEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return ALLOWED_OWNER_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}
