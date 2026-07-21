'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { getAccessToken } from '@/src/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type State = 'checking' | 'logged-out' | 'ready' | 'connected';

/**
 * R-093 auth handshake.
 *
 * When a logged-in user clicks "Connect my extension" we hand the current
 * access token to the extension's `content/connect.js` content script,
 * which is the ONLY script matched on this page. The token is exposed via
 * two channels, and ONLY on the explicit button click:
 *
 *   1. window.postMessage({ source: 'callbackcv-connect', token, apiBase },
 *      window.location.origin) — the content script verifies event.origin
 *      and data.source before touching the token.
 *   2. A `data-callbackcv-token` attribute on a hidden div, as a fallback
 *      for content scripts that miss the (racy) postMessage.
 *
 * The token is NEVER written to the DOM or posted until the user clicks.
 */
export default function ConnectExtensionView() {
  const [state, setState] = useState<State>('checking');
  const tokenSlotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setState(getAccessToken() ? 'ready' : 'logged-out');
  }, []);

  function handleConnect() {
    const token = getAccessToken();
    if (!token) {
      setState('logged-out');
      return;
    }
    const origin = window.location.origin;

    // Channel 2 (fallback): stamp the token onto a hidden div so a content
    // script that missed the postMessage can still read it.
    if (tokenSlotRef.current) {
      tokenSlotRef.current.setAttribute('data-callbackcv-token', token);
      tokenSlotRef.current.setAttribute('data-callbackcv-apibase', API_BASE);
    }

    // Channel 1 (primary): targeted, same-origin postMessage.
    window.postMessage(
      { source: 'callbackcv-connect', token, apiBase: API_BASE },
      origin,
    );

    setState('connected');
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Connect your extension</h1>

        {state === 'checking' && <p style={styles.muted}>Checking your session…</p>}

        {state === 'logged-out' && (
          <>
            <p style={styles.body}>
              You need to be signed in to connect the CallbackCV browser
              extension to your account.
            </p>
            <Link
              href="/auth/login?next=/extension/connect"
              style={styles.buttonLink}
            >
              Sign in to continue
            </Link>
          </>
        )}

        {state === 'ready' && (
          <>
            <p style={styles.body}>
              Click below to securely link the CallbackCV extension to your
              account. Your access token is shared only with the extension on
              this device, and only when you click.
            </p>
            <button type="button" onClick={handleConnect} style={styles.button}>
              Connect my extension
            </button>
            <p style={styles.muted}>
              Nothing is sent until you click. The token never leaves this
              browser except to authenticate your own API calls.
            </p>
          </>
        )}

        {state === 'connected' && (
          <>
            <p style={{ ...styles.body, color: '#147a3a', fontWeight: 600 }}>
              Connected! You can close this tab.
            </p>
            <p style={styles.muted}>
              If the extension didn&apos;t pick it up, make sure it&apos;s
              installed and enabled, then click Connect again.
            </p>
            <button type="button" onClick={handleConnect} style={styles.buttonSecondary}>
              Connect again
            </button>
          </>
        )}

        {/* Hidden fallback token slot — populated only on click. */}
        <div id="callbackcv-token-slot" ref={tokenSlotRef} hidden aria-hidden="true" />
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: '70vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    maxWidth: 460,
    width: '100%',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '28px 28px 24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  h1: { fontSize: 22, margin: '0 0 12px', color: '#111' },
  body: { fontSize: 15, lineHeight: 1.5, color: '#333', margin: '0 0 18px' },
  muted: { fontSize: 12.5, color: '#888', margin: '14px 0 0', lineHeight: 1.5 },
  button: {
    padding: '10px 18px',
    background: '#0a64dc',
    color: '#fff',
    border: 0,
    borderRadius: 7,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 15,
  },
  buttonSecondary: {
    marginTop: 12,
    padding: '8px 16px',
    background: '#fff',
    color: '#0a64dc',
    border: '1px solid #0a64dc',
    borderRadius: 7,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
  },
  buttonLink: {
    display: 'inline-block',
    padding: '10px 18px',
    background: '#0a64dc',
    color: '#fff',
    borderRadius: 7,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 15,
  },
};
