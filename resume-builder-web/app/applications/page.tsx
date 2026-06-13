import type { Metadata } from 'next';
import HubCardGrid from '@/src/components/HubCardGrid';
import { NAV_HUBS } from '@/src/lib/nav-hubs';

export const metadata: Metadata = {
  title: 'Applications',
  description: 'Track jobs you have applied to, score your resume against a JD, and see which resume version actually gets replies.',
};

export default function ApplicationsHub() {
  const hub = NAV_HUBS.find((h) => h.key === 'applications')!;
  return (
    <HubCardGrid
      title="Applications"
      intro="Everything that happens after you have a resume — tracking, tailoring, and measuring which versions actually get replies."
      tools={hub.tools}
    />
  );
}
