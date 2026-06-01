/**
 * Stratified train/val/test split assignment.
 *
 * Determinism matters here: a sample must land in the same split every
 * time, even across re-imports or moves between tables. We derive the
 * split from a stable hash of the sample id, so identity = assignment.
 *
 * Target ratios: 80% train / 10% val / 10% test. The hash is reduced
 * modulo 100 and bucketed.
 *
 * "Stratified by source format" — we want each file type (pdf, docx,
 * image, txt) represented proportionally in val and test. The hash is
 * salted with the format, so within a format the split is independent.
 */

import { createHash } from 'node:crypto';

export type SplitGroup = 'train' | 'val' | 'test';

const TRAIN_PCT = 80;
const VAL_PCT = 10;
// test = remainder

export function assignSplit(sampleId: string, sourceFormat: string): SplitGroup {
  const h = createHash('sha256').update(`${sourceFormat}:${sampleId}`).digest();
  const bucket = h.readUInt16BE(0) % 100;
  if (bucket < TRAIN_PCT) return 'train';
  if (bucket < TRAIN_PCT + VAL_PCT) return 'val';
  return 'test';
}

/**
 * Counts samples that would land in each split for a given list of
 * (id, format) pairs. Used to surface the actual split distribution
 * in the admin export UI so the operator can sanity-check it.
 */
export function previewSplit(
  rows: Array<{ id: string; sourceFileType: string }>,
): Record<SplitGroup, number> {
  const counts: Record<SplitGroup, number> = { train: 0, val: 0, test: 0 };
  for (const row of rows) {
    counts[assignSplit(row.id, row.sourceFileType)] += 1;
  }
  return counts;
}
