/**
 * R-087 — the "no fake numbers" guarantee, made visible.
 *
 * Every competitor's AI bullet-writer is known to invent metrics
 * ("reduced latency by 67%") that were never in the user's history.
 * Our prompts explicitly forbid inventing achievements, numbers, or
 * skills (see ai/prompts + rewrite/tailor system prompts, all of which
 * carry a "do not invent" rule). This badge surfaces that contract on
 * every AI panel so the differentiator is felt, not buried (C-003:
 * we only claim it because the prompts actually enforce it).
 */
export default function AiTrustNote({ style }: { style?: React.CSSProperties }) {
  return (
    <p
      className="small"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        margin: '6px 0 0',
        color: 'var(--muted)',
        ...style,
      }}
    >
      <span aria-hidden="true">🛡️</span>
      AI suggestions never invent numbers, achievements, or skills — they only rephrase what&rsquo;s really on your resume.
    </p>
  );
}
