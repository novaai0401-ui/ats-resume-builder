import Link from 'next/link';
import type { Metadata } from 'next';
import { PROFESSION_INDUSTRIES, TEMPLATE_CATALOG } from 'resume-builder-shared';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

/**
 * Hub for the per-industry pages. Its job is link equity distribution: without
 * a page linking to all 21 industry pages they are orphans, reachable only via
 * the sitemap, which is how pages get crawled late or not at all.
 */
export const metadata: Metadata = {
  title: 'Resume Templates by Industry (ATS-Safe, Free)',
  description:
    `ATS-safe resume templates for ${PROFESSION_INDUSTRIES.length} industries — IT, healthcare, ` +
    'finance, engineering, sales and more. Single-column layouts tested against Workday, ' +
    'Greenhouse, iCIMS and Taleo, with the sections recruiters in each field screen for.',
  alternates: { canonical: '/resume-templates' },
  openGraph: {
    title: 'Resume Templates by Industry — ATS-safe and free',
    description: `Pick a template matched to your field across ${PROFESSION_INDUSTRIES.length} industries.`,
    url: `${SITE_URL}/resume-templates`,
    type: 'website',
  },
};

export default function ResumeTemplatesByIndustryPage() {
  const totalRoles = PROFESSION_INDUSTRIES.reduce((n, i) => n + i.roles.length, 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Resume templates by industry',
            item: `${SITE_URL}/resume-templates`,
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'Resume templates by industry',
        itemListElement: PROFESSION_INDUSTRIES.map((i, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${i.label} resume templates`,
          url: `${SITE_URL}/resume-templates/${i.id}`,
        })),
      },
    ],
  };

  return (
    <main className="container" style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>Resume templates by industry</h1>
      <p style={{ fontSize: 18 }}>
        {TEMPLATE_CATALOG.length} ATS-safe templates, matched to {PROFESSION_INDUSTRIES.length}{' '}
        industries and {totalRoles} roles. Every layout is single-column with standard section
        headings, so it parses cleanly in Workday, Greenhouse, iCIMS, Taleo and BambooHR.
      </p>

      <h2>Choose your field</h2>
      <ul>
        {PROFESSION_INDUSTRIES.map((i) => (
          <li key={i.id} style={{ marginBottom: 8 }}>
            <Link href={`/resume-templates/${i.id}`}>{i.label} resume templates</Link>
            {i.description ? ` — ${i.description}` : ''}
          </li>
        ))}
      </ul>

      <h2>Not sure which template to use?</h2>
      <p>
        Start with any template marked ATS safety <strong>high</strong> — those are plain
        single-column layouts that parse cleanly everywhere. You can switch templates at any time
        without retyping anything, because your content is stored separately from the layout.
      </p>
      <p>
        <Link href="/ats-resume-templates">Browse all {TEMPLATE_CATALOG.length} templates</Link>
        {' · '}
        <Link href="/ats-resume-checker">Check an existing resume against an ATS</Link>
      </p>
    </main>
  );
}
