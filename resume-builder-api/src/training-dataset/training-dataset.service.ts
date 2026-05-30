import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { redactPII } from '../pattern-learner/redact';
import { assignSplit, type SplitGroup } from './split-assignment';
import { buildStructuredLabel, isLabelHighEnoughQuality } from './auto-labeler';
import {
  serializeJsonl,
  type ExportableSample,
} from './jsonl-export';

/**
 * TrainingDataset — captures consented resume samples and exports them
 * as JSONL for offline model training.
 *
 * Consent is checked on EVERY write. Withdrawal stops new captures
 * immediately; existing rows are purged via the dedicated wipe call
 * (user-initiated) or by the periodic retention sweep (future).
 */

export interface CaptureUploadInput {
  userId: string;
  rawText: string;
  sourceFileType: string;
  sourceFileBytes: number;
  layoutHints?: unknown;
}

export interface CaptureConfirmationInput {
  userId: string;
  resumeId: string;
  resumePayload: Parameters<typeof buildStructuredLabel>[0];
}

const CONSENT_VERSION = 1;

/**
 * The exact text the user is shown when training participation is
 * default-on. Stored here so it ships with the API and the migration
 * record stays auditable: bumping `CONSENT_VERSION` requires updating
 * this string in the same commit.
 */
export const TRAINING_CONSENT_NOTICE = {
  version: 1,
  title: 'Help improve resume parsing',
  body:
    'You are opted in by default to help improve our resume parser. ' +
    'We only learn from PATTERNS and structure — never your personal ' +
    'details. Names, emails, phone numbers, and links are stripped ' +
    'before anything is saved for training. You can opt out any time ' +
    'in Account Settings, or delete every sample we have from your ' +
    'account with one click.',
} as const;

@Injectable()
export class TrainingDatasetService {
  private readonly logger = new Logger(TrainingDatasetService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns current consent state plus whether the user still owes us
   * an acknowledgement of the one-time notice. The client shows the
   * modal when `noticeSeen` is false.
   */
  async getConsent(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        trainingConsent: true,
        trainingConsentAt: true,
        trainingConsentVersion: true,
        trainingConsentNoticeSeen: true,
      },
    });
    return {
      enabled: u?.trainingConsent ?? true,
      version: u?.trainingConsentVersion ?? CONSENT_VERSION,
      noticeSeen: u?.trainingConsentNoticeSeen ?? false,
      acceptedAt: u?.trainingConsentAt ?? null,
      notice: TRAINING_CONSENT_NOTICE,
    };
  }

  /**
   * Record opt-in / opt-out. Withdrawal does NOT purge existing rows;
   * users get a separate destructive endpoint for that.
   */
  async setConsent(userId: string, enabled: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trainingConsent: enabled,
        trainingConsentAt: enabled ? new Date() : null,
        trainingConsentVersion: enabled ? CONSENT_VERSION : 0,
      },
    });
  }

  /**
   * Mark the one-time notice as acknowledged. Idempotent.
   */
  async acknowledgeNotice(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { trainingConsentNoticeSeen: true },
    });
    return { ok: true };
  }

  /**
   * Capture the moment of upload — text + file metadata, NO label yet.
   * Returns the sample id so the editor flow can update it later with
   * the confirmed structured label.
   */
  async captureUpload(input: CaptureUploadInput): Promise<{ id: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { trainingConsent: true, trainingConsentVersion: true },
    });
    if (!user?.trainingConsent) return null;

    const id = newId();
    const splitGroup: SplitGroup = assignSplit(id, input.sourceFileType);
    try {
      await this.prisma.trainingSample.create({
        data: {
          id,
          userId: input.userId,
          sourceFileType: input.sourceFileType,
          sourceFileBytes: input.sourceFileBytes,
          redactedText: redactPII(input.rawText),
          layoutHints: (input.layoutHints ?? null) as Prisma.InputJsonValue | undefined,
          status: 'pending',
          splitGroup,
          consentVersion: user.trainingConsentVersion || CONSENT_VERSION,
        },
      });
      return { id };
    } catch (error) {
      this.logger.warn(`captureUpload failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Promote a pending sample to a labeled sample using the user's
   * confirmed resume payload. Called when the user saves the resume
   * in the editor after an upload. Skips low-quality labels — those
   * stay in pending state for manual review.
   */
  async captureConfirmation(input: CaptureConfirmationInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { trainingConsent: true },
    });
    if (!user?.trainingConsent) return;

    const label = buildStructuredLabel(input.resumePayload);
    if (!isLabelHighEnoughQuality(label)) return;

    // Promote the MOST RECENT pending sample for this user that doesn't
    // already have a label. We do not back-fill arbitrary historical
    // samples — only the active upload-then-confirm flow.
    const pending = await this.prisma.trainingSample.findFirst({
      where: { userId: input.userId, status: 'pending', structuredLabel: { equals: Prisma.JsonNull } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) return;

    await this.prisma.trainingSample.update({
      where: { id: pending.id },
      data: {
        structuredLabel: label as Prisma.InputJsonValue,
        labelSource: 'auto',
        status: 'labeled',
        labeledAt: new Date(),
      },
    });
  }

  /** Hard delete every TrainingSample for a user. User-initiated only. */
  async purgeUserSamples(userId: string): Promise<{ deleted: number }> {
    const result = await this.prisma.trainingSample.deleteMany({ where: { userId } });
    return { deleted: result.count };
  }

  /** Admin: dataset statistics for the export UI. */
  async stats() {
    const grouped = await this.prisma.trainingSample.groupBy({
      by: ['status', 'splitGroup'],
      _count: { _all: true },
    });
    const counts: Record<string, Record<string, number>> = {};
    for (const row of grouped as Array<{ status: string; splitGroup: string; _count: { _all: number } }>) {
      counts[row.status] = counts[row.status] || {};
      counts[row.status][row.splitGroup] = row._count._all;
    }
    return { counts };
  }

  /**
   * Admin export. Serializes ALL labeled samples to JSONL. For very
   * large corpora a future commit should stream this; v1 fits in memory.
   */
  async exportLabeledJsonl(maxRows = 10_000): Promise<string> {
    const rows = await this.prisma.trainingSample.findMany({
      where: { status: 'labeled' },
      orderBy: { createdAt: 'asc' },
      take: maxRows,
      select: {
        id: true,
        splitGroup: true,
        sourceFileType: true,
        redactedText: true,
        structuredLabel: true,
        layoutHints: true,
      },
    });
    const samples: ExportableSample[] = rows.map((r) => ({
      id: r.id,
      splitGroup: r.splitGroup,
      sourceFileType: r.sourceFileType,
      redactedText: r.redactedText,
      structuredLabel: r.structuredLabel,
      layoutHints: r.layoutHints,
    }));
    return serializeJsonl(samples);
  }

  /** Admin gate. Throws unless the requesting user is flagged admin. */
  async assertAdmin(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    if (!u?.isAdmin) throw new ForbiddenException('Admin only');
  }
}

function newId(): string {
  return `ts_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
