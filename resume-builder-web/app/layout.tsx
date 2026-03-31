import type { ReactNode } from 'react';
import './globals.css';
import TopNav from '@/src/components/TopNav';

export const metadata = {
  title: 'Resume Builder',
  description: 'ATS-optimized resume builder',
  viewport: 'width=device-width, initial-scale=1.0, maximum-scale=5.0',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Literata:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&family=Work+Sans:wght@400;600;700&display=swap"
        />
      </head>
      <body>
        <div className="main-shell">
          <header className="topbar">
            <div className="brand">Resume Builder</div>
            <TopNav />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
