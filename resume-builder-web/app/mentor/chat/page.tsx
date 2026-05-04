import type { Metadata } from 'next';
import MentorChatClient from './MentorChatClient';

export const metadata: Metadata = {
  title: 'Mentor Chat',
  description:
    'Chat with an AI career mentor that knows your resume and recent job applications. ' +
    'Pro plan only.',
};

export default function MentorChatPage() {
  return <MentorChatClient />;
}
