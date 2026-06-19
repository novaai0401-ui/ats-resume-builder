import type { Metadata } from 'next';
import JdMatchClient from './JdMatchClient';

export const metadata: Metadata = {
  title: 'JD Match Score — paste a job description',
  description:
    'See how well your resume matches a job description. Get matched keywords, missing keywords, ' +
    'and three bullet suggestions to close the gap. Free with your own AI key, or Pocket Resume Plus (₹499/mo).',
};

export default function JdMatchPage() {
  return <JdMatchClient />;
}
