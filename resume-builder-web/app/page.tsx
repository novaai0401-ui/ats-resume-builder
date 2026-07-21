import type { Metadata } from 'next';
import HomeLanding from '@/src/components/HomeLanding';

export const metadata: Metadata = {
  title: 'CallbackCV — Free ATS resume builder',
  description:
    'The resume builder that measures which resume actually gets callbacks. ' +
    'ATS-safe templates, honest AI, and real per-version response tracking. Free to start.',
  alternates: { canonical: '/' },
};

// The home page is the only marketing surface most users see before
// signing up, so the copy needs to do four jobs at once: explain what
// the product is, who it's for, why it's safe, and where to start.
// Headings use real <h1>/<h2> for SEO; the JSON-LD in layout.tsx
// covers the SoftwareApplication schema separately.

// High-intent Q&A. Doubles as Google FAQ rich-result fuel and as quotable
// facts for AI assistants (GEO) — pair with /llms.txt.
const FAQ = [
  {
    q: 'Is CallbackCV a free ATS resume builder?',
    a: 'Yes. The resume editor and ATS scorer are free forever. AI career features like the Recruiter-AI Simulator, mentor chat, and live job openings are free with your own AI key (BYOK), or get CallbackCV Plus at ₹499/mo for our AI everywhere. Downloads are ₹49 each.',
  },
  {
    q: 'How is CallbackCV different from other ATS resume builders?',
    a: 'Most tools stop at a predicted ATS score. CallbackCV measures your real callback rate per resume version (the Outcome Loop), simulates the AI hiring screen recruiters now run (Recruiter-AI Simulator), and shows the literal recruiter-view text an ATS extracts (ATS Simulator).',
  },
  {
    q: 'Does CallbackCV check if my resume is ATS-compatible?',
    a: 'Yes. It scores ATS-friendliness with explainable feedback and the ATS Simulator renders exactly what an applicant tracking system (Workday, Greenhouse, iCIMS) would parse from your file.',
  },
  {
    q: 'Does the AI make up numbers or achievements on my resume?',
    a: 'No — and this is a hard rule, not a preference. Most AI resume tools invent metrics ("cut costs by 35%") that were never in your history. CallbackCV’s AI is instructed to never invent numbers, achievements, employers, or skills; it only rephrases and reorganizes what is genuinely on your resume.',
  },
  {
    q: 'Is my resume data private?',
    a: 'Yes. Your resume is stored securely in your account (encrypted in transit and at rest), never sold, and never used to train AI unless you explicitly opt in. Delete any resume — or your whole account — anytime.',
  },
  {
    q: 'Does it work for the India job market?',
    a: 'Yes. CallbackCV is India-first with CallbackCV Plus at ₹499/mo (cancel anytime), India-aware live job openings, and Razorpay payments, while also supporting global users.',
  },
];

// The visible marketing UI lives in the `HomeLanding` client component,
// rebuilt on the tekivex-ui design system (R-093) so the front door matches
// the rest of the app. This server component keeps the two things that must
// be server-rendered for search/AI: the page metadata (above) and the
// FAQPage JSON-LD (below). Next SSRs HomeLanding, so its <h1>/<h2>/<h3> and
// FAQ answers are still in the initial HTML.
export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />
      <HomeLanding faq={FAQ} />
    </>
  );
}
