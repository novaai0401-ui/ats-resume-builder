'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, getAccessToken } from '@/src/lib/api';
import { MCP_NPM_URL } from '@/src/lib/integrations';
import { TkxButton } from 'tekivex-ui';

/**
 * Settings → API access.
 *
 * Surfaces the signed-in user's current access token so it can be pasted
 * into the CallbackCV MCP server (@tekivex/callbackcv-mcp) — the bridge that
 * lets Claude / ChatGPT read resumes, tailor them per JD, log applications,
 * and query outcome stats through the SAME REST API as the web app.
 *
 * Honesty (C-003): this is exactly the token the web app already uses (a
 * 7-day JWT, JWT_EXPIRES_IN default). It is NOT a separate long-lived API
 * key — so the copy says "expires, re-copy when it does", which is what the
 * MCP tools already tell the agent on a 401. No capability is implied that
 * the code doesn't deliver: an agent using this token can do exactly what
 * the signed-in user can, nothing more (plan gates + quotas still apply).
 */
export default function ApiAccessCard() {
  const [token, setToken] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  // R-106 — the connect-code flow. The assistant's authorize page is hosted
  // off-origin, so it must never ask for a password; it asks for one of
  // these instead, minted here where the user is already signed in.
  const [connectCode, setConnectCode] = useState('');
  const [connectError, setConnectError] = useState('');
  const [minting, setMinting] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    setToken(getAccessToken());
    const onAuth = () => setToken(getAccessToken());
    window.addEventListener('auth-state-changed', onAuth);
    return () => window.removeEventListener('auth-state-changed', onAuth);
  }, []);

  const mintConnectCode = useCallback(async () => {
    setMinting(true);
    setConnectError('');
    try {
      const result = await api.createConnectCode('AI assistant');
      setConnectCode(result.code);
      setCodeCopied(false);
      try {
        await navigator.clipboard.writeText(result.code);
        setCodeCopied(true);
      } catch {
        // Clipboard blocked — the code is on screen to copy manually.
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Could not create a connect code. Try again.');
    } finally {
      setMinting(false);
    }
  }, []);

  const copy = useCallback(async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — reveal so the user can
      // select-and-copy manually instead of silently doing nothing.
      setRevealed(true);
    }
  }, [token]);

  if (!token) return null;

  const masked = `${token.slice(0, 8)}${'•'.repeat(24)}${token.slice(-6)}`;

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>API access (for Claude / ChatGPT)</h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
        Use CallbackCV from inside your AI assistant via the{' '}
        {MCP_NPM_URL ? (
          <a href={MCP_NPM_URL} target="_blank" rel="noreferrer">CallbackCV MCP server</a>
        ) : (
          <span>CallbackCV MCP server</span>
        )}
        . Paste the token below as <code>POCKET_RESUME_TOKEN</code> in your MCP host config.
        An assistant using it can do only what you can — your plan limits and AI quotas still apply.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'var(--surface-alt, #f5f5f5)',
          borderRadius: 8,
          padding: '8px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          wordBreak: 'break-all',
        }}
      >
        <span style={{ flex: '1 1 240px', minWidth: 0 }}>{revealed ? token : masked}</span>
        <TkxButton variant="outline" type="button" onClick={() => setRevealed((v) => !v)}>
          {revealed ? 'Hide' : 'Reveal'}
        </TkxButton>
        <TkxButton type="button" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy token'}
        </TkxButton>
      </div>

      <p className="small" style={{ color: 'var(--muted)', marginTop: 8 }}>
        This token expires (about 7 days) — if your assistant reports an auth error, come back
        here and copy a fresh one. Treat it like a password: anyone with it can act as you in
        CallbackCV until it expires. Logging out invalidates it immediately, everywhere.
      </p>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Connect an assistant</h3>
        <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Connecting Claude or ChatGPT opens a CallbackCV authorize page. Paste the code below
          into it — it works once and expires in 10 minutes.{' '}
          <strong>That page will never ask for your password.</strong> If any page does, close it.
        </p>

        <TkxButton type="button" onClick={mintConnectCode} disabled={minting}>
          {minting ? 'Creating…' : 'Create connect code'}
        </TkxButton>

        {connectError ? (
          <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>{connectError}</p>
        ) : null}

        {connectCode ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              wordBreak: 'break-all',
            }}
          >
            {connectCode}
            <p className="small" style={{ color: 'var(--muted)', margin: '8px 0 0' }}>
              {codeCopied ? 'Copied to your clipboard. ' : ''}Valid for 10 minutes, single use.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
