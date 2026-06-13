import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ContactRelayForm from './ContactRelayForm';

/**
 * R-038 — public portfolio page.
 *
 * No JS framework chrome (no top nav, no auth gate, no client-side
 * fetching). The page is server-rendered from the API's
 * `GET /p/:slug/data` response so a recruiter without an account sees
 * the resume in one round trip. The PDF link goes directly to
 * `GET /p/:slug/resume.pdf`.
 *
 * `noindex,nofollow` by default; switched to `index,follow` only when
 * the owner has explicitly turned `allowSearchIndexing` on. C-003:
 * the footer copy spells out exactly what the owner can see about a
 * visitor (view + download counts and coarse location only — no IP).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type PublicPayload = {
  slug: string;
  headline: string | null;
  templateId?: string;
  resume: {
    contact: {
      fullName?: string;
      email?: string;
      phone?: string;
      location?: string;
      links?: string[];
    };
    summary: string;
    skills: string[];
    experience: Array<{
      company?: string;
      role?: string;
      startDate?: string;
      endDate?: string;
      highlights?: string[];
    }>;
    education: Array<{
      institution?: string;
      degree?: string;
      startDate?: string;
      endDate?: string;
    }>;
    projects: Array<{
      name?: string;
      role?: string;
      url?: string;
      highlights?: string[];
    }>;
    achievements: string[];
    certifications: Array<{ name?: string; issuer?: string; date?: string }>;
    languages: string[];
  };
  meta: {
    allowSearchIndexing: boolean;
    contactMasked: boolean;
    snapshotLabel: string | null;
    snapshotCreatedAt: string | null;
  };
};

async function fetchPayload(slug: string): Promise<PublicPayload | null> {
  try {
    const res = await fetch(`${API_BASE}/p/${encodeURIComponent(slug)}/data`, {
      // The owner can flip enabled/maskContact/etc; we don't cache.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicPayload;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const payload = await fetchPayload(slug);
  if (!payload) {
    return {
      title: 'Not available',
      robots: { index: false, follow: false },
    };
  }
  const name = payload.resume.contact?.fullName?.trim() || 'Portfolio';
  return {
    title: payload.headline ? `${name} — ${payload.headline}` : name,
    description: payload.resume.summary?.slice(0, 200) || undefined,
    robots: payload.meta.allowSearchIndexing
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await fetchPayload(slug);
  if (!payload) notFound();
  const { resume, headline, meta } = payload;
  const fullName = resume.contact?.fullName?.trim() || 'Portfolio';
  const pdfHref = `${API_BASE}/p/${encodeURIComponent(slug)}/resume.pdf`;

  // ProfilePage + Person structured data — only when the owner opted into
  // search indexing. Makes a shared portfolio eligible for rich results and
  // gives AI assistants clean, citable facts about the candidate. This is the
  // edge over plain "share a PDF link" competitors: the portfolio is itself an
  // SEO/GEO-optimized public profile.
  const profileJsonLd = meta.allowSearchIndexing
    ? {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        dateCreated: meta.snapshotCreatedAt || undefined,
        mainEntity: {
          '@type': 'Person',
          name: fullName,
          jobTitle: headline || resume.experience?.[0]?.role || undefined,
          description: resume.summary?.slice(0, 300) || undefined,
          knowsAbout: resume.skills?.length ? resume.skills.slice(0, 30) : undefined,
          address: resume.contact?.location
            ? { '@type': 'PostalAddress', addressLocality: resume.contact.location }
            : undefined,
          alumniOf: (resume.education || [])
            .map((e) => e.institution)
            .filter(Boolean)
            .map((name) => ({ '@type': 'EducationalOrganization', name })),
          url: `${API_BASE.replace(/\/$/, '')}/p/${encodeURIComponent(slug)}`,
        },
      }
    : null;

  return (
    <main style={pageStyle}>
      {profileJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
        />
      ) : null}
      <article style={cardStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, color: '#1a3a5c' }}>{fullName}</h1>
            {headline ? (
              <p style={{ margin: '4px 0 0', fontSize: 15, color: '#5a6778' }}>{headline}</p>
            ) : null}
            <ContactLine contact={resume.contact} contactMasked={meta.contactMasked} />
          </div>
          <a href={pdfHref} className="rb-pdf-btn" style={downloadBtnStyle}>
            Download resume (PDF)
          </a>
        </header>

        {resume.summary ? (
          <Section title="Summary">
            <p style={proseStyle}>{resume.summary}</p>
          </Section>
        ) : null}

        {resume.skills.length ? (
          <Section title="Skills">
            <p style={proseStyle}>{resume.skills.join(' · ')}</p>
          </Section>
        ) : null}

        {resume.experience.length ? (
          <Section title="Experience">
            {resume.experience.map((e, i) => (
              <div key={i} style={entryStyle}>
                <div style={entryHeaderStyle}>
                  <strong>{e.role || '—'}</strong>
                  <span style={dateStyle}>
                    {[e.startDate, e.endDate].filter(Boolean).join(' – ')}
                  </span>
                </div>
                <div style={{ color: '#475569' }}>{e.company || ''}</div>
                {(e.highlights || []).length ? (
                  <ul style={listStyle}>
                    {(e.highlights || []).map((h, j) => <li key={j}>{h}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </Section>
        ) : null}

        {resume.projects.length ? (
          <Section title="Projects">
            {resume.projects.map((p, i) => (
              <div key={i} style={entryStyle}>
                <strong>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1a3a5c' }}>
                      {p.name || p.url}
                    </a>
                  ) : (
                    p.name || '—'
                  )}
                </strong>
                {(p.highlights || []).length ? (
                  <ul style={listStyle}>
                    {(p.highlights || []).map((h, j) => <li key={j}>{h}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </Section>
        ) : null}

        {resume.achievements.length ? (
          <Section title="Achievements">
            <ul style={listStyle}>
              {resume.achievements.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </Section>
        ) : null}

        {resume.education.length ? (
          <Section title="Education">
            {resume.education.map((ed, i) => (
              <div key={i} style={entryStyle}>
                <div style={entryHeaderStyle}>
                  <strong>{ed.degree || '—'}</strong>
                  <span style={dateStyle}>
                    {[ed.startDate, ed.endDate].filter(Boolean).join(' – ')}
                  </span>
                </div>
                <div style={{ color: '#475569' }}>{ed.institution || ''}</div>
              </div>
            ))}
          </Section>
        ) : null}

        {resume.certifications.length ? (
          <Section title="Certifications">
            <ul style={listStyle}>
              {resume.certifications.map((c, i) => (
                <li key={i}>
                  {c.name}
                  {c.issuer ? ` · ${c.issuer}` : ''}
                  {c.date ? ` (${c.date})` : ''}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {resume.languages.length ? (
          <Section title="Languages">
            <p style={proseStyle}>{resume.languages.join(' · ')}</p>
          </Section>
        ) : null}

        {meta.contactMasked ? <ContactRelayForm slug={slug} /> : null}

        <footer style={footerStyle}>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
            Shared via Pocket Resume. The owner of this page can see the number of views,
            the number of downloads, the visitor's coarse location, and a hashed visitor
            id — never your IP address. <Link href="/" style={{ color: '#1a3a5c' }}>Build your own resume →</Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

function ContactLine({
  contact,
  contactMasked,
}: {
  contact: PublicPayload['resume']['contact'];
  contactMasked: boolean;
}) {
  const parts: string[] = [];
  if (contact?.location) parts.push(contact.location);
  if (contact?.email) parts.push(contact.email);
  if (contact?.phone) parts.push(contact.phone);
  if (!parts.length && contactMasked) {
    parts.push('Contact details hidden by the owner');
  }
  if (!parts.length) return null;
  return (
    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#5a6778' }}>
      {parts.join(' · ')}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

// ── styles ──
const pageStyle: React.CSSProperties = {
  background: '#f3f6fa',
  minHeight: '100vh',
  padding: '32px 16px',
};
const cardStyle: React.CSSProperties = {
  maxWidth: 780,
  margin: '0 auto',
  background: '#ffffff',
  borderRadius: 14,
  padding: '32px 36px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 18,
};
const downloadBtnStyle: React.CSSProperties = {
  background: '#1a3a5c',
  color: '#ffffff',
  padding: '10px 16px',
  borderRadius: 10,
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 600,
};
const sectionStyle: React.CSSProperties = { marginTop: 22 };
const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#1a3a5c',
};
const entryStyle: React.CSSProperties = { marginBottom: 14 };
const entryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  flexWrap: 'wrap',
};
const dateStyle: React.CSSProperties = { fontSize: 13, color: '#5a6778' };
const proseStyle: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.55,
  color: '#1f2937',
  fontSize: 15,
};
const listStyle: React.CSSProperties = {
  margin: '6px 0 0',
  paddingLeft: 18,
  lineHeight: 1.6,
  color: '#1f2937',
};
const footerStyle: React.CSSProperties = {
  marginTop: 36,
  paddingTop: 16,
  borderTop: '1px solid #e2e8f0',
};
