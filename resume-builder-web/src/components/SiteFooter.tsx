import Link from 'next/link';

/**
 * Site-wide footer: legal/trust links + copyright.
 *
 * The app had NO footer — competitors close every page with
 * About / Accessibility / Contact / Privacy / Terms / Templates / Pricing,
 * and the absence reads as "side project" to both users and reviewers.
 * There's a harder reason too: Razorpay/Stripe onboarding and Google's
 * E-E-A-T signals both look for exactly these pages, so this footer is
 * infrastructure, not decoration.
 *
 * Server component — pure links, no state, renders on every page.
 */
const FOOTER_LINKS: Array<{ href: string; label: string }> = [
  { href: '/about', label: 'About' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/ats-resume-templates', label: 'Resume Templates' },
  { href: '/pricing', label: 'Pricing' },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Footer" className="site-footer__links">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="site-footer__link">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="site-footer__copyright">
        © {new Date().getFullYear()} CallbackCV · A Tekivex product. All rights reserved.
      </p>
    </footer>
  );
}
