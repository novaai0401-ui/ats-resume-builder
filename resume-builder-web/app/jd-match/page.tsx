import type { Metadata } from 'next';
import JdMatchClient from './JdMatchClient';

export const metadata: Metadata = {
  // R-110 — its own canonical. Root layout sets `canonical: '/'`
  // and Next merges metadata, so every page without an override
  // told Google it WAS the homepage — the landers competed with
  // the home page instead of ranking for their own queries.
  alternates: { canonical: '/jd-match' },
  title: 'JD Match Score — paste a job description',
  description:
    'See how well your resume matches a job description. Get matched keywords, missing keywords, ' +
    'and three bullet suggestions to close the gap. Free with your own AI key, or CallbackCV Plus (₹499/mo).',
};

export default function JdMatchPage() {
  return <JdMatchClient />;
}
