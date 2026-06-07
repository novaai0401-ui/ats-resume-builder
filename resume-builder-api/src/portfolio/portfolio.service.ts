import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { buildPortfolioSnapshot, generateSlug, isValidSlug } from './portfolio-util';

export interface CreatePortfolioInput {
  resumeId: string;
  title?: string;
  headline?: string;
  contactEmail?: string;
  published?: boolean;
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Portfolio creation is a paid perk (when payments are enabled). */
  private async assertCanCreate(userId: string) {
    const paymentsOn = await this.settings.isPaymentFeatureEnabled();
    if (!paymentsOn) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    if (!user || user.plan === 'FREE') {
      throw new ForbiddenException('PORTFOLIO_REQUIRES_PLAN: Sharable portfolios are a Student/Pro feature.');
    }
  }

  async create(userId: string, input: CreatePortfolioInput) {
    await this.assertCanCreate(userId);
    const resume = await this.prisma.resume.findFirst({ where: { id: input.resumeId, userId } });
    if (!resume) throw new NotFoundException('Resume not found');

    const title = (input.title || resume.title || 'My Portfolio').trim().slice(0, 120);
    const snapshot = buildPortfolioSnapshot(resume as never, input.headline);

    // Retry slug generation on the rare collision (random suffix makes this
    // exceedingly unlikely, but the unique index is the real guarantee).
    let slug = generateSlug(title);
    for (let i = 0; i < 5; i += 1) {
      const clash = await this.prisma.portfolio.findUnique({ where: { slug } });
      if (!clash) break;
      slug = generateSlug(title);
    }

    return this.prisma.portfolio.create({
      data: {
        userId,
        slug,
        title,
        headline: input.headline?.trim().slice(0, 160) || null,
        resumeId: input.resumeId,
        snapshot: snapshot as unknown as object,
        contactEmail: input.contactEmail?.trim().slice(0, 200) || null,
        published: input.published !== false,
      },
    });
  }

  async list(userId: string) {
    return this.prisma.portfolio.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, title: true, headline: true, published: true, views: true, createdAt: true, updatedAt: true },
    });
  }

  async update(userId: string, id: string, input: Partial<CreatePortfolioInput> & { refreshFromResume?: boolean }) {
    const existing = await this.prisma.portfolio.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Portfolio not found');

    const data: Record<string, unknown> = {};
    if (typeof input.title === 'string') data.title = input.title.trim().slice(0, 120);
    if (typeof input.headline === 'string') data.headline = input.headline.trim().slice(0, 160) || null;
    if (typeof input.contactEmail === 'string') data.contactEmail = input.contactEmail.trim().slice(0, 200) || null;
    if (typeof input.published === 'boolean') data.published = input.published;

    // Re-snapshot from the current resume on request (so the public page can be
    // refreshed after the user edits their resume).
    if (input.refreshFromResume && existing.resumeId) {
      const resume = await this.prisma.resume.findFirst({ where: { id: existing.resumeId, userId } });
      if (resume) data.snapshot = buildPortfolioSnapshot(resume as never, (data.headline as string) ?? existing.headline ?? undefined) as unknown as object;
    }

    return this.prisma.portfolio.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.portfolio.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Portfolio not found');
    await this.prisma.portfolio.delete({ where: { id } });
    return { ok: true };
  }

  /** Public read by slug. Increments view count; returns only public fields. */
  async getPublic(slug: string) {
    if (!isValidSlug(slug)) throw new NotFoundException('Portfolio not found');
    const p = await this.prisma.portfolio.findUnique({ where: { slug } });
    if (!p || !p.published) throw new NotFoundException('Portfolio not found');
    // Fire-and-forget view increment; never block the response on it.
    this.prisma.portfolio.update({ where: { id: p.id }, data: { views: { increment: 1 } } }).catch(() => {});
    return {
      slug: p.slug,
      title: p.title,
      headline: p.headline,
      contactEmail: p.contactEmail,
      snapshot: p.snapshot,
      createdAt: p.createdAt,
    };
  }
}
