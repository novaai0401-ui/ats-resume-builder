/**
 * Canonical extraction targets the learner can propose patterns for.
 * Keep this list small and explicit — promoted patterns are looked up by
 * `kind` from field-mapper at parse time.
 */
export const PATTERN_KINDS = [
  'experience.dateRange',
  'experience.roleLine',
  'experience.companyLine',
  'education.degree',
  'education.institution',
  'contact.phone',
  'contact.location',
  'section.heading',
  'skills.delimiter',
] as const;

export type PatternKind = (typeof PATTERN_KINDS)[number];

export function isPatternKind(value: unknown): value is PatternKind {
  return typeof value === 'string' && (PATTERN_KINDS as readonly string[]).includes(value);
}
