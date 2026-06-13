/**
 * Map a live job opening into a JobApplication payload for one-click tracking
 * from the extension popup. Pure, so it's unit-tested with node --test.
 */
export function openingToApplicationPayload(job) {
  return {
    company: (job?.company || 'Unknown').trim(),
    role: (job?.title || '').trim(),
    jdUrl: job?.url?.trim() || null,
    location: job?.location?.trim() || null,
    salaryRange: job?.salaryText?.trim() || null,
    source: (job?.source || 'live').trim(),
    status: 'wishlist',
  };
}
