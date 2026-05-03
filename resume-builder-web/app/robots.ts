import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pocketresume.app';

/**
 * /robots.txt — keep crawlers out of authenticated routes (which 401
 * for them anyway, but explicit is better than implicit) and away from
 * any debug surfaces. Allow everything else.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/auth/login', '/auth/register', '/templates', '/career', '/download'],
        disallow: [
          '/dashboard',
          '/resume/',
          '/jobs',
          '/cover-letter',
          '/settings',
          '/admin',
          '/auth/forgot-password',
          '/auth/reset-password',
          '/auth/callback',
          '/billing',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
