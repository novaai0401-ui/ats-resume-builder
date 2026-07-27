import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How CallbackCV handles your data across the web app, mobile apps, MCP server, and the browser extension.',
  alternates: { canonical: '/privacy' },
};

// Static, honest privacy policy (C-003). The claims here must match the
// actual data flow: server-side account storage, encrypted in transit and at
// rest, no sale, no AI training without opt-in. Also the reference document
// the Chrome Web Store listing and the MCP server point to.
const UPDATED = 'July 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="container" style={{ maxWidth: 820 }}>
      <h1>Privacy Policy</h1>
      <p className="small" style={{ color: 'var(--muted)' }}>Last updated: {UPDATED}</p>

      <p>
        CallbackCV (by Tekivex) helps you build ATS-friendly resumes, track job
        applications, and measure which resume version actually gets callbacks.
        This policy covers the web app, mobile apps, the CallbackCV browser
        extension, and the CallbackCV MCP server.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> your email address and authentication credentials.</li>
        <li><strong>Resume content:</strong> everything you add to a resume, plus files you upload for parsing.</li>
        <li><strong>Job-search data:</strong> job applications you save, their status, and the resume version used.</li>
        <li><strong>Usage data:</strong> minimal operational logs needed to run and secure the service.</li>
      </ul>

      <h2>How your data is stored and protected</h2>
      <p>
        Your resume and account data are stored in your CallbackCV account on
        our servers, encrypted in transit (HTTPS) and at rest. They follow you
        across devices when you sign in. You may also enable an optional
        zero-knowledge encrypted backup, which is encrypted with a passphrase
        only you hold.
      </p>

      <h2>What we do NOT do</h2>
      <ul>
        <li>We do not sell your data.</li>
        <li>We do not use your resume to train AI unless you explicitly opt in (Settings → Training data).</li>
        <li>We do not share your data with third parties except the infrastructure and payment providers needed to run the service.</li>
      </ul>

      <h2>AI features</h2>
      <p>
        AI features (resume critique, tailoring, JD match, mentor, and others)
        send the relevant resume/job text to an AI provider to generate a
        response. If you supply your own AI key (BYOK), requests use your key.
        This processing generates your result and is not used to train our
        models.
      </p>

      <h2>Browser extension</h2>
      <p>
        The CallbackCV browser extension stores your API base URL and access
        token in your browser&rsquo;s local storage (<code>chrome.storage.local</code>)
        on your device. It reads a job posting only on the job-board pages you
        visit and only to capture the job description and details you choose to
        save. That data is sent solely to your own CallbackCV account to create
        or update a job application. The extension does not sell data, does not
        track your browsing, and requests access only to the supported job
        boards and the CallbackCV API.
      </p>

      <h2>MCP server (AI assistant access)</h2>
      <p>
        The CallbackCV MCP server lets an AI assistant (e.g. Claude, ChatGPT)
        act on your behalf using a token you paste from Settings &rarr; API
        access. An assistant using it can do only what you can do in the app;
        your plan limits and quotas still apply. The token is stored in your
        MCP host&rsquo;s configuration on your device.
      </p>

      <h2>Data retention</h2>
      <ul>
        <li>
          <strong>Resume and job-search data:</strong> kept for as long as your account exists.
          Deleting a resume removes it; deleting your account removes your account data.
        </li>
        <li>
          <strong>Access tokens:</strong> expire automatically (about 7 days). Logging out
          invalidates active tokens immediately.
        </li>
        <li>
          <strong>Payment records:</strong> retained as required for accounting, tax, and legal
          obligations, even after account deletion. Card details are held by the payment
          provider (Razorpay/Stripe), never by us.
        </li>
        <li>
          <strong>Operational logs:</strong> kept only briefly for security and debugging, then
          discarded.
        </li>
      </ul>

      <h2>Your controls</h2>
      <ul>
        <li>Delete any resume, or your entire account, at any time.</li>
        <li>Log out to invalidate active access tokens.</li>
        <li>Opt in or out of AI training on your data in Settings.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions or data requests: <a href="mailto:novaai0401@gmail.com">novaai0401@gmail.com</a>.
      </p>
    </main>
  );
}
