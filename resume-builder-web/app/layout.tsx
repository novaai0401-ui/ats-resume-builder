import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import 'tekivex-ui/styles';
import './globals.css';
import TopNav from '@/src/components/TopNav';
import Providers from '@/src/components/Providers';
import PwaInstaller from '@/src/components/PwaInstaller';

export const metadata = {
  title: 'Pocket Resume',
  description: 'ATS-optimized resume builder — same login on web and mobile.',
  manifest: '/manifest.json',
  applicationName: 'Pocket Resume',
  appleWebApp: {
    capable: true,
    title: 'Pocket Resume',
    statusBarStyle: 'black-translucent' as const,
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon.svg' }],
  },
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
        </Providers>
      </body>
    </html>
  );
}
