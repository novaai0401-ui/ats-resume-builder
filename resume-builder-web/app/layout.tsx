import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import 'tekivex-ui/styles';
import './globals.css';
import TopNav from '@/src/components/TopNav';
import MobileBottomNav from '@/src/components/MobileBottomNav';
import SiteFooter from '@/src/components/SiteFooter';
import { NavigationProgress } from '@/src/components/NavigationProgress';
import Providers from '@/src/components/Providers';
import FreeTrialLimitModalHost from '@/src/components/FreeTrialLimitModalHost';
import PwaInstaller from '@/src/components/PwaInstaller';
import SkipToContent from '@/src/components/SkipToContent';
import TrainingConsentModal from '@/src/components/TrainingConsentModal';
import ThemeToggle from '@/src/components/ThemeToggle';
import { themeNoFlashScript } from '@/src/lib/theme';

// Site URL is read from env at build time so we can use staging /
// production hostnames in OpenGraph and canonical tags. Fallback is
// the real prod URL — better to point at production than localhost
// when the env var is missing in CI.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'CallbackCV — ATS-optimized resume builder',
    template: '%s · CallbackCV',
  },
  description:
    'Free ATS-friendly resume builder that measures your real callback rate per resume version. ' +
    'Build, score, and export resumes that actually pass applicant tracking systems. Your resume ' +
    'is stored in your account, encrypted in transit and at rest, and never sold.',
  keywords: [
    'ATS resume builder',
    'free resume builder',
    'resume maker',
    'CV builder',
    'ATS-friendly resume',
    'resume templates India',
    'job application tracker',
    'cover letter generator',
    'callbackcv',
  ],
  manifest: '/manifest.json',
  applicationName: 'CallbackCV',
  authors: [{ name: 'CallbackCV' }],
  category: 'productivity',
  appleWebApp: {
    capable: true,
    title: 'CallbackCV',
    statusBarStyle: 'black-translucent' as const,
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon.svg' }],
  },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    type: 'website',
    siteName: 'CallbackCV',
    title: 'CallbackCV — ATS-optimized resume builder',
    description:
      'Build, score, and export resumes that pass ATS — and measure your real callback rate per ' +
      'version. Free to start; your data is encrypted and never sold. Works on web and mobile with one account.',
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: '/icons/icon.svg', width: 512, height: 512, alt: 'CallbackCV' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CallbackCV — ATS-optimized resume builder',
    description:
      'Build, score, and export resumes that pass ATS — and measure your real callback rate. Encrypted, never sold. Free to start.',
    images: ['/icons/icon.svg'],
  },
  formatDetection: { email: false, address: false, telephone: false },
};

// Mobile-first viewport. Without this, phones render the site at desktop
// width and zoom out — the single biggest mobile bug. `viewportFit: 'cover'`
// lets content sit under notches on iOS when we opt in per-element.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f2f5f8',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Resolve the stored light/dark preference BEFORE first paint and
         * stamp `data-theme` on <html>. Without this the page renders in the
         * default theme and then snaps to the chosen one, which reads as a
         * flash of the wrong colours on every navigation. Must stay the first
         * thing in <head> and must stay synchronous. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript() }} />
        {/* Hard-coded viewport meta as a belt-and-braces guarantee. Next.js
         * normally injects this via the `viewport` export above, but in some
         * route configurations the streamed metadata can be dropped during
         * client hydration, leaving phones to fall back to the 980px desktop
         * default and zoom out. Pinning the meta literally avoids that. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* JSON-LD structured data so Google understands what this site
         * is and can render rich results (sitelinks, knowledge panel,
         * SoftwareApplication card). Two schemas: SoftwareApplication
         * for the product itself, WebSite for the site-wide search. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'SoftwareApplication',
                  name: 'CallbackCV',
                  applicationCategory: 'BusinessApplication',
                  operatingSystem: 'Web, iOS, Android',
                  url: SITE_URL,
                  description:
                    'ATS-optimized resume builder that measures your real callback rate per resume version. Build, score, and export resumes that pass applicant tracking systems. Resumes are stored in your account, encrypted in transit and at rest, never sold, and never used to train AI without your explicit opt-in.',
                  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
                  aggregateRating: undefined,
                },
                {
                  '@type': 'WebSite',
                  name: 'CallbackCV',
                  url: SITE_URL,
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: `${SITE_URL}/dashboard?q={search_term_string}`,
                    'query-input': 'required name=search_term_string',
                  },
                },
              ],
            }),
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* R-045 — webfonts for the resume Design picker (FONT_OPTIONS). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Inter:wght@400;600;700&family=Lato:wght@400;700&family=Literata:wght@400;600;700&family=Merriweather:wght@400;700&family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:wght@400;600;700&family=Work+Sans:wght@400;600;700&display=swap"
        />
      </head>
      <body>
        <SkipToContent targetId="main-content" />
        <Providers>
          <NavigationProgress />
          <div className="main-shell">
            <header className="topbar">
              <div className="brand">CallbackCV</div>
              <TopNav />
              <ThemeToggle />
            </header>
            {/* Skip-link target. tabindex="-1" lets us focus a non-interactive
             * wrapper without putting it in the tab order. Most pages render
             * their own <main> inside, so we use a plain <div> here to avoid
             * nesting <main> landmarks. */}
            <div id="main-content" tabIndex={-1}>
              {children}
            </div>
          </div>
          {/* R-036: fixed bottom nav on phones. Renders the same 5
              hubs as the desktop top-nav so navigation stays in one
              place. CSS handles the breakpoint; component renders
              only when authed. */}
          <SiteFooter />
          <MobileBottomNav />
          <PwaInstaller />
          <TrainingConsentModal />
          {/* R-098: app-wide "you've used your one free AI run" popup. */}
          <FreeTrialLimitModalHost />
        </Providers>
      </body>
    </html>
  );
}
