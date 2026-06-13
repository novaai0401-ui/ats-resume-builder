import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * R-041 — owner-side management for the public B2B API keys.
 *
 * Keys are 'pra_' + 32 chars of unambiguous-alphabet entropy
 * (avoiding 0/1/l/o so support can read them out loud). We store
 * ONLY a SHA-256 hash + the first 8 chars of the plaintext
 * (the "prefix") so the dashboard can show "pra_abc12def…" — full
 * recovery is impossible. Lost a key? Rotate, don't recover.
 *
 * Per-key limits (monthlyCallLimit + perMinuteLimit) are the only
 * gates. There is NO plan tier on tenants — pricing is per-call
 * metered (the ApiUsage table feeds the bill).
 */

const KEY_PREFIX = 'pra_';
const KEY_LENGTH = 32;
const KEY_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export type CreateApiKeyInput = {
  label: string;
  tenantSlug: string;
  monthlyCallLimit?: number;
  perMinuteLimit?: number;
  expiresAt?: string | null;
};

export type ApiKeyView = {
  id: string;
  label: string;
  prefix: string;
  tenantSlug: string;
  monthlyCallLimit: number;
  perMinuteLimit: number;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the plaintext key ONCE on creation. Never persisted. */
  async createKey(input: CreateApiKeyInput): Promise<{ key: string; row: ApiKeyView }> {
    const plaintext = `${KEY_PREFIX}${randomString(KEY_LENGTH)}`;
    const keyHash = hashKey(plaintext);
    const prefix = plaintext.slice(0, 12); // "pra_" + 8 chars
    const row = await this.prisma.apiKey.create({
      data: {
        label: String(input.label || '').trim().slice(0, 120) || 'Unnamed key',
        keyHash,
        prefix,
        tenantSlug: normalizeSlug(input.tenantSlug),
        monthlyCallLimit: clampInt(input.monthlyCallLimit, 0, 10_000_000, 10_000),
        perMinuteLimit: clampInt(input.perMinuteLimit, 1, 6000, 60),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    return { key: plaintext, row: toView(row) };
  }

  async list(tenantSlug?: string): Promise<ApiKeyView[]> {
    const where = tenantSlug ? { tenantSlug: normalizeSlug(tenantSlug) } : undefined;
    const rows = await this.prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toView);
  }

  async revoke(id: string) {
    const row = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('API key not found.');
    await this.prisma.apiKey.update({ where: { id }, data: { enabled: false } });
    return { revoked: true };
  }

  /**
   * Authorise an incoming key. Returns the row when valid+enabled+
   * unexpired, null otherwise. NEVER throws — controllers decide
   * how to respond (uniform 401 by default; no oracle).
   */
  async authorise(plaintext: string): Promise<{ id: string; monthlyCallLimit: number; perMinuteLimit: number; tenantSlug: string } | null> {
    const clean = String(plaintext || '').trim();
    if (!clean.startsWith(KEY_PREFIX) || clean.length !== KEY_PREFIX.length + KEY_LENGTH) return null;
    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashKey(clean) },
      select: { id: true, enabled: true, expiresAt: true, monthlyCallLimit: true, perMinuteLimit: true, tenantSlug: true },
    });
    if (!row || !row.enabled) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  /**
   * Append a usage row + bump lastUsedAt. Errors are swallowed —
   * billing-row failures must never break a successful API call.
   */
  async recordUsage(input: {
    apiKeyId: string;
    endpoint: string;
    status: number;
    ipHash?: string | null;
    userAgent?: string | null;
    durationMs?: number;
  }) {
    try {
      await Promise.all([
        this.prisma.apiUsage.create({
          data: {
            apiKeyId: input.apiKeyId,
            endpoint: input.endpoint.slice(0, 80),
            status: input.status,
            ipHash: input.ipHash ?? null,
            userAgent: input.userAgent ? input.userAgent.slice(0, 200) : null,
            durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
          },
        }),
        this.prisma.apiKey.update({ where: { id: input.apiKeyId }, data: { lastUsedAt: new Date() } }),
      ]);
    } catch {
      /* billing is best-effort */
    }
  }

  /** Current calendar-month bill metrics for one key. */
  async monthlyUsage(apiKeyId: string) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [billable, errors, perKey] = await Promise.all([
      this.prisma.apiUsage.count({
        where: { apiKeyId, createdAt: { gte: monthStart }, status: { gte: 200, lt: 300 } },
      }),
      this.prisma.apiUsage.count({
        where: { apiKeyId, createdAt: { gte: monthStart }, status: { gte: 400 } },
      }),
      this.prisma.apiKey.findUnique({ where: { id: apiKeyId }, select: { monthlyCallLimit: true } }),
    ]);
    return {
      monthStart: monthStart.toISOString(),
      billableCalls: billable,
      erroredCalls: errors,
      monthlyCallLimit: perKey?.monthlyCallLimit ?? 0,
    };
  }

  /** Whether THIS key is over its monthly cap (0 = unlimited). */
  async isOverMonthlyCap(apiKeyId: string, monthlyCallLimit: number): Promise<boolean> {
    if (!monthlyCallLimit || monthlyCallLimit <= 0) return false;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const count = await this.prisma.apiUsage.count({
      where: { apiKeyId, createdAt: { gte: monthStart }, status: { gte: 200, lt: 300 } },
    });
    return count >= monthlyCallLimit;
  }
}

// ── helpers (exported for tests) ────────────────────────────────────

export function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  return out;
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`api-ip:${ip}`).digest('hex').slice(0, 24);
}

function normalizeSlug(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'default';
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value as number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value as number)));
}

function toView(row: any): ApiKeyView {
  return {
    id: row.id,
    label: row.label,
    prefix: row.prefix,
    tenantSlug: row.tenantSlug,
    monthlyCallLimit: row.monthlyCallLimit,
    perMinuteLimit: row.perMinuteLimit,
    enabled: row.enabled,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export const __testables = { randomString, hashKey, hashIp, normalizeSlug };
