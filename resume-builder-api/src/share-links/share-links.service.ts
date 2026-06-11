import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeService } from '../resume/resume.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { rateLimitOrThrow } from '../limits/rate-limit';

/**
 * R-038 — public portfolio / share-link service.
 *
 * Reuses everything: PDF rendering via ResumeService.generatePdf,
 * analytics via AnalyticsService, rate limiting via the in-memory
 * limiter (TODO: Redis port alongside the auth limiter).
 *
 * Two write paths:
 *   - owner-side CRUD (createForResume, list, update, revoke) — guarded
 *     by JwtAuthGuard at the controller layer.
 *   - public-side resolve + render (resolveBySlug, recordView,
 *     resumePayload, renderPdf) — slug-only auth, rate-limited per slug.
 *
 * The public path NEVER returns the resumeId, userId, or any identifier
 * the visitor could use to enumerate other links. The slug is the only
 * token in scope.
 */

export type CreateShareLinkInput = {
  resumeId: string;
  resumeVersionId?: string | null;
  headline?: string | null;
  allowSearchIndexing?: boolean;
  maskContact?: boolean;
  expiresAt?: string | null;
};

export type UpdateShareLinkInput = Partial<{
  enabled: boolean;
  headline: string | null;
  allowSearchIndexing: boolean;
  maskContact: boolean;
  expiresAt: string | null;
  /**
   * Pin the public page to a frozen ResumeVersion snapshot. Setting
   * to null moves the link back to "live resume" mode. We validate
   * that the version belongs to the same resume + user before
   * accepting the change (no cross-resume pinning).
   */
  resumeVersionId: string | null;
}>;

/**
 * Public-facing resume payload. Strips everything the visitor doesn't
 * need (resumeId, internal flags) and applies maskContact.
 */
export type PublicResumePayload = {
  slug: string;
  headline: string | null;
  /** undefined → fall back to user's saved templateId */
  templateId?: string;
  resume: {
    contact: Record<string, unknown>;
    summary: string;
    skills: string[];
    experience: unknown[];
    education: unknown[];
    projects: unknown[];
    achievements: string[];
    certifications: unknown[];
    languages: string[];
  };
  meta: {
    allowSearchIndexing: boolean;
    contactMasked: boolean;
    snapshotLabel: string | null;
    snapshotCreatedAt: string | null;
  };
};

@Injectable()
export class ShareLinksService {
  private readonly logger = new Logger(ShareLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resume: ResumeService,
    private readonly analytics: AnalyticsService,
  ) {}

  // ─── owner-side ────────────────────────────────────────────────────

  async createForResume(userId: string, input: CreateShareLinkInput) {
    const resume = await this.prisma.resume.findFirst({
      where: { id: input.resumeId, userId },
      select: { id: true },
    });
    if (!resume) throw new NotFoundException('Resume not found.');

    if (input.resumeVersionId) {
      const version = await this.prisma.resumeVersion.findFirst({
        where: { id: input.resumeVersionId, resumeId: input.resumeId, userId },
        select: { id: true },
      });
      if (!version) throw new BadRequestException('Resume version not found for this resume.');
    }

    const slug = await this.generateUniqueSlug();
    return this.prisma.shareLink.create({
      data: {
        slug,
        userId,
        resumeId: input.resumeId,
        resumeVersionId: input.resumeVersionId ?? null,
        headline: trimOrNull(input.headline),
        allowSearchIndexing: Boolean(input.allowSearchIndexing),
        maskContact: Boolean(input.maskContact),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
  }

  list(userId: string) {
    return this.prisma.shareLink.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, input: UpdateShareLinkInput) {
    const existing = await this.prisma.shareLink.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Share link not found.');

    // Validate version pinning: the snapshot must belong to the same
    // resume + user. Without this check a malicious patch could pin a
    // public link to another user's snapshot — a serious data leak.
    if (input.resumeVersionId !== undefined && input.resumeVersionId) {
      const version = await this.prisma.resumeVersion.findFirst({
        where: { id: input.resumeVersionId, resumeId: existing.resumeId, userId },
        select: { id: true },
      });
      if (!version) throw new BadRequestException('Resume version not found for this resume.');
    }

    return this.prisma.shareLink.update({
      where: { id },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.headline !== undefined ? { headline: trimOrNull(input.headline) } : {}),
        ...(input.allowSearchIndexing !== undefined ? { allowSearchIndexing: input.allowSearchIndexing } : {}),
        ...(input.maskContact !== undefined ? { maskContact: input.maskContact } : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
        ...(input.resumeVersionId !== undefined ? { resumeVersionId: input.resumeVersionId } : {}),
      },
    });
  }

  async revoke(userId: string, id: string) {
    // Soft revoke: enabled=false. We keep the row so the visit log is
    // preserved for the owner's audit even after a recruiter is no
    // longer welcome.
    return this.update(userId, id, { enabled: false });
  }

  /**
   * Paginated visit log for the owner. Returns the same shape the
   * Settings card UI consumes: kind + timestamp + truncated UA +
   * coarse geo. NEVER exposes the raw IP (we don't store it) or the
   * full ipHash (it would let the owner cross-reference visits across
   * sessions of the same recruiter via the hash, which is a weaker
   * but real privacy leak).
   */
  async listEvents(userId: string, shareLinkId: string, limit = 50) {
    const link = await this.prisma.shareLink.findFirst({
      where: { id: shareLinkId, userId },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Share link not found.');
    const cap = Math.min(Math.max(1, Number(limit) || 50), 200);
    return this.prisma.shareLinkEvent.findMany({
      where: { shareLinkId },
      orderBy: { createdAt: 'desc' },
      take: cap,
      select: {
        id: true,
        kind: true,
        userAgent: true,
        country: true,
        city: true,
        referrer: true,
        createdAt: true,
      },
    });
  }

  // ─── public-side ──────────────────────────────────────────────────

  /**
   * Resolve a slug to a ShareLink ONLY if it is currently servable.
   * Returns null instead of throwing for the not-found / disabled /
   * expired cases so the controller emits a uniform 404 without
   * leaking which condition fired (no enumeration oracle).
   */
  async resolveBySlug(slug: string) {
    const clean = String(slug || '').trim();
    if (!clean) return null;
    const link = await this.prisma.shareLink.findUnique({ where: { slug: clean } });
    if (!link) return null;
    if (!link.enabled) return null;
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
    return link;
  }

  /**
   * Public read of the resume body behind a slug. Applies maskContact
   * and pins to the snapshot when one is attached. Returns the trimmed
   * shape the public page consumes — never the raw DB row.
   */
  async publicPayload(slug: string): Promise<PublicResumePayload | null> {
    const link = await this.resolveBySlug(slug);
    if (!link) return null;

    let resumeBody: any;
    let templateId: string | undefined;
    let snapshotLabel: string | null = null;
    let snapshotCreatedAt: string | null = null;

    if (link.resumeVersionId) {
      const version = await this.prisma.resumeVersion.findUnique({
        where: { id: link.resumeVersionId },
      });
      if (!version) return null;
      resumeBody = version.snapshot;
      snapshotLabel = version.label;
      snapshotCreatedAt = version.createdAt.toISOString();
    } else {
      const dbResume = await this.prisma.resume.findUnique({ where: { id: link.resumeId } });
      if (!dbResume) return null;
      resumeBody = dbResume;
      templateId = dbResume.templateId || undefined;
    }

    const safeResume = sanitiseResumeForPublic(resumeBody, link.maskContact);
    return {
      slug: link.slug,
      headline: link.headline,
      templateId,
      resume: safeResume,
      meta: {
        allowSearchIndexing: link.allowSearchIndexing,
        contactMasked: link.maskContact,
        snapshotLabel,
        snapshotCreatedAt,
      },
    };
  }

  /**
   * Render the PDF for a public slug. Bypasses the OWNER's export
   * quota (R-003 decision logged: company downloads via share link
   * do not burn the owner's quota) but enforces a per-slug rate limit
   * to defeat scrapers.
   *
   * Fires an analytics event + writes a ShareLinkEvent.
   */
  async renderPdf(slug: string, req?: Request) {
    const link = await this.resolveBySlug(slug);
    if (!link) throw new NotFoundException('This link is not available.');

    rateLimitOrThrow({
      key: `share:pdf:${link.slug}`,
      // 30/day — same number used in R-038 acceptance. Per-slug, not
      // per-IP, so a recruiter cannot brute-force around it with a
      // proxy. A real attacker can still rotate slugs, but each slug
      // is independent so the blast radius is one user.
      limit: 30,
      windowMs: 24 * 60 * 60 * 1000,
      message: 'This shared resume has reached today\'s download cap. Try again tomorrow.',
    });

    // Use the same generatePdf the owner uses, but in a bypass mode
    // so quota is not consumed. ResumeService.generatePdf is the only
    // PDF code path in the app — fork would be a maintenance trap.
    const pdf = await this.resume.generatePdfBypassingQuota(link.userId, link.resumeId);

    await this.recordEvent(link.id, 'download', req);
    this.analytics.track(
      {
        type: 'share_link_download',
        path: `/p/${link.slug}`,
        anonId: anonIdFor(req, link.slug),
        properties: { slug: link.slug },
      },
      req,
    );
    return pdf;
  }

  /**
   * Record a view. Called from the page-render endpoint so we do not
   * double-count CDN/browser prefetches that fetch raw JSON in the
   * background.
   */
  async recordView(slug: string, req?: Request) {
    const link = await this.resolveBySlug(slug);
    if (!link) return;
    rateLimitOrThrow({
      // View limit is generous — 200/day per slug. The recorder is
      // best-effort and never blocks page render even if it throws.
      key: `share:view:${link.slug}`,
      limit: 200,
      windowMs: 24 * 60 * 60 * 1000,
      message: 'View rate limit hit.',
    });
    try {
      await this.recordEvent(link.id, 'view', req);
      this.analytics.track(
        {
          type: 'share_link_view',
          path: `/p/${link.slug}`,
          anonId: anonIdFor(req, link.slug),
          properties: { slug: link.slug },
        },
        req,
      );
    } catch (err) {
      this.logger.warn(`recordView failed for ${link.slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private async generateUniqueSlug(maxAttempts = 5) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const slug = randomSlug();
      const existing = await this.prisma.shareLink.findUnique({ where: { slug } });
      if (!existing) return slug;
    }
    throw new ForbiddenException('Could not allocate a unique share slug, please retry.');
  }

  private async recordEvent(shareLinkId: string, kind: 'view' | 'download', req?: Request) {
    const ip = extractIp(req);
    const ua = req?.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 200) : null;
    const referrer = req?.headers['referer'] ? String(req.headers['referer']).slice(0, 200) : null;
    const ipHash = createHash('sha256').update(`${shareLinkId}:${ip || 'unknown'}:${ua || ''}`).digest('hex').slice(0, 24);

    await this.prisma.shareLinkEvent.create({
      data: {
        shareLinkId,
        kind,
        ipHash,
        userAgent: ua,
        referrer,
        country: null, // geo enrichment is a follow-up; AdminAnalytics already plans this
        city: null,
      },
    });

    // Roll up the cached counters so the owner's dashboard does not
    // need a group-by per render.
    await this.prisma.shareLink.update({
      where: { id: shareLinkId },
      data: {
        ...(kind === 'view'
          ? { viewCount: { increment: 1 }, lastVisitedAt: new Date() }
          : { downloadCount: { increment: 1 }, lastVisitedAt: new Date() }),
      },
    });
  }
}

// ────────────────────────────────────────────────────────────────────────

const SLUG_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // no 0/1/l — share-friendly
function randomSlug(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

function trimOrNull(value?: string | null) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, 280) : null;
}

function extractIp(req?: Request) {
  if (!req) return '';
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return fwd || req.ip || req.socket?.remoteAddress || '';
}

/**
 * Deterministic per-(slug, visitor) anon id for analytics so a recruiter
 * who refreshes the page is counted as one visitor in the dashboard.
 * Same input → same hash; different slugs from the same IP → different
 * ids (we deliberately do NOT cross-link visitors across owners).
 */
function anonIdFor(req: Request | undefined, slug: string) {
  const ip = extractIp(req);
  const ua = req?.headers['user-agent'] ? String(req.headers['user-agent']) : '';
  return createHash('sha256').update(`share:${slug}:${ip}:${ua}`).digest('hex').slice(0, 24);
}

/**
 * Strip everything the visitor doesn't need from a resume body and
 * (optionally) mask the contact email + phone. Never serialises the
 * resumeId, userId, internal ATS metadata, etc.
 */
function sanitiseResumeForPublic(resumeBody: any, maskContact: boolean) {
  const r = resumeBody || {};
  const contact = (r.contact && typeof r.contact === 'object') ? { ...(r.contact as Record<string, unknown>) } : {};
  if (maskContact) {
    delete (contact as any).email;
    delete (contact as any).phone;
  }
  return {
    contact,
    summary: String(r.summary || ''),
    skills: Array.isArray(r.skills) ? r.skills.filter(Boolean).map(String) : [],
    experience: Array.isArray(r.experience) ? r.experience : [],
    education: Array.isArray(r.education) ? r.education : [],
    projects: Array.isArray(r.projects) ? r.projects : [],
    achievements: Array.isArray(r.achievements) ? r.achievements.filter(Boolean).map(String) : [],
    certifications: Array.isArray(r.certifications) ? r.certifications : [],
    languages: Array.isArray(r.languages) ? r.languages.filter(Boolean).map(String) : [],
  };
}

// Re-export for tests.
export const __testables = { randomSlug, sanitiseResumeForPublic, anonIdFor };
