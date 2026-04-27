'use client';

/**
 * Banner shown wherever we render AI-generated output (ATS score, tech gap).
 * Makes it clear that the free-tier AI can make mistakes so the user knows
 * to cross-check critical claims and understands why deeper analysis is a
 * paid feature.
 */
export default function FreeAiNotice({ variant = 'inline' }: { variant?: 'inline' | 'card' }) {
  const style =
    variant === 'card'
      ? {
          width: '100%',
          boxSizing: 'border-box' as const,
          // When dropped into a .grid parent (e.g. Career Navigator), span all columns
          // instead of collapsing into a single 1/12-wide column. No-op outside a grid.
          gridColumn: '1 / -1',
          padding: '10px 12px',
          background: '#fff8e1',
          border: '1px solid #f4d37a',
          borderRadius: 8,
          margin: '10px 0',
          fontSize: 13,
          color: '#6b5200',
        }
      : {
          padding: '6px 10px',
          background: '#fff8e1',
          borderLeft: '3px solid #f4d37a',
          margin: '6px 0',
          fontSize: 12,
          color: '#6b5200',
        };

  return (
    <div role="note" aria-label="Free AI disclaimer" style={style}>
      <strong>Free AI — may make mistakes.</strong>{' '}
      This analysis uses our free AI tier. Results are useful signal, not guaranteed accuracy.
      For a full 100% ATS optimisation and detailed tech-gap plan, consider subscribing after you download.
    </div>
  );
}
