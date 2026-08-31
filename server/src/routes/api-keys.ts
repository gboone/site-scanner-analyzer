import { Router, Request, Response } from 'express';
import type { ApiKey } from 'shared';
import { query, execute } from '../db';
import { getClientIp } from '../middleware/ipAllowlist';
import { generateApiKeyToken, hashToken, isAllowedOwnerEmail } from '../utils/apiKeys';
import { metaFor } from '../apiMeta';

export const apiKeysRouter = Router();

const MAX_LABEL_LENGTH = 255;

/**
 * GET /api/v1/api-keys
 * Lists every per-user key (active and revoked) — label, owner email, and
 * timestamps only. Never returns token_hash, created_ip, or revoked_ip
 * (forensic-only, not part of the public API surface).
 */
apiKeysRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await query<ApiKey>(
    'SELECT id, label, owner_email, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC'
  );
  res.json({ data: rows, meta: metaFor('apiKeys.list') });
});

/**
 * POST /api/v1/api-keys
 * Body: { label, owner_email }. Mints a new key and returns its raw token —
 * the only response that ever carries it. owner_email is validated for
 * domain shape only (@a8c.com/@automattic.com), not proven ownership.
 */
apiKeysRouter.post('/', async (req: Request, res: Response) => {
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const ownerEmail = typeof req.body?.owner_email === 'string' ? req.body.owner_email.trim() : '';

  if (!label || label.length > MAX_LABEL_LENGTH) {
    res.status(400).json({ error: 'label is required and must be 255 characters or fewer' });
    return;
  }
  if (!isAllowedOwnerEmail(ownerEmail)) {
    res.status(400).json({ error: 'owner_email must be an @a8c.com or @automattic.com address' });
    return;
  }

  const token = generateApiKeyToken();
  const tokenHash = hashToken(token);
  const createdIp = getClientIp(req);

  const result = await execute(
    'INSERT INTO api_keys (label, owner_email, token_hash, created_ip) VALUES (:label, :ownerEmail, :tokenHash, :createdIp)',
    { label, ownerEmail, tokenHash, createdIp }
  );

  const [row] = await query<{ created_at: string }>('SELECT created_at FROM api_keys WHERE id = :id', {
    id: result.insertId,
  });

  res.json({
    id: result.insertId,
    label,
    owner_email: ownerEmail,
    created_at: row?.created_at ?? null,
    token,
    meta: metaFor('apiKeys.create'),
  });
});

/**
 * DELETE /api/v1/api-keys/:id
 * Soft-revokes a key (revoked_at/revoked_ip set, row kept for audit).
 * 404 if the id never existed; idempotent otherwise — revoking an
 * already-revoked key still returns 204.
 */
apiKeysRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const [existing] = await query<{ id: number }>('SELECT id FROM api_keys WHERE id = :id', { id });
  if (!existing) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  await execute(
    `UPDATE api_keys
     SET revoked_at = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%SZ'), revoked_ip = :revokedIp
     WHERE id = :id AND revoked_at IS NULL`,
    { id, revokedIp: getClientIp(req) }
  );

  res.status(204).end();
});
