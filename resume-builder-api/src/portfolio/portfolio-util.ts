/**
 * Pure helpers for the Portfolio feature: slug generation/validation and the
 * recruiter-facing resume snapshot builder. Kept dependency-free for testing.
 */

import { randomBytes } from 'crypto';

/** A recruiter-facing subset of a resume. Deliberately excludes anything we'd
 *  consider sensitive-by-default beyond what the user puts on a resume. */
export interface PortfolioSnapshot {
  fullName: string;
  headline: string;
  summary: string;
  skills: string[];
  experience: Array<{ company: string; role: string; startDate: string; endDate: string; highlights: string[] }>;
  education: Array<{ institution: string; degree: string; startDate: string; endDate: string }>;
  projects: Array<{ name: string; description: string; url: string }>;
}

const MAX_SLUG_BASE = 40;
const SLUG_RE = /^[a-z0-9-]{3,60}$/;

/** Turn a free-text title/name into a URL-safe slug base (no uniqueness). */
export function slugifyBase(input: string): string {
  const base = String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_BASE)
    .replace(/-+$/g, '');
  return base || 'portfolio';
}

/** Append a short random suffix so slugs are unguessable + collision-resistant. */
export function generateSlug(input: string, rand: () => string = () => randomBytes(3).toString('hex')): string {
  return `${slugifyBase(input)}-${rand()}`;
}

/** Validate a slug for the public route (defense against odd input). */
export function isValidSlug(slug: string): boolean {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

type RawResume = {
  contact?: { fullName?: string | null } | null;
  title?: string | null;
  summary?: string | null;
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
  projects?: unknown;
};

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
}

/** Build the recruiter-facing snapshot from a resume row, with a headline. */
export function buildPortfolioSnapshot(resume: RawResume, headline?: string): PortfolioSnapshot {
  const exp = Array.isArray(resume?.experience) ? resume!.experience as Array<Record<string, unknown>> : [];
  const edu = Array.isArray(resume?.education) ? resume!.education as Array<Record<string, unknown>> : [];
  const proj = Array.isArray(resume?.projects) ? resume!.projects as Array<Record<string, unknown>> : [];
  return {
    fullName: String(resume?.contact?.fullName ?? '').trim(),
    headline: String(headline ?? resume?.title ?? '').trim(),
    summary: String(resume?.summary ?? '').trim(),
    skills: strArray(resume?.skills),
    experience: exp.slice(0, 20).map((e) => ({
      company: String(e?.company ?? '').trim(),
      role: String(e?.role ?? '').trim(),
      startDate: String(e?.startDate ?? '').trim(),
      endDate: String(e?.endDate ?? '').trim(),
      highlights: strArray(e?.highlights).slice(0, 12),
    })),
    education: edu.slice(0, 10).map((e) => ({
      institution: String(e?.institution ?? '').trim(),
      degree: String(e?.degree ?? '').trim(),
      startDate: String(e?.startDate ?? '').trim(),
      endDate: String(e?.endDate ?? '').trim(),
    })),
    projects: proj.slice(0, 12).map((p) => ({
      name: String(p?.name ?? '').trim(),
      description: String(p?.description ?? p?.role ?? '').trim(),
      url: String(p?.url ?? '').trim(),
    })),
  };
}
