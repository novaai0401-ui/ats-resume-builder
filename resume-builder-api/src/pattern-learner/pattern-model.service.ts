import { Injectable, Logger } from '@nestjs/common';
import { createModel, ResumePatternModel, type ModelJSON } from 'resume-pattern-model';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bridges the app's PII-redacted training corpus (TrainingSample +
 * ParseFailureSample rows) into the self-learning resume-pattern-model
 * library, and persists trained snapshots so the newest model can be
 * served / shipped as a static asset.
 *
 * Additive: nothing in the existing PatternLearner regex flow changes.
 * Training is explicit (admin-triggered) — never in the upload hot path.
 */

const MAX_CORPUS_DOCS = 500;
const MIN_TEXT_CHARS = 120;

@Injectable()
export class PatternModelService {
  private readonly logger = new Logger(PatternModelService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Load redacted corpus texts (training samples first, then failures). */
  private async loadCorpusTexts(): Promise<string[]> {
    const texts: string[] = [];
    const training = await this.prisma.trainingSample.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_CORPUS_DOCS,
      select: { redactedText: true },
    });
    for (const row of training) {
      if (row.redactedText && row.redactedText.length >= MIN_TEXT_CHARS) {
        texts.push(row.redactedText);
      }
    }
    if (texts.length < MAX_CORPUS_DOCS) {
      const failures = await this.prisma.parseFailureSample.findMany({
        orderBy: { createdAt: 'desc' },
        take: MAX_CORPUS_DOCS - texts.length,
        select: { redactedText: true },
      });
      for (const row of failures) {
        if (row.redactedText && row.redactedText.length >= MIN_TEXT_CHARS) {
          texts.push(row.redactedText);
        }
      }
    }
    return texts;
  }

  /**
   * Train a fresh model over the whole current corpus and persist it as a
   * new snapshot. Returns stats (never the raw model — that stays server
   * side and is fetched explicitly via getLatestSnapshot).
   */
  async train(): Promise<{ ok: boolean; docsSeen: number; vocabSize: number; shapes: number; snapshotId?: string }> {
    const texts = await this.loadCorpusTexts();
    if (!texts.length) {
      return { ok: false, docsSeen: 0, vocabSize: 0, shapes: 0 };
    }
    const model = createModel();
    model.learnMany(texts);
    const stats = model.stats();
    const snapshot = await this.prisma.patternModelSnapshot.create({
      data: {
        docsSeen: stats.docsSeen,
        vocabSize: stats.vocabSize,
        shapes: stats.headerShapes,
        model: model.toJSON() as unknown as object,
      },
      select: { id: true },
    });
    this.logger.log(`pattern-model trained: docs=${stats.docsSeen} vocab=${stats.vocabSize} shapes=${stats.headerShapes}`);
    return { ok: true, docsSeen: stats.docsSeen, vocabSize: stats.vocabSize, shapes: stats.headerShapes, snapshotId: snapshot.id };
  }

  /** Latest snapshot stats for the admin dashboard (no model payload). */
  async stats() {
    const latest = await this.prisma.patternModelSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, docsSeen: true, vocabSize: true, shapes: true, createdAt: true },
    });
    const corpus = await this.prisma.trainingSample.count();
    const failures = await this.prisma.parseFailureSample.count();
    return { latest, corpusSize: corpus, failureSamples: failures };
  }

  /** Full latest snapshot — the downloadable, embeddable trained model. */
  async getLatestSnapshot(): Promise<{ id: string; createdAt: Date; model: ModelJSON } | null> {
    const row = await this.prisma.patternModelSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, model: true },
    });
    if (!row) return null;
    return { id: row.id, createdAt: row.createdAt, model: row.model as unknown as ModelJSON };
  }

  /** Rehydrate the latest snapshot into a live model (e.g. for serving). */
  async loadLatestModel(): Promise<ResumePatternModel | null> {
    const snap = await this.getLatestSnapshot();
    if (!snap) return null;
    return ResumePatternModel.fromJSON(snap.model);
  }
}
