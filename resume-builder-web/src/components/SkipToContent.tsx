/**
 * Skip-to-content link, mounted at the very top of the page so it is
 * the first focusable element a keyboard user reaches on every page
 * load. Hidden visually until focused, then becomes a high-contrast
 * pill in the top-left corner — standard pattern for WCAG 2.4.1
 * (Bypass Blocks). Lets keyboard / screen-reader users skip the
 * top-nav and jump straight to the main content of the page.
 *
 * Companion: every page's <main> element should carry id="main"
 * (Next.js App Router default in this project does that already).
 */

import React from 'react';

export default function SkipToContent({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="skip-to-content"
      // Inline focus style so the link works even before globals.css
      // has hydrated. The :focus state lifts it back into view.
      style={defaultStyle}
      onFocus={(e) => {
        e.currentTarget.style.left = '16px';
        e.currentTarget.style.top = '12px';
        e.currentTarget.style.width = 'auto';
        e.currentTarget.style.height = 'auto';
        e.currentTarget.style.padding = '10px 14px';
        e.currentTarget.style.background = '#1a3a5c';
        e.currentTarget.style.color = '#ffffff';
        e.currentTarget.style.borderRadius = '8px';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(15, 23, 42, 0.25)';
        e.currentTarget.style.zIndex = '10000';
      }}
      onBlur={(e) => {
        // Re-hide off-screen on blur so it does not visually overlap
        // the header during normal use.
        Object.assign(e.currentTarget.style, defaultStyle);
      }}
    >
      Skip to main content
    </a>
  );
}

const defaultStyle: React.CSSProperties = {
  position: 'fixed',
  left: '-9999px',
  top: 'auto',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  background: 'transparent',
  color: 'transparent',
  textDecoration: 'none',
};
