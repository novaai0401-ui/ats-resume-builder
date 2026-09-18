import type { Metadata } from 'next';
import InterviewPrepClient from './InterviewPrepClient';

export const metadata: Metadata = {
  // R-110 — its own canonical. Root layout sets `canonical: '/'`
  // and Next merges metadata, so every page without an override
  // told Google it WAS the homepage — the landers competed with
  // the home page instead of ranking for their own queries.
  alternates: { canonical: '/interview-prep' },
  title: 'Interview Prep Cards',
  description:
    '8 likely interview questions with answer outlines, generated from your resume and target role. ' +
    'Use your own AI key (free) or CallbackCV Plus (₹499/mo).',
};

export default function InterviewPrepPage() {
  return <InterviewPrepClient />;
}
