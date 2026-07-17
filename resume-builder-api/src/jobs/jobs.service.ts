import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const JOB_STATUSES = [
  'wishlist',
  'applied',
  'phone_screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobApplicationInput {
  company: string;
  role: string;
  jdUrl?: string | null;
  jdText?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  status?: JobStatus;
  source?: string | null;
  referral?: string | null;
  resumeId?: string | null;
  resumeVersionId?: string | null;
  coverLetterId?: string | null;
  notes?: string | null;
  nextActionAt?: string | null;
  appliedAt?: string | null;
  closedAt?: string | null;
}

/**
 * Benchmark (R-050 scope): statuses that count toward the response-rate
 * denominator ("reached at least applied") and numerator ("employer
 * responded"). Mirrors the math in stats(): wishlist/withdrawn are out of
 * the denominator; phone_screen/interview/offer count as a response.
 */
export const BENCHMARK_DENOMINATOR_STATUSES = [
  'applied',
  'phone_screen',
  'interview',
  'offer',
  'rejected',
] as const;
export const BENCHMARK_RESPONSE_STATUSES = ['phone_screen', 'interview', 'offer'] as const;
/** Privacy + significance gates: no benchmark until both are met. */
export const BENCHMARK_MIN_APPLICATIONS = 5;
export const BENCHMARK_MIN_COHORT_USERS = 10;

/** Median of a list of numbers; null for an empty list. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Response rate (as a 0–100 pct, 1 decimal) from a user's application statuses. */
export function responseRateFromStatuses(statuses: string[]): {
  applications: number;
  responses: number;
  responseRatePct: number;
} {
  const qualifying = statuses.filter((s) =>
    (BENCHMARK_DENOMINATOR_STATUSES as readonly string[]).includes(s),
  );
  const responses = qualifying.filter((s) =>
    (BENCHMARK_RESPONSE_STATUSES as readonly string[]).includes(s),
  ).length;
  const applications = qualifying.length;
  const responseRatePct =
    applications > 0 ? Math.round((responses / applications) * 1000) / 10 : 0;
  return { applications, responses, responseRatePct };
}

export interface BenchmarkReport {
  available: boolean;
  reason?: string;
  yours: { applications: number; responses: number; responseRatePct: number };
  platform?: { medianResponseRatePct: number; cohortUsers: number };
}

function coerceStatus(raw: unknown, fallback: JobStatus = 'wishlist'): JobStatus {
  if (typeof raw !== 'string') return fallback;
  return (JOB_STATUSES as readonly string[]).includes(raw) ? (raw as JobStatus) : fallback;
}

function coerceDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function trimString(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, max);
}

function sanitize(input: JobApplicationInput, { partial }: { partial: boolean }) {
  const data: Record<string, unknown> = {};

  const company = trimString(input.company, 200);
  if (company !== undefined) data.company = company;
  if (!partial) {
    if (!company) throw new BadRequestException('company is required');
  }

  const role = trimString(input.role, 200);
  if (role !== undefined) data.role = role;
  if (!partial) {
    if (!role) throw new BadRequestException('role is required');
  }

  if ('jdUrl' in input) data.jdUrl = trimString(input.jdUrl, 500);
  if ('jdText' in input) data.jdText = trimString(input.jdText, 20000);
  if ('location' in input) data.location = trimString(input.location, 200);
  if ('salaryRange' in input) data.salaryRange = trimString(input.salaryRange, 200);
  if ('source' in input) data.source = trimString(input.source, 100);
  if ('referral' in input) data.referral = trimString(input.referral, 200);
  if ('resumeId' in input) data.resumeId = trimString(input.resumeId, 100);
  if ('resumeVersionId' in input) data.resumeVersionId = trimString(input.resumeVersionId, 100);
  if ('coverLetterId' in input) data.coverLetterId = trimString(input.coverLetterId, 100);
  if ('notes' in input) data.notes = trimString(input.notes, 5000);
  if ('status' in input) data.status = coerceStatus(input.status);

  for (const key of ['nextActionAt', 'appliedAt', 'closedAt'] as const) {
    if (key in input) {
      const d = coerceDate(input[key]);
      if (d !== undefined) data[key] = d;
    }
  }

  if (!partial && data.status === undefined) data.status = 'wishlist';

  return data;
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, status?: string) {
    const where: { userId: string; status?: string } = { userId };
    if (status && (JOB_STATUSES as readonly string[]).includes(status)) {
      where.status = status;
    }
    return this.prisma.jobApplication.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async stats(userId: string) {
    const rows = await this.prisma.jobApplication.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    const counts: Record<JobStatus, number> = {
      wishlist: 0,
      applied: 0,
      phone_screen: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
    };
    for (const row of rows) {
      const key = coerceStatus(row.status);
      counts[key] = row._count._all;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const active = counts.wishlist + counts.applied + counts.phone_screen + counts.interview;
    const closed = counts.offer + counts.rejected + counts.withdrawn;
    const responseRate =
      counts.applied + counts.phone_screen + counts.interview + counts.offer + counts.rejected > 0
        ? (counts.phone_screen + counts.interview + counts.offer) /
          (counts.applied + counts.phone_screen + counts.interview + counts.offer + counts.rejected)
        : 0;
    const offerRate =
      counts.offer + counts.rejected > 0 ? counts.offer / (counts.offer + counts.rejected) : 0;
    return {
      total,
      active,
      closed,
      byStatus: counts,
      responseRate: Math.round(responseRate * 100) / 100,
      offerRate: Math.round(offerRate * 100) / 100,
    };
  }

  /**
   * "Your response rate vs. platform median." The platform figure is an
   * anonymized aggregate only: per-user rates for users with >= 5 applied
   * applications, then the median. Never returns another user's data, and
   * stays locked (available=false, honest reason) until both the caller
   * and the cohort clear the privacy/significance thresholds.
   */
  async benchmark(userId: string): Promise<BenchmarkReport> {
    // Only userId + status leave the database; nothing identifying is aggregated.
    const rows = await this.prisma.jobApplication.findMany({
      where: { status: { in: [...BENCHMARK_DENOMINATOR_STATUSES] } },
      select: { userId: true, status: true },
    });

    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      const list = byUser.get(row.userId) || [];
      list.push(row.status);
      byUser.set(row.userId, list);
    }

    const yours = responseRateFromStatuses(byUser.get(userId) || []);

    const cohortRates: number[] = [];
    for (const statuses of byUser.values()) {
      const rate = responseRateFromStatuses(statuses);
      if (rate.applications >= BENCHMARK_MIN_APPLICATIONS) {
        cohortRates.push(rate.responseRatePct);
      }
    }
    const cohortUsers = cohortRates.length;
    const medianRate = median(cohortRates);

    if (yours.applications < BENCHMARK_MIN_APPLICATIONS) {
      return {
        available: false,
        reason: `Log at least ${BENCHMARK_MIN_APPLICATIONS} applications to unlock your community comparison (you have ${yours.applications}).`,
        yours,
      };
    }
    if (cohortUsers < BENCHMARK_MIN_COHORT_USERS || medianRate === null) {
      return {
        available: false,
        reason: `Community benchmarks unlock once ${BENCHMARK_MIN_COHORT_USERS}+ users have ${BENCHMARK_MIN_APPLICATIONS}+ tracked applications (currently ${cohortUsers}).`,
        yours,
      };
    }

    return {
      available: true,
      yours,
      platform: { medianResponseRatePct: medianRate, cohortUsers },
    };
  }

  async upcoming(userId: string, days = 14) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + days);
    return this.prisma.jobApplication.findMany({
      where: {
        userId,
        nextActionAt: { not: null, lte: horizon },
        status: { notIn: ['rejected', 'withdrawn'] },
      },
      orderBy: { nextActionAt: 'asc' },
      take: 50,
    });
  }

  async create(userId: string, input: JobApplicationInput) {
    const data = sanitize(input, { partial: false });
    return this.prisma.jobApplication.create({
      data: { ...data, userId } as never,
    });
  }

  async update(userId: string, id: string, input: JobApplicationInput) {
    const existing = await this.prisma.jobApplication.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Job application not found');
    const data = sanitize(input, { partial: true });

    if (data.status && data.status !== existing.status) {
      if (data.status === 'applied' && !existing.appliedAt && data.appliedAt === undefined) {
        data.appliedAt = new Date();
      }
      const terminal = ['offer', 'rejected', 'withdrawn'];
      if (terminal.includes(String(data.status)) && !existing.closedAt && data.closedAt === undefined) {
        data.closedAt = new Date();
      }
    }

    return this.prisma.jobApplication.update({
      where: { id },
      data: data as never,
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.jobApplication.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Job application not found');
    await this.prisma.jobApplication.delete({ where: { id } });
    return { ok: true };
  }
}
