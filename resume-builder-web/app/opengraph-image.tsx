import { ImageResponse } from 'next/og';

/**
 * Site-wide OG image. Any CallbackCV link pasted into WhatsApp / LinkedIn /
 * Slack previously previewed with NO image — a text-only card next to
 * competitors' branded ones. Every page without its own opengraph-image now
 * inherits this branded 1200×630: dark brand-gradient field, the callback-loop
 * mark (drawn inline — ImageResponse can't load the SVG file), wordmark and
 * the one-line pitch.
 *
 * next/og renders JSX to PNG at build time, so this stays a static asset with
 * zero runtime cost.
 */
export const alt = 'CallbackCV — know which resume actually gets callbacks';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #131233 0%, #2c2a72 55%, #4f46e5 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        {/* The callback-loop mark, inline */}
        <svg width="120" height="120" viewBox="0 0 512 512">
          <rect width="512" height="512" rx="112" fill="#ffffff" fillOpacity="0.12" />
          <path
            d="M345,346 A128,128 0 1 1 345,166"
            fill="none"
            stroke="#ffffff"
            strokeWidth="52"
            strokeLinecap="round"
          />
          <path d="M316,120 L412,150 L342,222 Z" fill="#ffffff" />
          <path
            d="M198,262 L244,310 L330,208"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="46"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, marginTop: 28, letterSpacing: -2 }}>
          CallbackCV
        </div>
        <div style={{ display: 'flex', fontSize: 34, marginTop: 14, color: '#d9d6ff', textAlign: 'center' }}>
          Know which resume actually gets callbacks.
        </div>
        <div style={{ display: 'flex', fontSize: 24, marginTop: 30, color: '#a99ef5' }}>
          ATS-safe builder · honest AI · real callback tracking
        </div>
      </div>
    ),
    size,
  );
}
