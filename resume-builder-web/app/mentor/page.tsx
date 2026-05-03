import type { Metadata } from 'next';
import MentorClient from './MentorClient';

export const metadata: Metadata = {
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
