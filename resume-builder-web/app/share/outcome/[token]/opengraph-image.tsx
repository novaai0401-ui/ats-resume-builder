import { ImageResponse } from 'next/og';

// File-based OG metadata for the public share route. When a callback card link
// is pasted into LinkedIn / WhatsApp / Slack, this renders a rich preview image
// with the headline number — turning every share into an ad for the product.

export const alt = 'My job-search callback rate';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type CardLike = {
  callbackRate: number;
  applied: number;
  interviews: number;
  offers: number;
};

export default async function Image({
  params,
}: {
  params: { token: string } | Promise<{ token: string }>;
}) {
  const { token } = await params;
  let card: CardLike | null = null;
  try {
    const res = await fetch(`${baseUrl}/public/outcome-card/${encodeURIComponent(token)}`, {
      // Snapshot is immutable per-token; let the platform cache the image.
      next: { revalidate: 3600 },
    });
    if (res.ok) card = (await res.json()) as CardLike;
  } catch {
    card = null;
  }

  const rate = card ? `${card.callbackRate}%` : '—';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px',
          background: 'linear-gradient(135deg, #0d1b2a 0%, #1b3a5b 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 2, textTransform: 'uppercase', color: '#9bb4d4' }}>
          Verified job-search results
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
          <div style={{ fontSize: 220, fontWeight: 800, lineHeight: 1 }}>{rate}</div>
          <div style={{ fontSize: 44, color: '#cdd9ec', marginLeft: 28 }}>callback rate</div>
        </div>
        {card ? (
          <div style={{ display: 'flex', gap: 56, marginTop: 28, fontSize: 36, color: '#cdd9ec' }}>
            <div>{card.applied} applications</div>
            <div>{card.interviews} interviews</div>
            <div>{card.offers} offers</div>
          </div>
        ) : null}
        <div style={{ marginTop: 'auto', fontSize: 32, color: '#7d97bd' }}>
          Measured, not predicted · Pocket Resume
        </div>
      </div>
    ),
    { ...size },
  );
}
