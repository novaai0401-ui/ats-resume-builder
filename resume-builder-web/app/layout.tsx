import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import 'tekivex-ui/styles';
import './globals.css';
import TopNav from '@/src/components/TopNav';
import Providers from '@/src/components/Providers';
import PwaInstaller from '@/src/components/PwaInstaller';
import TrainingConsentModal from '@/src/components/TrainingConsentModal';

// Site URL is read from env at build time so we can use staging /
// production hostnames in OpenGraph and canonical tags. Fallback is
// the real prod URL — better to point at production than localhost
// when the env var is missing in CI.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pocketresume.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Pocket Resume — ATS-optimized resume builder',
    template: '%s · Pocket Resume',
  },
  description:
    'Free ATS-friendly resume builder. Build, score, and export resumes that actually pass ' +
    'applicant tracking systems. Local-first privacy: your resume stays on your device.',
  keywords: [
    'ATS resume builder',
    'free resume builder',
    'resume maker',
    'CV builder',
    'ATS-friendly resume',
    'resume templates India',
    'job application tracker',
    'cover letter generator',
    'pocket resume',
  ],
  manifest: '/manifest.json',
  applicationName: 'Pocket Resume',
  authors: [{ name: 'Pocket Resume' }],
  category: 'productivity',
  appleWebApp: {
    capable: true,
    title: 'Pocket Resume',
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
    siteName: 'Pocket Resume',
    title: 'Pocket Resume — ATS-optimized resume builder',
    description:
      'Build, score, and export resumes that pass ATS. Free to start, local-first privacy, ' +
      'works on web and mobile with one account.',
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: '/icons/icon.svg', width: 512, height: 512, alt: 'Pocket Resume' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pocket Resume — ATS-optimized resume builder',
    description:
      'Build, score, and export resumes that pass ATS. Local-first privacy. Free to start.',
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
    <html lang="en">
      <head>
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
                  name: 'Pocket Resume',
                  applicationCategory: 'BusinessApplication',
                  operatingSystem: 'Web, iOS, Android',
                  url: SITE_URL,
                  description:
                    'ATS-optimized resume builder. Build, score, and export resumes that pass applicant tracking systems. Local-first privacy.',
                  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
                  aggregateRating: undefined,
                },
                {
                  '@type': 'WebSite',
                  name: 'Pocket Resume',
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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Literata:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&family=Work+Sans:wght@400;600;700&display=swap"
        />
      </head>
      <body>
        <Providers>
          <div className="main-shell">
            <header className="topbar">
              <div className="brand">Pocket Resume</div>
              <TopNav />
            </header>
            {children}
          </div>
          <PwaInstaller />
          <TrainingConsentModal />
        </Providers>
      </body>
    </html>
  );
}
