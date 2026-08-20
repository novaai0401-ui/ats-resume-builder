import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TrustCard,
  TrustChecklist,
  TrustCta,
  TrustGrid,
  TrustHero,
  TrustPageShell,
} from '@/src/components/TrustPage';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';
const MCP_URL = 'https://ats-rb-mcp.onrender.com';

export const metadata: Metadata = {
  title: 'Build Your Resume in ChatGPT or Claude',
  description:
    'Connect CallbackCV to ChatGPT, Claude, Cursor or any MCP-enabled AI assistant and build, tailor and track your resume by chatting — in your own account, on your own plan.',
  alternates: { canonical: '/ai-assistants' },
  openGraph: {
    title: 'Build Your Resume in ChatGPT or Claude — CallbackCV',
    description: 'Chat "build my resume" in your AI assistant; it lands in your CallbackCV account, ATS-safe and trackable.',
    url: `${SITE_URL}/ai-assistants`,
    type: 'website',
  },
};

/**
 * Setup page for the MCP integration — and the SEO landing for "build resume
 * in ChatGPT / Claude" queries, which nobody else in this market ranks for
 * yet. Uses the trust-page premium system.
 */
export default function AiAssistantsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'HowTo',
        name: 'Build your resume from ChatGPT or Claude with CallbackCV',
        step: [
          { '@type': 'HowToStep', position: 1, name: 'Get your token', text: 'In CallbackCV, open Settings → API access and copy your personal token.' },
          { '@type': 'HowToStep', position: 2, name: 'Add the CallbackCV connector', text: 'In your AI assistant, add the CallbackCV MCP server and paste the token.' },
          { '@type': 'HowToStep', position: 3, name: 'Just chat', text: 'Say "build my resume" — the assistant creates it in your CallbackCV account, ATS-safe.' },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Which AI assistants work with CallbackCV?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Any assistant that supports the Model Context Protocol (MCP): Claude (desktop and Claude Code), ChatGPT desktop, Cursor, Windsurf and others. The assistant acts on your own account with your own limits.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can the assistant download my resume for free?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'No side doors: the assistant gets the same rules you do. Free accounts pay the one-time download charge; CallbackCV Plus downloads are included and un-watermarked.',
            },
          },
        ],
      },
    ],
  };

  return (
    <TrustPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <TrustHero eyebrow="AI Assistants" title="Build your resume" accent="inside ChatGPT or Claude">
        Connect CallbackCV to your AI assistant and just talk: “build my resume”, “tailor it to
        this JD”, “log this application”. Everything lands in your CallbackCV account — ATS-safe,
        versioned, and measured for callbacks — on whatever plan you already have.
      </TrustHero>

      <TrustGrid>
        <TrustCard icon="1" title="Get your token">
          <p>
            Sign in and open <Link href="/settings">Settings → API access</Link>. Copy your
            personal token — it lets an assistant do exactly what you can do, nothing more, and you
            can revoke it there any time.
          </p>
        </TrustCard>

        <TrustCard icon="2" title="Connect your assistant">
          <p>
            Add the CallbackCV connector in your assistant&rsquo;s MCP settings (Claude Desktop,
            Claude Code, ChatGPT desktop, Cursor, Windsurf…):
          </p>
          <p>
            <code>{MCP_URL}</code> — or run it locally with your token as{' '}
            <code>POCKET_RESUME_TOKEN</code>.
          </p>
        </TrustCard>

        <TrustCard icon="3" title="Then just chat" wide>
          <TrustChecklist
            items={[
              { ok: true, text: <><strong>“Build me a resume”</strong> — the assistant gathers your details and creates it in your account (create_resume).</> },
              { ok: true, text: <><strong>“Rewrite my summary with numbers”</strong> — sections update in place (update_resume).</> },
              { ok: true, text: <><strong>“Tailor it to this job description”</strong> — a new tracked version per JD (tailor_resume), so reply rates attribute to the exact variant.</> },
              { ok: true, text: <><strong>“Log that I applied at Barclays”</strong> — straight into your job tracker (log_application).</> },
              { ok: true, text: <><strong>“Which version gets the most replies?”</strong> — your real callback stats (get_outcome_stats).</> },
              { ok: true, text: <><strong>“Give me the PDF”</strong> — a download link on your plan&rsquo;s terms (get_download_link).</> },
            ]}
          />
        </TrustCard>

        <TrustCard icon="🛡" title="Same rules, no side doors">
          <p>
            The assistant calls the same API you use, as you. Plan limits, AI quotas and the
            download charge all apply unchanged — a free account pays the one-time export fee,{' '}
            <Link href="/pricing">Plus</Link> downloads clean and free.
          </p>
        </TrustCard>

        <TrustCard icon="🔒" title="Privacy">
          <p>
            The token lives in your assistant&rsquo;s configuration on your device. Revoke it in
            Settings and the connection is dead instantly. Details in the{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </TrustCard>

        <TrustCta>
          <p><strong>No account yet?</strong></p>
          <p>
            <Link href="/auth/register">Create one free</Link> — then connect your assistant in
            two minutes.
          </p>
        </TrustCta>
      </TrustGrid>
    </TrustPageShell>
  );
}
