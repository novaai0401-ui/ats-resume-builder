import type { ReactNode } from 'react';

/**
 * Shared premium treatment for the trust pages (About / Contact / Terms /
 * Accessibility). The first versions were unstyled prose — accurate, but next
 * to Zety-class competitors they read as a side project, and trust pages are
 * where skeptical visitors and payment-gateway reviewers land first.
 *
 * One set of primitives instead of four page-local designs, so the pages stay
 * visually consistent and the next trust page inherits the look for free.
 * Styling lives in globals.css under .tp-* (token-based: light/dark for free).
 */

export function TrustHero({
  eyebrow,
  title,
  accent,
  children,
}: {
  eyebrow: string;
  /** Plain part of the H1. */
  title: string;
  /** Gradient-highlighted part of the H1. */
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <header className="tp-hero">
      <p className="tp-eyebrow">{eyebrow}</p>
      <h1 className="tp-title">
        {title}
        {accent ? <span className="tp-title__accent"> {accent}</span> : null}
      </h1>
      {children ? <div className="tp-sub">{children}</div> : null}
    </header>
  );
}

export function TrustGrid({ children }: { children: ReactNode }) {
  return <div className="tp-grid">{children}</div>;
}

export function TrustCard({
  icon,
  title,
  wide,
  children,
}: {
  /** A single glyph/emoji — rendered in the accent chip. */
  icon: string;
  title: string;
  /** Span the full grid width (for long-form sections). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`tp-card${wide ? ' tp-card--wide' : ''}`}>
      <div className="tp-card__head">
        <span className="tp-card__icon" aria-hidden="true">{icon}</span>
        <h2 className="tp-card__title">{title}</h2>
      </div>
      <div className="tp-card__body">{children}</div>
    </section>
  );
}

/** Checklist with ✓ (ok) / ⚠ (warn) markers — the honest-status pattern. */
export function TrustChecklist({
  items,
}: {
  items: Array<{ ok: boolean; text: ReactNode }>;
}) {
  return (
    <ul className="tp-check">
      {items.map((item, i) => (
        <li key={i} className={item.ok ? 'tp-check__item tp-check__item--ok' : 'tp-check__item tp-check__item--warn'}>
          <span className="tp-check__mark" aria-hidden="true">{item.ok ? '✓' : '!'}</span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Full-width gradient-bordered call-to-action band. */
export function TrustCta({ children }: { children: ReactNode }) {
  return <div className="tp-cta">{children}</div>;
}

export function TrustPageShell({ children }: { children: ReactNode }) {
  return <main className="tp-page">{children}</main>;
}
