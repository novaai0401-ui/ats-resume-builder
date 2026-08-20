import type { MetadataRoute } from 'next';
import { TEMPLATE_CATALOG, PROFESSION_INDUSTRIES } from 'resume-builder-shared';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

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
    // /templates only redirects to /templates/preview, so list the destination.
    // Listing the redirect at priority 0.9 spent the site's strongest template
    // signal on a URL that immediately bounces.
    { url: `${SITE_URL}/templates/preview`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/ats-resume-templates`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/ats-resume-checker`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/resume-builder-india`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/compare`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/career`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/mentor`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/jd-match`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/interview-prep`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/mentor/chat`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/download`, lastModified, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/pricing`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    // Trust pages — thin on keywords but heavy on E-E-A-T; payment-gateway and
    // search-quality reviewers look for exactly these.
    { url: `${SITE_URL}/about`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/contact`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/accessibility`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/skill-demand`, lastModified, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/linkedin`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    // "Build resume in ChatGPT/Claude" — a query space with no incumbent yet.
    { url: `${SITE_URL}/ai-assistants`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    // One indexable URL per template. The long tail — "executive resume
    // template", "resume template for career change" — is where a newer domain
    // can realistically rank, and each query needs its own page to compete for
    // it. Generated from the catalog so a new template is never left out.
    ...TEMPLATE_CATALOG.map((template) => ({
      url: `${SITE_URL}/ats-resume-templates/${template.id}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    // "Resume template for <field>" — the other half of the winnable long tail.
    { url: `${SITE_URL}/resume-templates`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    ...PROFESSION_INDUSTRIES.map((industry) => ({
      url: `${SITE_URL}/resume-templates/${industry.id}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    // Role tier — one page per role, substantive because every role now
    // carries authored ATS keywords (the doorway-page risk that blocked this).
    ...PROFESSION_INDUSTRIES.flatMap((industry) =>
      industry.roles.map((role) => ({
        url: `${SITE_URL}/resume-templates/${industry.id}/${role.id}`,
        lastModified,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ),
  ];
}
