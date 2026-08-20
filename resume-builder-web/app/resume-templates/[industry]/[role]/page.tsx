import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  PROFESSION_INDUSTRIES,
  TEMPLATE_CATALOG,
  getIndustryById,
  getRoleById,
} from 'resume-builder-shared';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

/**
 * One page per ROLE: /resume-templates/information-technology/frontend-engineer
 *
 * Targets "frontend engineer resume" / "resume keywords for X" — the deepest
 * winnable long tail. This tier was deliberately NOT built until every role
 * carried authored ATS keywords: 141 of 161 had only a job title, and pages
 * generated from a bare label are textbook doorway pages, which Google
 * penalises domain-wide. Now each page's substance is the keyword list itself —
 * the exact terms postings and ATS filters use for that role — which is also
 * what a visitor searching "X resume keywords" actually wants.
 *
 * All 161 prerender at build time from the shared catalog, so a new role (with
 * keywords) gets its page automatically.
 */

export function generateStaticParams() {
  return PROFESSION_INDUSTRIES.flatMap((industry) =>
    industry.roles.map((role) => ({ industry: industry.id, role: role.id })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string; role: string }>;
}): Promise<Metadata> {
  const { industry: industryId, role: roleId } = await params;
  const industry = getIndustryById(industryId);
  const role = getRoleById(industryId, roleId);
  if (!industry || !role) return { title: 'Not found — CallbackCV' };

  const title = `${role.label} Resume: ATS Keywords & Templates`;
  const description =
    `Build an ATS-safe ${role.label.toLowerCase()} resume: the keywords ATS filters screen for ` +
    `(${(role.keywords || []).slice(0, 3).join(', ')}…), recommended templates, and a free builder ` +
    `that tracks which version gets callbacks.`;
  return {
    title,
    description,
    alternates: { canonical: `/resume-templates/${industry.id}/${role.id}` },
    openGraph: { title, description, url: `${SITE_URL}/resume-templates/${industry.id}/${role.id}`, type: 'website' },
  };
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ industry: string; role: string }>;
}) {
  const { industry: industryId, role: roleId } = await params;
  const industry = getIndustryById(industryId);
  const role = getRoleById(industryId, roleId);
  if (!industry || !role) notFound();

  const url = `${SITE_URL}/resume-templates/${industry.id}/${role.id}`;
  const keywords = role.keywords || [];
  const templates = (industry.recommendedTemplates || [])
    .map((id) => TEMPLATE_CATALOG.find((t) => t.id === id))
    .filter((t): t is (typeof TEMPLATE_CATALOG)[number] => Boolean(t));
  const siblingRoles = industry.roles.filter((r) => r.id !== role.id).slice(0, 8);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Resume templates by industry', item: `${SITE_URL}/resume-templates` },
          { '@type': 'ListItem', position: 3, name: industry.label, item: `${SITE_URL}/resume-templates/${industry.id}` },
          { '@type': 'ListItem', position: 4, name: role.label, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `What keywords should a ${role.label.toLowerCase()} resume include?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `ATS filters for ${role.label.toLowerCase()} roles most often screen for: ${keywords.join(', ')}. Include the ones you genuinely have — as written in the posting — in your skills section and inside experience bullets.`,
            },
          },
          {
            '@type': 'Question',
            name: `Which resume template works best for a ${role.label.toLowerCase()}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: templates.length
                ? `${templates[0].name}: ${templates[0].description}`
                : 'A single-column, ATS-safe template with standard section headings.',
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
        <Link href="/resume-templates">Industries</Link>
        {' / '}
        <Link href={`/resume-templates/${industry.id}`}>{industry.label}</Link>
        {' / '}
        <span>{role.label}</span>
      </nav>

      <h1>{role.label} resume: keywords and templates</h1>
      <p style={{ fontSize: 18 }}>
        Applying as a {role.label.toLowerCase()}? Your resume is parsed by an ATS before a person
        reads it. These are the terms those filters screen for, and the templates that survive the
        parsing.
      </p>

      <h2>Keywords ATS filters look for</h2>
      <p>
        From real {role.label.toLowerCase()} postings — include the ones you genuinely have, worded
        as the posting words them:
      </p>
      <ul>
        {keywords.map((k) => (
          <li key={k}><strong>{k}</strong></li>
        ))}
      </ul>
      <p>
        Don&apos;t keyword-stuff: put each term in your skills section once and prove it inside an
        experience bullet. The <Link href="/ats-resume-checker">free ATS checker</Link> shows the
        literal text a parser extracts from your file.
      </p>

      <h2>Recommended templates</h2>
      <ul>
        {templates.map((t) => (
          <li key={t.id}>
            <Link href={`/ats-resume-templates/${t.id}`}>{t.name}</Link> — {t.description}
          </li>
        ))}
      </ul>
      <p>
        <Link className="btn" href={`/resume/start?template=${templates[0]?.id ?? 'classic'}`}>
          Build a {role.label.toLowerCase()} resume free
        </Link>
      </p>

      <h2>Three rules for a {role.label.toLowerCase()} resume</h2>
      <ul>
        <li><strong>Lead with outcomes, not duties.</strong> Every experience bullet should carry a number: scale, speed, money or people.</li>
        <li><strong>Mirror the posting&apos;s wording.</strong> If the JD says “{keywords[0] ?? 'the exact skill'}”, your resume should say it the same way — ATS matching is literal.</li>
        <li><strong>Stay single-column for portals.</strong> Save the designer layouts for humans; upload the ATS-safe version to job sites.</li>
      </ul>

      <h2>Related {industry.label.toLowerCase()} roles</h2>
      <ul>
        {siblingRoles.map((r) => (
          <li key={r.id}>
            <Link href={`/resume-templates/${industry.id}/${r.id}`}>{r.label} resume</Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href={`/resume-templates/${industry.id}`}>All {industry.label.toLowerCase()} templates</Link>
        {' · '}
        <Link href="/ats-resume-templates">All {TEMPLATE_CATALOG.length} templates</Link>
      </p>
    </main>
  );
}
