'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TkxAccordion,
  TkxBadge,
  TkxButton,
  TkxCard,
  TkxCardBody,
  TkxCardHeader,
  TkxCol,
  TkxDivider,
  TkxParagraph,
  TkxRow,
  TkxStatistic,
  TkxTag,
  TkxTitle,
} from 'tekivex-ui';
import JdQuickStart from '@/src/components/JdQuickStart';

/**
 * Home landing surface, rebuilt on the tekivex-ui design system (R-093)
 * so the front door speaks the same component language as the rest of the
 * app (TkxCard / TkxButton / TkxStatistic already power billing, outcomes,
 * dashboard). Previously this page was raw <section>/<div> markup styled by
 * a handful of globals.css classes (.hero, .card, .btn), which read as a
 * plain HTML page next to the tekivex-styled authenticated app.
 *
 * SEO note: this is a client component but Next SSRs it, so all headings,
 * FAQ answers, and internal links are present in the initial HTML. Real
 * <h1>/<h2>/<h3> come from TkxTitle `level`. The FAQ JSON-LD and page
 * metadata stay in the server `page.tsx`.
 *
 * Honesty (C-003): the stat strip uses only claims the product delivers —
 * ₹0 to build, the real template count, the real per-download price. No
 * fabricated user counts or callback percentages.
 */

type Faq = { q: string; a: string };

const FEATURES: { emoji: string; title: string; body: string; tag: string }[] = [
  {
    emoji: '🧠',
    tag: 'Skill gap',
    title: 'Paste a job description — see the skills you’re missing',
    body:
      'Drop in any JD and CallbackCV compares it against your resume: the skills ' +
      'you already cover, the ones the job asks for that you don’t show, and a ' +
      'one-tap button to add each missing skill straight into your resume. ' +
      'No guessing which keyword the screener wanted.',
  },
  {
    emoji: '🎯',
    tag: 'The moat',
    title: 'Measures real callbacks, not a guess',
    body:
      'Every builder gives you a score. CallbackCV tracks the real response, ' +
      'interview, and offer rate for each version of your resume — so you send ' +
      'the one that actually works, not the one a model predicts.',
  },
  {
    emoji: '🧩',
    tag: 'ATS-safe',
    title: 'ATS-safe by default',
    body:
      'Every template uses single-column layouts, real text (not images), and ' +
      'the section headers recruiter software expects. We score your resume ' +
      'against the same rules applicant tracking systems use.',
  },
  {
    emoji: '🔒',
    tag: 'Private',
    // Curly apostrophe (’) on purpose: tekivex text components HTML-escape a
    // plain ASCII ' into a literal "&#39;". The typographic ’ renders cleanly.
    title: 'Privacy that’s actually true',
    body:
      'Your resume is stored securely in your account so it is on every device ' +
      'you sign in from. We never sell your data and never train AI on your ' +
      'resume unless you opt in. Delete any resume — or your whole account — anytime.',
  },
  {
    emoji: '📱',
    tag: 'Everywhere',
    title: 'One account, every device',
    body:
      'Build on your laptop in the morning, polish on your phone over chai, ' +
      'export the PDF or Word file when a recruiter asks. Same login on every ' +
      'device — install CallbackCV from your browser’s home-screen menu.',
  },
];

const FREE_TIER = [
  'Unlimited resume creation and editing',
  '10+ ATS-safe templates across industries',
  'Full AI on your first resume — unlimited bullet rewrites, ATS critique, tech gap, JD skill gap and tailoring on it',
  'Every standalone AI tool free once each — cover letter, LinkedIn optimizer, interview prep, mentor chat and more',
  'Rule-based ATS score, missing keywords and action-verb suggestions — unlimited, no AI needed',
  'Job application tracker (kanban-style)',
  'Resume preview and print (free, watermarked)',
];

export default function HomeLanding({ faq }: { faq: Faq[] }) {
  const router = useRouter();

  return (
    <main className="home-landing">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="home-hero" aria-label="CallbackCV overview">
        <TkxBadge variant="primary" pulse>
          Free ATS-safe builder · Honest AI · India-first
        </TkxBadge>

        <TkxTitle level={1}>Know which resume actually gets callbacks.</TkxTitle>

        <TkxParagraph type="secondary" style={{ maxWidth: 640, fontSize: 18 }}>
          Every builder gives you a score. CallbackCV measures the truth: real
          response, interview, and offer rates for each version of your resume —
          so you send the one that works. Free ATS-safe builder · honest AI ·
          PDF/Word export.
        </TkxParagraph>

        <div className="home-cta-row">
          <TkxButton
            size="lg"
            colorScheme="primary"
            glow
            leftIcon={<span aria-hidden>✨</span>}
            onClick={() => router.push('/resume/start')}
          >
            Start your resume — free
          </TkxButton>
          <TkxButton
            size="lg"
            variant="outline"
            onClick={() => router.push('/auth/register')}
          >
            Create account
          </TkxButton>
        </div>

        <TkxParagraph type="secondary" style={{ fontSize: 13, marginTop: 4 }}>
          🔒 HTTPS in transit, encrypted at rest. We never sell your data and
          never train AI on your resume unless you opt in.
        </TkxParagraph>

        {/* Honest stat strip — every value is a claim the product delivers. */}
        <TkxRow gutter={16} style={{ marginTop: 8 }}>
          <TkxCol span={24} sm={8}>
            <TkxCard variant="glass" padding="md">
              <TkxStatistic title="To build and edit — forever" value={0} prefix="₹" />
            </TkxCard>
          </TkxCol>
          <TkxCol span={24} sm={8}>
            <TkxCard variant="glass" padding="md">
              <TkxStatistic title="ATS-safe templates" value={10} suffix="+" />
            </TkxCard>
          </TkxCol>
          <TkxCol span={24} sm={8}>
            <TkxCard variant="glass" padding="md">
              <TkxStatistic title="Per clean PDF / Word export" value={49} prefix="₹" />
            </TkxCard>
          </TkxCol>
        </TkxRow>
      </section>

      {/* -------------------------------------------------------- Paste-a-JD start
          Sits directly under the hero on purpose: "I have a JD, what am I
          missing?" is the task most visitors arrive with, and burying the
          entry point below the feature grid was why nobody found it. */}
      <section style={{ marginTop: 32 }}>
        <JdQuickStart />
      </section>

      {/* ------------------------------------------------------------ Features */}
      <section aria-label="Why CallbackCV" style={{ marginTop: 32 }}>
        <TkxTitle level={2}>Built for the people most resume tools ignore</TkxTitle>
        <TkxParagraph type="secondary" style={{ maxWidth: 720 }}>
          Students applying to their first job. Workers re-entering after a
          break. Professionals who want a clean resume without an expensive
          subscription. Free forever to build and edit — pay just ₹49 per
          download, or get one simple ₹499/month plan (the same for everyone)
          for unlimited AI and free downloads.
        </TkxParagraph>

        <TkxRow gutter={[20, 20]} style={{ marginTop: 16 }}>
          {FEATURES.map((f) => (
            <TkxCol key={f.title} span={24} md={12}>
              <TkxCard variant="elevated" isHoverable padding="lg" style={{ height: '100%' }}>
                <TkxCardHeader
                  title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span aria-hidden style={{ fontSize: 22 }}>{f.emoji}</span>
                      {f.title}
                    </span>
                  }
                  // variant="outline": the default "subtle" tints the tag's
                  // background with its own foreground colour, which lifts the
                  // effective background and left these chips at 4.37:1 — just
                  // under the 4.5 AA floor, in BOTH themes. An outline tag
                  // leaves the surface behind the text unchanged.
                  action={<TkxTag variant="outline">{f.tag}</TkxTag>}
                />
                <TkxCardBody>
                  <TkxParagraph type="secondary">{f.body}</TkxParagraph>
                </TkxCardBody>
              </TkxCard>
            </TkxCol>
          ))}
        </TkxRow>
      </section>

      {/* -------------------------------------------------- What's in the free tier */}
      <section style={{ marginTop: 32 }}>
        <TkxCard variant="glass" padding="lg">
          <TkxCardHeader title="What’s inside the free tier" />
          <TkxCardBody>
            <TkxRow gutter={[12, 12]}>
              {FREE_TIER.map((item) => (
                <TkxCol key={item} span={24} md={12}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <TkxBadge variant="success" aria-hidden>✓</TkxBadge>
                    <span>{item}</span>
                  </div>
                </TkxCol>
              ))}
            </TkxRow>
            <TkxDivider />
            <TkxParagraph type="secondary">
              <strong>Pay ₹49 per download</strong> for each clean PDF or Word
              export — no plan needed. Or get{' '}
              <strong>CallbackCV Plus at ₹499/month</strong> (one plan for
              everyone, cancel anytime): unlimited AI everywhere plus free,
              unlimited downloads.
            </TkxParagraph>
          </TkxCardBody>
        </TkxCard>
      </section>

      {/* --------------------------------------------------------------- Final CTA */}
      <section style={{ marginTop: 32 }}>
        <TkxCard variant="quantum" padding="lg" style={{ textAlign: 'center' }}>
          <TkxCardBody>
            <TkxTitle level={2}>Ready to get started?</TkxTitle>
            <TkxParagraph type="secondary">
              Upload an existing resume to import in 30 seconds, or start from scratch.
            </TkxParagraph>
            <div className="home-cta-row" style={{ justifyContent: 'center' }}>
              <TkxButton size="lg" colorScheme="primary" glow onClick={() => router.push('/resume/start')}>
                Start your resume
              </TkxButton>
              <TkxButton size="lg" variant="outline" onClick={() => router.push('/templates')}>
                Browse templates
              </TkxButton>
            </div>
          </TkxCardBody>
        </TkxCard>
      </section>

      {/* -------------------------------------------------------- Popular guides
          Kept as real crawlable <Link>s so internal link equity flows from
          this high-authority page to the SEO landers (unchanged intent). */}
      <section style={{ marginTop: 32 }} aria-labelledby="guides-heading">
        <TkxCard variant="outlined" padding="lg">
          <TkxCardHeader title="Popular guides" />
          <TkxCardBody>
            <ul style={{ lineHeight: 1.9, paddingLeft: 18 }}>
              <li><Link href="/pricing">Pricing</Link> — the complete price list (₹0 to build, ₹49/download, ₹499/mo Plus), shown before you start.</li>
              <li><Link href="/ats-resume-templates">ATS resume templates</Link> — free, ATS-safe layouts tested across major systems.</li>
              <li><Link href="/ats-resume-checker">ATS resume checker</Link> — score your resume and see what an ATS extracts.</li>
              <li><Link href="/resume-builder-india">Resume builder for India</Link> — ₹ pricing, UPI, India-aware live openings.</li>
              <li><Link href="/compare">CallbackCV vs Rezi, Teal &amp; Jobscan</Link> — how we compare.</li>
            </ul>
          </TkxCardBody>
        </TkxCard>
      </section>

      {/* -------------------------------------------------------------------- FAQ
          TkxAccordion backs the FAQPage JSON-LD in page.tsx. Content SSRs
          (present in HTML even while collapsed) so Google can read it. */}
      <section style={{ marginTop: 32 }} aria-labelledby="faq-heading">
        <TkxTitle level={2}>Frequently asked questions</TkxTitle>
        <TkxAccordion
          headingLevel={3}
          iconStyle="plus"
          items={faq.map((item, i) => ({
            id: `faq-${i}`,
            title: item.q,
            content: <TkxParagraph type="secondary">{item.a}</TkxParagraph>,
          }))}
        />
      </section>
    </main>
  );
}
