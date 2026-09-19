import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeService } from './resume.service';
import { applySnapshot, buildSnapshotPayload, SNAPSHOT_FIELDS } from './resume-snapshot';
import type { ResumeSnapshotPayload as SnapshotShape } from './resume-snapshot';

const DEFAULT_VERSION_LIMIT = 25;
const MAX_LABEL_LENGTH = 120;

export interface ResumeVersionSummary {
  id: string;
  resumeId: string;
  label: string | null;
  atsScoreSnapshot: number | null;
  createdAt: Date;
}

/**
 * R-108 — the snapshot shape now lives in `resume-snapshot.ts` so the two
 * places that build snapshots (here and the tailoring service) cannot
 * drift apart again. This interface listed ten fields while the Resume
 * model had eighteen worth keeping; achievements, licences, publications
 * and every design setting were silently dropped on restore.
 */
export type { ResumeSnapshotPayload } from './resume-snapshot';

@Injectable()
export class ResumeVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resumeService: ResumeService,
  ) {}

  async list(userId: string, resumeId: string): Promise<ResumeVersionSummary[]> {
    await this.assertResumeOwnership(userId, resumeId);
    const rows = await this.prisma.resumeVersion.findMany({
      where: { resumeId, userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        resumeId: true,
        label: true,
        atsScoreSnapshot: true,
        createdAt: true,
      },
    });
    return rows;
  }

  async get(userId: string, resumeId: string, versionId: string) {
    await this.assertResumeOwnership(userId, resumeId);
    const row = await this.prisma.resumeVersion.findFirst({
      where: { id: versionId, resumeId, userId },
    });
    if (!row) throw new NotFoundException('Resume version not found');
    return row;
  }

  async snapshot(
    userId: string,
    resumeId: string,
    label?: string,
    atsScoreSnapshot?: number,
  ) {
    await this.assertResumeOwnership(userId, resumeId);

    const trimmedLabel = typeof label === 'string'
      ? label.trim().slice(0, MAX_LABEL_LENGTH) || null
      : null;
    let score = Number.isFinite(atsScoreSnapshot)
      ? clamp(Math.round(atsScoreSnapshot as number), 0, 100)
      : null;

    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, userId },
    });
    if (!resume) throw new NotFoundException('Resume not found');

    // Auto-stamp a JD-agnostic ATS score when the caller didn't supply one,
    // so the Outcome Loop's score-history chart populates on every snapshot
    // without the user having to run a manual scan. Best-effort: a missing
    // scorer or a failure must never block snapshotting.
    if (score === null && typeof this.resumeService.computeAtsScoreValue === 'function') {
      try {
        score = this.resumeService.computeAtsScoreValue(resume);
      } catch {
        score = null;
      }
    }

    const snapshotPayload = buildSnapshotPayload(resume as unknown as Record<string, unknown>);

    const created = await this.prisma.resumeVersion.create({
      data: {
        resumeId,
        userId,
        label: trimmedLabel,
        snapshot: snapshotPayload as unknown as object,
        atsScoreSnapshot: score,
      },
      select: {
        id: true,
        resumeId: true,
        label: true,
        atsScoreSnapshot: true,
        createdAt: true,
      },
    });

    // Trim oldest versions beyond DEFAULT_VERSION_LIMIT to keep storage bounded.
    await this.pruneOldVersions(resumeId, userId);

    return created;
  }

  async restore(userId: string, resumeId: string, versionId: string) {
    await this.assertResumeOwnership(userId, resumeId);
    const version = await this.prisma.resumeVersion.findFirst({
      where: { id: versionId, resumeId, userId },
    });
    if (!version) throw new NotFoundException('Resume version not found');

    const snapshot = version.snapshot as Partial<SnapshotShape> | null;
    if (!snapshot || typeof snapshot !== 'object') {
      throw new BadRequestException('Stored snapshot is malformed and cannot be restored.');
    }

    // Auto-snapshot the current state first so a restore is always reversible.
    await this.snapshot(userId, resumeId, `Auto-saved before restore @ ${new Date().toISOString()}`);

    // R-108: restore every snapshotted field, not the ten this used to
    // list. Fields missing from an older snapshot keep their live value —
    // that snapshot does not know what they were, and writing `undefined`
    // for them would delete content the user never asked to lose.
    const live = await this.prisma.resume.findFirst({ where: { id: resumeId, userId } });
    const restored = applySnapshot((live ?? {}) as Record<string, unknown>, snapshot as Record<string, unknown>);
    const patch: Record<string, unknown> = {};
    for (const field of SNAPSHOT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(snapshot, field)) {
        patch[field] = restored[field];
      }
    }
    return this.resumeService.update(userId, resumeId, patch as never);
  }

  async remove(userId: string, resumeId: string, versionId: string) {
    await this.assertResumeOwnership(userId, resumeId);
    const existing = await this.prisma.resumeVersion.findFirst({
      where: { id: versionId, resumeId, userId },
    });
    if (!existing) throw new NotFoundException('Resume version not found');
    await this.prisma.resumeVersion.delete({ where: { id: versionId } });
    return { ok: true };
  }

  private async assertResumeOwnership(userId: string, resumeId: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, userId },
      select: { id: true },
    });
    if (!resume) {
      // Treat as forbidden rather than 404 to avoid leaking which IDs exist
      // when a stray resumeId is probed.
      throw new ForbiddenException('You do not have access to this resume.');
    }
  }

  private async pruneOldVersions(resumeId: string, userId: string) {
    const all = await this.prisma.resumeVersion.findMany({
      where: { resumeId, userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (all.length <= DEFAULT_VERSION_LIMIT) return;
    const stale = all.slice(DEFAULT_VERSION_LIMIT).map((row) => row.id);
    await this.prisma.resumeVersion.deleteMany({ where: { id: { in: stale } } });
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
