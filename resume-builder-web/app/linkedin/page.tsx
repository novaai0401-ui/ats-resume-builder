import type { Metadata } from 'next';
import LinkedInOptimizeClient from './LinkedInOptimizeClient';

export const metadata: Metadata = {
  title: 'LinkedIn Profile Optimizer — paste your profile, get an honest scorecard',
  description:
    'Paste your LinkedIn profile and get a section-by-section score (Headline, About, Experience, Skills) ' +
    'with specific fixes — plus AI rewrites that never invent facts, employers, numbers, or skills you don’t have.',
};

export default function LinkedInPage() {
  return <LinkedInOptimizeClient />;
}
