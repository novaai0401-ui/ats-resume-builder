import type { Metadata } from 'next';
import InterviewPrepClient from './InterviewPrepClient';

export const metadata: Metadata = {
  title: 'Interview Prep Cards',
  description:
    '8 likely interview questions with answer outlines, generated from your resume and target role. ' +
    'Use your own AI key (free) or Pocket Resume Plus (₹499/mo).',
};

export default function InterviewPrepPage() {
  return <InterviewPrepClient />;
}
