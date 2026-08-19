import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  PROFESSION_INDUSTRIES,
  TEMPLATE_CATALOG,
  getIndustryById,
  type ProfessionIndustry,
} from 'resume-builder-shared';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

/**
 * One page per industry: /resume-templates/information-technology
 *
 * Targets "resume template for <field>" queries, which are winnable in a way
 * that the bare head term is not.
 *
 * Deliberately built at INDUSTRY level rather than one page per role. There are
 * 161 roles in the catalog but only 20 carry keywords, so a page per role would
 * be 141 near-identical pages differing by a job title — textbook doorway pages,
 * which Google penalises across the whole domain rather than just ignoring.
 * Industry pages have real per-page substance: their own description, their own
 * ranked template recommendations, and their own role list. Role pages become
 * worth building once the role keyword data is filled in.
 */

export function generateStaticParams() {
  return PROFESSION_INDUSTRIES.map((i) => ({ industry: i.id }));
}

function titleFor(industry: ProfessionIndustry) {
  return `${industry.label} Resume Templates (ATS-Safe, Free)`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>;
}): Promise<Metadata> {
  const { industry: id } = await params;
  const industry = getIndustryById(id);
  if (!industry) return { title: 'Not found — CallbackCV' };

  const description =
    `${industry.description || `Resume templates for ${industry.label.toLowerCase()} roles.`} ` +
    `ATS-safe layouts tested across Workday, Greenhouse, iCIMS and Taleo, with the ` +
    `sections and keywords ${industry.label.toLowerCase()} recruiters screen for.`;

  return {
    title: titleFor(industry),
    description,
    alternates: { canonical: `/resume-templates/${industry.id}` },
    openGraph: {
      title: titleFor(industry),
      description,
      url: `${SITE_URL}/resume-templates/${industry.id}`,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: titleFor(industry), description },
  };
}

export default async function IndustryTemplatesPage({
  params,
}: {
  params: Promise<{ industry: string }>;
}) {
  const { industry: id } = await params;
  const industry = getIndustryById(id);
  if (!industry) notFound();

  const url = `${SITE_URL}/resume-templates/${industry.id}`;

  // Ordered best-first by the catalog; fall back to the ATS-safest templates so
  // the page is never empty for an industry with no explicit recommendations.
  const recommended = (industry.recommendedTemplates || [])
    .map((tid) => TEMPLATE_CATALOG.find((t) => t.id === tid))
    .filter((t): t is (typeof TEMPLATE_CATALOG)[number] => Boolean(t));
  const templates = recommended.length
    ? recommended
    : TEMPLATE_CATALOG.filter((t) => t.atsSafety === 'high').slice(0, 3);

  const siblings = PROFESSION_INDUSTRIES.filter((i) => i.id !== industry.id);

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
          { '@type': 'ListItem', position: 3, name: industry.label, item: url },
        ],
      },
      {
        '@type': 'ItemList',
        name: `Recommended resume templates for ${industry.label}`,
        itemListElement: templates.map((t, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: t.name,
          url: `${SITE_URL}/ats-resume-templates/${t.id}`,
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `Which resume template is best for ${industry.label.toLowerCase()} roles?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: templates.length
                ? `${templates[0].name} is the strongest starting point: ${templates[0].description}`
                : 'Any single-column, ATS-safe template with standard section headings.',
            },
          },
          {
            '@type': 'Question',
            name: `Do ${industry.label.toLowerCase()} resumes need to be ATS-friendly?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Yes if you are applying through a company careers portal or job board, because ' +
                'the file is parsed before a person reads it. Use a single-column layout with ' +
                'standard headings and avoid tables, text boxes and images.',
            },
          },
        ],
      },
    ],
  };

  return (
    <main className="container" style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" style={{ fontSize: 14, marginBottom: 16 }}>
        <Link href="/">Home</Link>
        {' / '}
        <Link href="/resume-templates">Resume templates by industry</Link>
        {' / '}
        <span>{industry.label}</span>
      </nav>

      <h1>{industry.label} resume templates</h1>
      <p style={{ fontSize: 18 }}>
        {industry.description || `ATS-safe resume templates for ${industry.label.toLowerCase()} roles.`}
      </p>

      <h2>Recommended templates for {industry.label.toLowerCase()}</h2>
      <ul>
        {templates.map((t) => (
          <li key={t.id}>
            <Link href={`/ats-resume-templates/${t.id}`}>{t.name}</Link> — {t.description}{' '}
            (ATS safety: {t.atsSafety})
          </li>
        ))}
      </ul>
      <p>
        <Link className="btn" href={`/resume/start?template=${templates[0]?.id ?? 'classic'}`}>
          Build a {industry.label.toLowerCase()} resume free
        </Link>
      </p>

      <h2>Roles this covers</h2>
      <p>
        Template recommendations and keyword matching are tuned for
        {' '}{industry.roles.length} {industry.label.toLowerCase()} roles:
      </p>
      <ul>
        {industry.roles.map((r) => (
          <li key={r.id}>
            {r.label}
            {r.keywords?.length ? ` — keywords ATS parsers look for: ${r.keywords.join(', ')}` : ''}
          </li>
        ))}
      </ul>

      <h2>What ATS parsers do with a {industry.label.toLowerCase()} resume</h2>
      <p>
        Applicant tracking systems read the file before a recruiter does. They extract your
        contact block, then split the document into sections by heading. Non-standard headings,
        multi-column layouts, tables and text boxes are where content gets dropped or merged into
        the wrong field. Every template above is single-column with standard headings for that
        reason. You can see the literal extracted text with the{' '}
        <Link href="/ats-resume-checker">free ATS resume checker</Link>.
      </p>

      <h2>Other industries</h2>
      <ul>
        {siblings.map((i) => (
          <li key={i.id}>
            <Link href={`/resume-templates/${i.id}`}>{i.label} resume templates</Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/ats-resume-templates">
          Browse all {TEMPLATE_CATALOG.length} ATS resume templates
        </Link>
      </p>
    </main>
  );
}
