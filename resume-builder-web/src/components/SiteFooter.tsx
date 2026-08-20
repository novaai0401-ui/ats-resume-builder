import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/src/lib/support';

/**
 * Site-wide footer, competitor-grade: a brand column that says what the
 * product is, link groups by intent (Product / Job Search / Company / Legal),
 * and the © line. The first version was a single row of links — accurate but
 * it read as a side project next to Zety-class footers, and the footer is on
 * every page, so it sets the perceived quality floor for all of them.
 *
 * Server component: pure links, no state. Colours come from tokens plus the
 * shared gradient bar, so light/dark both work without extra rules.
 */
const LINK_GROUPS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: 'Product',
    links: [
      { href: '/ats-resume-templates', label: 'ATS Resume Templates' },
      { href: '/resume-templates', label: 'Templates by Industry' },
      { href: '/ats-resume-checker', label: 'Free ATS Checker' },
      { href: '/ai-assistants', label: 'Build in ChatGPT/Claude' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Job Search',
    links: [
      { href: '/jobs', label: 'Job Tracker' },
      { href: '/jd-match', label: 'JD Match' },
      { href: '/interview-prep', label: 'Interview Prep' },
      { href: '/skill-demand', label: 'Skill Demand' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/accessibility', label: 'Accessibility' },
      { href: '/compare', label: 'Compare Us' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__grid">
        <div className="site-footer__brand">
          <p className="site-footer__logo">
            <Link
              href="/"
              aria-label="CallbackCV home"
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon.svg?v=2" alt="" width={22} height={22} style={{ borderRadius: 6 }} />
              CallbackCV
            </Link>
          </p>
          <p className="site-footer__tagline">
            The resume builder that measures what matters: real callbacks, per resume version.
            ATS-safe templates, honest AI, and proof your resume is working.
          </p>
          <p className="site-footer__meta">
            Made by Tekivex · <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </div>
        {LINK_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title} className="site-footer__group">
            <p className="site-footer__group-title">{group.title}</p>
            {group.links.map((link) => (
              <Link key={link.href} href={link.href} className="site-footer__link">
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <p className="site-footer__copyright">
        © {new Date().getFullYear()} CallbackCV · A Tekivex product. All rights reserved.
      </p>
    </footer>
  );
}
