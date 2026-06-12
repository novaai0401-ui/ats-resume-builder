'use client';

/**
 * R-036 — card grid used by the Applications / Coach hub landing
 * pages. Reads its data from `NAV_HUBS` in `nav-hubs.ts`, so adding a
 * tool to a hub is a single edit there and both the nav highlight and
 * this grid pick it up.
 *
 * The grid is deliberately plain: title + one-line blurb + optional
 * plan badge. No icons. The job is to answer "what's behind this
 * link?" — the surface the founder reported new users couldn't read.
 */

import Link from 'next/link';
import type { HubTool } from '@/src/lib/nav-hubs';

export default function HubCardGrid({
  title,
  intro,
  tools,
}: {
  title: string;
  intro: string;
  tools: HubTool[];
}) {
  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>{title}</h1>
        <p className="small" style={{ margin: 0, color: '#5a6778' }}>{intro}</p>
      </section>

      <section className="col-12" aria-label={`${title} tools`}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="card"
              style={cardStyle}
              aria-label={`${tool.label} — ${tool.blurb}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17, color: '#1a3a5c' }}>{tool.label}</h2>
                {tool.planBadge ? (
                  <span style={badgeStyle(tool.planBadge)}>{tool.planBadge}</span>
                ) : null}
              </div>
              <p className="small" style={{ margin: '6px 0 0', color: '#3a4655', lineHeight: 1.5 }}>
                {tool.blurb}
              </p>
              <span style={arrowStyle} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  textDecoration: 'none',
  color: 'inherit',
  position: 'relative',
  padding: '16px 18px',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  background: '#ffffff',
  transition: 'border-color 120ms ease, transform 120ms ease',
};

const arrowStyle: React.CSSProperties = {
  position: 'absolute',
  right: 14,
  bottom: 12,
  color: '#1a3a5c',
  fontSize: 18,
};

function badgeStyle(tier: 'PRO' | 'STUDENT+'): React.CSSProperties {
  const bg = tier === 'PRO' ? '#1a3a5c' : '#1e7a3a';
  return {
    display: 'inline-block',
    background: bg,
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '2px 8px',
    borderRadius: 4,
    flexShrink: 0,
  };
}
