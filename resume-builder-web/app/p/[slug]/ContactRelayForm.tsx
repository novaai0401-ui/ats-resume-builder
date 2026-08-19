'use client';

import { useState } from 'react';
import { TkxTextarea } from 'tekivex-ui';

/**
 * R-038 Phase 2 — contact-relay form on the public share page.
 *
 * Only mounted when the owner has turned on maskContact. The form
 * POSTs to /p/:slug/contact; the API forwards to the owner via SMTP
 * with the recruiter's email set as Reply-To. The owner's address
 * never reaches the recruiter.
 *
 * Honest UX:
 *   - the "the owner's email is hidden from you" disclosure is loud,
 *     not buried;
 *   - the success state acknowledges the relay model ("we forwarded
 *     your message") rather than implying the owner has been notified
 *     in real time;
 *   - rate-limit rejection (HTTP 429) is reported clearly.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

export default function ContactRelayForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/p/${encodeURIComponent(slug)}/contact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          senderName: name.trim(),
          senderEmail: email.trim(),
          senderCompany: company.trim() || null,
          message: message.trim(),
        }),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setStatus({
          type: 'err',
          text: body?.message || 'This link has hit its daily contact limit. Try again tomorrow.',
        });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: 'err', text: body?.message || 'Could not send the message right now.' });
        return;
      }
      setStatus({
        type: 'ok',
        text: 'Message forwarded. If the owner replies, the reply will go to your email address.',
      });
      setName('');
      setEmail('');
      setCompany('');
      setMessage('');
    } catch {
      setStatus({ type: 'err', text: 'Network error — please try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <strong style={{ color: '#1a3a5c' }}>Contact details are hidden</strong>
            <p className="small" style={{ margin: '4px 0 0', color: '#5a6778' }}>
              The owner enabled contact masking. You can still send them a message — we'll forward it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={primaryBtnStyle}
          >
            Get in touch
          </button>
        </div>
      </div>
    );
  }

  return (
    <form style={panelStyle} onSubmit={submit} aria-label="Contact the resume owner">
      <p className="small" style={{ margin: '0 0 10px', color: '#5a6778' }}>
        We'll forward your message to the owner. The owner's email address is hidden from
        you; if they reply, the reply will come from their address directly to yours.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <input
          type="text"
          placeholder="Your name *"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
        <input
          type="email"
          placeholder="Your email *"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Company (optional)"
          maxLength={200}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />
        <TkxTextarea
          label="Your message"
          isRequired
          required
          showCount
          maxLength={4000}
          minRows={5}
          placeholder="Your message *"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy} style={primaryBtnStyle}>
          {busy ? 'Sending…' : 'Send message'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          style={{ ...primaryBtnStyle, background: '#ffffff', color: '#1a3a5c', border: '1px solid #cbd5e1' }}
        >
          Cancel
        </button>
      </div>
      {status ? (
        <p
          role={status.type === 'err' ? 'alert' : 'status'}
          style={{
            marginTop: 10,
            marginBottom: 0,
            fontSize: 13,
            color: status.type === 'ok' ? '#1e7a3a' : '#b91c1c',
          }}
        >
          {status.text}
        </p>
      ) : null}
    </form>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 14,
  padding: '14px 16px',
  background: '#f0f7ff',
  border: '1px solid #c4d5e6',
  borderRadius: 10,
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#1a3a5c',
  color: '#ffffff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  background: '#ffffff',
  color: '#1f2937',
  width: '100%',
  boxSizing: 'border-box',
};
