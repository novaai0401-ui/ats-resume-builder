import type { Metadata } from 'next';
import MentorChatClient from './MentorChatClient';

export const metadata: Metadata = {
  title: 'Mentor Chat',
  description:
    'Chat with an AI career mentor that knows your resume and recent job applications. ' +
    'Use your own AI key (free) or CallbackCV Plus (₹499/mo).',
};

export default function MentorChatPage() {
  return <MentorChatClient />;
}
