import type { Metadata } from 'next';
import MentorChatClient from './MentorChatClient';

export const metadata: Metadata = {
  // R-110 — its own canonical. Root layout sets `canonical: '/'`
  // and Next merges metadata, so every page without an override
  // told Google it WAS the homepage — the landers competed with
  // the home page instead of ranking for their own queries.
  alternates: { canonical: '/mentor/chat' },
  title: 'Mentor Chat',
  description:
    'Chat with an AI career mentor that knows your resume and recent job applications. ' +
    'Use your own AI key (free) or CallbackCV Plus (₹499/mo).',
};

export default function MentorChatPage() {
  return <MentorChatClient />;
}
