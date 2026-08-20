import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { TEMPLATE_CATALOG, type TemplateCatalogItem } from 'resume-builder-shared';
import PublicTemplatePreview from '@/src/components/PublicTemplatePreview';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

/**
 * One indexable page per template.
 *
 * Every template previously lived on the single /ats-resume-templates list, so
 * the site had exactly one URL competing for every template query. The
 * long-tail is where a new domain can actually rank — "ATS resume template for
 * career change" is winnable in a way that "resume templates" is not against
 * sites with a decade of backlinks — and it needs a page per template to
 * compete for it.
 *
 * Content is generated from the shared catalog rather than written per page, so
 * these cannot go stale when a template is added, renamed, or reclassified.
 * That also means the 12 templates added for 2026 each got a landing page the
 * moment they were catalogued.
 */

function findTemplate(slug: string): TemplateCatalogItem | undefined {
  return TEMPLATE_CATALOG.find((t) => t.id === slug);
}

/** Statically render all of them at build time — no runtime cost, fully crawlable. */
export function generateStaticParams() {
  return TEMPLATE_CATALOG.map((t) => ({ slug: t.id }));
}

const SAFETY_COPY: Record<string, string> = {
  high: 'Parses cleanly across every major ATS. Safe to submit to any job portal.',
  medium: 'Parses reliably; some systems may drop the light styling, never the text.',
  low: 'Best for direct applications and printed CVs — visual layouts can confuse parsers.',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const template = findTemplate(slug);
  if (!template) return { title: 'Template not found — CallbackCV' };

  // Keep titles inside ~60 characters so they are not truncated in results.
  const title = `${template.name} Resume Template (Free, ATS-Safe)`;
  return {
    title,
    description: template.description,
    alternates: { canonical: `/ats-resume-templates/${template.id}` },
    openGraph: {
      title,
      description: template.description,
      url: `${SITE_URL}/ats-resume-templates/${template.id}`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: template.description,
    },
  };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = findTemplate(slug);
  if (!template) notFound();

  const url = `${SITE_URL}/ats-resume-templates/${template.id}`;
  const related = TEMPLATE_CATALOG.filter((t) => t.id !== template.id).slice(0, 6);

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
            name: 'ATS Resume Templates',
            item: `${SITE_URL}/ats-resume-templates`,
          },
          { '@type': 'ListItem', position: 3, name: template.name, item: url },
        ],
      },
      {
        '@type': 'CreativeWork',
        name: `${template.name} resume template`,
        description: template.description,
        url,
        isAccessibleForFree: true,
        keywords: template.tags.join(', '),
        inLanguage: template.supportedLocales,
        provider: { '@type': 'Organization', name: 'CallbackCV', url: SITE_URL },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `Is the ${template.name} template ATS-friendly?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: SAFETY_COPY[template.atsSafety] ?? SAFETY_COPY.medium,
            },
          },
          {
            '@type': 'Question',
            name: `Who should use the ${template.name} resume template?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: (template.recommendedFor || []).join('. ') || template.description,
            },
          },
          {
            '@type': 'Question',
            name: `Is the ${template.name} template free?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. Building and previewing with this template is free. A charge applies per clean PDF or Word export.',
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
        <Link href="/ats-resume-templates">ATS resume templates</Link>
        {' / '}
        <span>{template.name}</span>
      </nav>

      <h1>{template.name} resume template</h1>
      <p style={{ fontSize: 18 }}>{template.description}</p>

      <p>
        <Link className="btn" href={`/resume/template?template=${template.id}`}>
          Use this template free
        </Link>
      </p>

      {/* The template itself, rendered live with sample content — the page
          used to DESCRIBE the template without showing it. */}
      <h2>What it looks like</h2>
      <div style={{ maxWidth: 560, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <PublicTemplatePreview templateId={template.id} industryId={template.industries?.[0]} mode="full" />
      </div>

      <h2>Who this template is for</h2>
      <ul>
        {(template.recommendedFor || []).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <h2>ATS compatibility</h2>
      <p>{SAFETY_COPY[template.atsSafety] ?? SAFETY_COPY.medium}</p>
      <p>
        Layout: {template.layout.replace('-', ' ')}. Tested against Workday, Greenhouse, iCIMS,
        Taleo and BambooHR. You can also run it through the{' '}
        <Link href="/ats-resume-checker">free ATS resume checker</Link> to see the exact text a
        parser extracts.
      </p>

      <h2>Sections included</h2>
      <p>{template.supportedSections.join(', ')}.</p>

      {template.industries?.length ? (
        <>
          <h2>Suited to</h2>
          <p>{template.industries.map((i) => i.replace(/-/g, ' ')).join(', ')}.</p>
        </>
      ) : null}

      <h2>Frequently asked questions</h2>
      <h3>Is the {template.name} template ATS-friendly?</h3>
      <p>{SAFETY_COPY[template.atsSafety] ?? SAFETY_COPY.medium}</p>
      <h3>Is it free?</h3>
      <p>
        Yes — building and previewing are free. A charge applies per clean PDF or Word export, and
        the exported document matches the preview exactly.
      </p>
      <h3>Can I switch templates later?</h3>
      <p>
        Yes. Your content is stored separately from the layout, so switching re-flows your sections
        into the new design without retyping anything.
      </p>

      <h2>Other ATS resume templates</h2>
      <ul>
        {related.map((t) => (
          <li key={t.id}>
            <Link href={`/ats-resume-templates/${t.id}`}>{t.name} resume template</Link> — {t.description}
          </li>
        ))}
      </ul>
      <p>
        <Link href="/ats-resume-templates">Browse all {TEMPLATE_CATALOG.length} ATS resume templates</Link>
      </p>
    </main>
  );
}
