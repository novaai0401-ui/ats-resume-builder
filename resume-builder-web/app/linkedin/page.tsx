import type { Metadata } from 'next';
import LinkedInOptimizeClient from './LinkedInOptimizeClient';

export const metadata: Metadata = {
  // R-110 — its own canonical. Root layout sets `canonical: '/'`
  // and Next merges metadata, so every page without an override
  // told Google it WAS the homepage — the landers competed with
  // the home page instead of ranking for their own queries.
  alternates: { canonical: '/linkedin' },
  title: 'LinkedIn Profile Optimizer — paste your profile, get an honest scorecard',
  description:
    'Paste your LinkedIn profile and get a section-by-section score (Headline, About, Experience, Skills) ' +
    'with specific fixes — plus AI rewrites that never invent facts, employers, numbers, or skills you don’t have.',
};

export default function LinkedInPage() {
  return <LinkedInOptimizeClient />;
}
