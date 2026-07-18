'use client';

import { SUPPORT_EMAIL, supportMailto } from '@/src/lib/support';

/**
 * A friendly "stuck? email us" affordance for high-friction surfaces
 * (login, register, password reset, payment). Opens the user's mail client
 * pre-filled so a struggling user can reach a human in one tap — important
 * for a first launch where trust matters more than polish.
 */
export function SupportHelpLink({
  subject = 'Help with CallbackCV',
  message = 'Trouble signing in or registering?',
  variant = 'link',
}: {
  subject?: string;
  message?: string;
  variant?: 'link' | 'button';
}) {
  if (variant === 'button') {
    return (
      <a className="btn ghost support-help-btn" href={supportMailto(subject)}>
        ✉️ Facing an issue? Email us
      </a>
    );
  }
  return (
    <p className="small support-help-link" style={{ textAlign: 'center', marginTop: 12, color: 'var(--muted)' }}>
      {message}{' '}
      <a href={supportMailto(subject)} style={{ color: 'var(--primary)', fontWeight: 600 }}>
        Email {SUPPORT_EMAIL}
      </a>{' '}
      — we reply fast.
    </p>
  );
}
