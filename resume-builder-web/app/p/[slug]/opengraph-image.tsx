import { ImageResponse } from 'next/og';

/**
 * Personalised OG image for public portfolio links — the share that matters
 * most. When a candidate pastes their /p/… link to a recruiter on WhatsApp or
 * LinkedIn, the preview now carries THEIR name and headline on the brand
 * field, instead of a generic (or missing) card. The candidate looks
 * professional, and every share doubles as a CallbackCV ad.
 *
 * Reads the same public payload as the page (name may be masked by the owner's
 * contact settings — we render exactly what the page would show). Falls back
 * to the generic branding when the payload is unavailable, so a revoked link
 * still previews sanely.
 */
export const alt = 'Resume portfolio on CallbackCV';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type PayloadLike = {
  headline: string | null;
  resume: { contact?: { fullName?: string } };
  meta?: { portfolio?: boolean };
};

export default async function Image({
  params,
}: {
  params: { slug: string } | Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let payload: PayloadLike | null = null;
  try {
    const res = await fetch(`${API_BASE}/p/${encodeURIComponent(slug)}/data`, {
      // Owners edit headlines; let platforms refresh within the hour.
      next: { revalidate: 3600 },
    });
    if (res.ok) payload = (await res.json()) as PayloadLike;
  } catch {
    payload = null;
  }

  const name = payload?.resume?.contact?.fullName?.trim() || 'Resume Portfolio';
  const headline = payload?.headline?.trim() || '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 90px',
          background: 'linear-gradient(135deg, #131233 0%, #2c2a72 55%, #4f46e5 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="112" fill="#ffffff" fillOpacity="0.14" />
            <path d="M345,346 A128,128 0 1 1 345,166" fill="none" stroke="#ffffff" strokeWidth="52" strokeLinecap="round" />
            <path d="M316,120 L412,150 L342,222 Z" fill="#ffffff" />
            <path d="M198,262 L244,310 L330,208" fill="none" stroke="#a78bfa" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: 'flex', fontSize: 30, color: '#c9c3fa', fontWeight: 700 }}>CallbackCV</div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: name.length > 22 ? 62 : 78,
            fontWeight: 800,
            marginTop: 34,
            letterSpacing: -1.5,
          }}
        >
          {name}
        </div>
        {headline ? (
          <div style={{ display: 'flex', fontSize: 34, marginTop: 16, color: '#d9d6ff' }}>{headline}</div>
        ) : null}
        <div style={{ display: 'flex', fontSize: 26, marginTop: 40, color: '#a99ef5' }}>
          View resume · Download PDF
        </div>
      </div>
    ),
    size,
  );
}
