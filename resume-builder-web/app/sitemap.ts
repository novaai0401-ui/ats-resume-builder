import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pocketresume.app';

/**
 * /sitemap.xml — Next.js App Router auto-serves this. Listed routes
 * are public/marketing surfaces only. Authenticated routes (dashboard,
 * editor, jobs, settings) are excluded both here and in robots.ts so
 * Google doesn't waste crawl budget chasing 401s.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/auth/login`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/auth/register`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/templates`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/career`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/mentor`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/jd-match`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/interview-prep`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/mentor/chat`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/download`, lastModified, changeFrequency: 'weekly', priority: 0.6 },
  ];
}
