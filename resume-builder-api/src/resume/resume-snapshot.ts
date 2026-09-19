/**
 * R-108 — the single definition of what a resume version snapshot contains.
 *
 * Why this file exists: the snapshot payload was built inline in two
 * places (`resume-versions.service.ts` and `ai/tailor.service.ts`) and
 * both listed fields by hand. Both lists were incomplete and they were
 * incomplete in different ways — achievements, licences, publications and
 * every design setting were dropped, so restoring a version silently
 * deleted content the resume had.
 *
 * That is not a cosmetic bug. C-007 says the attribution link between a
 * ResumeVersion and a JobApplication must stay intact: if the snapshot is
 * lossy, the version a user logged an application against is not the
 * document that was sent, and the outcome data describes something that
 * never existed.
 *
 * Adding a column to the Resume model means adding it HERE, and the
 * round-trip test in `tests/version-snapshot-roundtrip.unit.test.cjs`
 * fails until you do.
 */

/** Every Resume column that belongs in a snapshot, in schema order. */
export const SNAPSHOT_FIELDS = [
  'title',
  'contact',
  'summary',
  'skills',
  'languages',
  'experience',
  'education',
  'projects',
  'certifications',
  'licenses',
  'publications',
  'achievements',
  'templateId',
  'fontFamily',
  'density',
  'accentColor',
  'sectionOrder',
  'photoUrl',
] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export type ResumeSnapshotPayload = {
  [K in SnapshotField]: unknown;
};

/**
 * Columns deliberately NOT snapshotted, with the reason. Listed so the
 * round-trip test can assert the two sets together cover the whole model
 * — an unlisted new column is a bug, not an omission someone chose.
 */
export const SNAPSHOT_EXCLUDED_FIELDS = new Set([
  'id', // identity of the live resume, not of a version
  'userId', // ownership is on the version row itself
  'createdAt',
  'updatedAt', // row metadata, restored implicitly
  'aiAssistUsed', // a property of the live document's history
]);

/** Build a snapshot from a full resume record. */
export function buildSnapshotPayload(resume: Record<string, unknown>): ResumeSnapshotPayload {
  const payload = {} as ResumeSnapshotPayload;
  for (const field of SNAPSHOT_FIELDS) {
    payload[field] = normalizeField(field, resume[field]);
  }
  return payload;
}

/**
 * Overlay a snapshot onto a resume record, producing the document as it
 * stood when the snapshot was taken. Used for restore AND for exporting a
 * specific version without touching the live resume.
 *
 * A field absent from an OLD snapshot (taken before that field was
 * covered) falls back to the live value rather than nulling it — those
 * snapshots genuinely do not know what the value was, and guessing
 * "empty" would delete real content on restore.
 */
export function applySnapshot<T extends Record<string, unknown>>(
  resume: T,
  snapshot: Record<string, unknown> | null | undefined,
): T {
  if (!snapshot || typeof snapshot !== 'object') return resume;
  const out: Record<string, unknown> = { ...resume };
  for (const field of SNAPSHOT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, field)) {
      out[field] = snapshot[field];
    }
  }
  return out as T;
}

/** Array columns are non-null in the schema; keep them arrays in the JSON. */
function normalizeField(field: SnapshotField, value: unknown): unknown {
  if (field === 'skills' || field === 'languages' || field === 'achievements' || field === 'sectionOrder') {
    return Array.isArray(value) ? value : [];
  }
  return value === undefined ? null : value;
}
