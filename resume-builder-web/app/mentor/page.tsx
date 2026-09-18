import type { Metadata } from 'next';
import MentorClient from './MentorClient';

export const metadata: Metadata = {
  // R-110 — its own canonical. Root layout sets `canonical: '/'`
  // and Next merges metadata, so every page without an override
  // told Google it WAS the homepage — the landers competed with
  // the home page instead of ranking for their own queries.
  alternates: { canonical: '/mentor' },
  title: 'Mentor Mode — career & tech path',
  description:
    'Premium AI mentor for resume + career questions. Pick a target role and get the technologies, ' +
    'skills, and learning resources to focus on next.',
};

// Mentor Mode is gated to STUDENT/PRO plans on the client (PremiumGate)
// and on the server via the existing plan check on /ai/* endpoints.
// The free path still loads — it shows a paywall card, not a 404 — so
// search engines and curious users see what they'd unlock.

export default function MentorPage() {
  return <MentorClient />;
}
