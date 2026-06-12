import type { Metadata } from 'next';
import HubCardGrid from '@/src/components/HubCardGrid';
import { NAV_HUBS } from '@/src/lib/nav-hubs';

export const metadata: Metadata = {
  title: 'Coach',
  description: 'Career mentorship, interview prep, and a quiet companion for the job-search journey.',
};

export default function CoachHub() {
  const hub = NAV_HUBS.find((h) => h.key === 'coach')!;
  return (
    <HubCardGrid
      title="Coach"
      intro="Career mentorship, interview prep, and a quiet companion for the long days. Some surfaces are paid — they're labelled clearly."
      tools={hub.tools}
    />
  );
}
