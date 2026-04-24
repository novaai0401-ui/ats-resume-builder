import type { JobApplication, JobStats, JobStatus } from 'resume-builder-shared';

export const JOB_STATUSES: JobStatus[] = [
  'wishlist',
  'applied',
  'phone_screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const ACTIVE_STATUSES: JobStatus[] = [
  'wishlist',
  'applied',
  'phone_screen',
  'interview',
  'offer',
];

export const CLOSED_STATUSES: JobStatus[] = ['rejected', 'withdrawn'];

/** Pipeline funnel we surface as Kanban columns (terminal states are in a side panel). */
export const KANBAN_STATUSES: JobStatus[] = ACTIVE_STATUSES;

export function groupByStatus(jobs: JobApplication[]): Record<JobStatus, JobApplication[]> {
  const out: Record<JobStatus, JobApplication[]> = {
    wishlist: [],
    applied: [],
    phone_screen: [],
    interview: [],
    offer: [],
    rejected: [],
    withdrawn: [],
  };
  for (const job of jobs) {
    const key = (JOB_STATUSES as string[]).includes(job.status) ? job.status : 'wishlist';
    out[key].push(job);
  }
  return out;
}

export function buildStatsFromJobs(jobs: JobApplication[]): JobStats {
  const byStatus: Record<JobStatus, number> = {
    wishlist: 0,
    applied: 0,
    phone_screen: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const job of jobs) {
    if ((JOB_STATUSES as string[]).includes(job.status)) byStatus[job.status] += 1;
  }
  const total = jobs.length;
  const active = ACTIVE_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);
  const closed = CLOSED_STATUSES.reduce((sum, s) => sum + byStatus[s], 0) + byStatus.offer;
  const respondingDen =
    byStatus.applied + byStatus.phone_screen + byStatus.interview + byStatus.offer + byStatus.rejected;
  const responding = byStatus.phone_screen + byStatus.interview + byStatus.offer;
  const offerDen = byStatus.offer + byStatus.rejected;
  return {
    total,
    active,
    closed,
    byStatus,
    responseRate: respondingDen > 0 ? Math.round((responding / respondingDen) * 100) / 100 : 0,
    offerRate: offerDen > 0 ? Math.round((byStatus.offer / offerDen) * 100) / 100 : 0,
  };
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const now = Date.now();
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}
