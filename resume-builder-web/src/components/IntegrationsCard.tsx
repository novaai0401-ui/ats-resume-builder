'use client';

import { CHROME_EXTENSION_URL, MCP_NPM_URL, hasPublishedIntegrations } from '@/src/lib/integrations';

/**
 * Settings → "CallbackCV everywhere" — install links for the published
 * integrations. Renders NOTHING until at least one URL is configured
 * (see src/lib/integrations.ts), so we never advertise a listing that
 * isn't live yet (C-003).
 */
export default function IntegrationsCard() {
  if (!hasPublishedIntegrations) return null;

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>CallbackCV everywhere</h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
        Use CallbackCV from the places you already work — your browser and your AI assistant.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {CHROME_EXTENSION_URL ? (
          <a className="btn" href={CHROME_EXTENSION_URL} target="_blank" rel="noreferrer">
            🧩 Get the Chrome extension
          </a>
        ) : null}
        {MCP_NPM_URL ? (
          <a className="btn secondary" href={MCP_NPM_URL} target="_blank" rel="noreferrer">
            🤖 Use CallbackCV in Claude (MCP)
          </a>
        ) : null}
      </div>
      {CHROME_EXTENSION_URL ? (
        <p className="small" style={{ color: 'var(--muted)', marginBottom: 0 }}>
          The extension captures job postings from supported job boards into your tracker,
          tagged with the resume version you used.
        </p>
      ) : null}
      {MCP_NPM_URL ? (
        <p className="small" style={{ color: 'var(--muted)', marginBottom: 0 }}>
          The MCP server lets Claude read your resumes, tailor them per job description, and
          log applications — using the token from “API access” above.
        </p>
      ) : null}
    </section>
  );
}
