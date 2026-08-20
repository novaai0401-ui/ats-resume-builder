'use client';

import { useEffect, useState } from 'react';
import { api } from '@/src/lib/api';

/**
 * Settings → "Login activity": the user's recent sign-ins with device and
 * approximate location signal (IP), so they can spot a login that was not
 * them. Founder ask (verbatim intent): "when user login with multiple device
 * it will show to the user from where and which device they login". Data
 * comes from the LoginEvent rows the API writes on every login; new-device
 * email alerts ride the same rows.
 */

type LoginEventRow = {
  id: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

/** Human name for a raw user-agent — enough to recognise "my phone" vs "not me". */
export function describeDevice(userAgent: string | null): string {
  const ua = String(userAgent || '');
  if (!ua) return 'Unknown device';
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iPhone/iPad'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux'
            : '';
  // Order matters: Edge/Opera UAs also contain "Chrome", Chrome UAs contain "Safari".
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : '';
  if (os && browser) return `${browser} on ${os}`;
  return os || browser || 'Unknown device';
}

function methodLabel(method: string): string {
  switch (method) {
    case 'password': return 'Password';
    case 'linkedin': return 'LinkedIn';
    case 'email_otp': return 'Email code';
    default: return method || 'Sign-in';
  }
}

export default function LoginActivityCard() {
  const [events, setEvents] = useState<LoginEventRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getLoginActivity()
      .then((res) => { if (!cancelled) setEvents(res.events); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load login activity.');
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="card" style={{ marginTop: 16 }} data-testid="login-activity-card">
      <h2 style={{ marginTop: 0 }}>Login activity</h2>
      <p className="small" style={{ color: 'var(--muted)' }}>
        Recent sign-ins to your account — device, IP address, and time. If a login here
        isn&apos;t you, change your password immediately. We also email you whenever your
        account is accessed from a new device.
      </p>
      {error ? (
        <p className="small" role="alert" style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>
      ) : events === null ? (
        <p className="small" style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : events.length === 0 ? (
        <p className="small" style={{ color: 'var(--muted)' }}>No sign-ins recorded yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {events.map((ev) => (
            <li
              key={ev.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px 12px',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <strong>{describeDevice(ev.userAgent)}</strong>
                <span className="small" style={{ color: 'var(--muted)' }}>
                  {' '}· {methodLabel(ev.method)}{ev.ip ? ` · IP ${ev.ip}` : ''}
                </span>
              </span>
              <span className="small" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {new Date(ev.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
