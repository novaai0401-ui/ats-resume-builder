/**
 * Memory summarizer — compresses recent SahaayakEvent rows into short
 * context lines for the system prompt. Rule-based by design: we want
 * deterministic memory that the user can audit, not an LLM-fabricated
 * narrative.
 *
 * Pattern detection is the high-value piece: "three Series B fintech
 * rejections this month" is exactly the kind of observation no stateless
 * chat can ever produce.
 */

export interface EventRow {
  kind: string;
  payload: any;
  note?: string | null;
  moodRating?: number | null;
  occurredAt: Date | string;
}

export interface SummaryOutput {
  /** One-line bullets, ready to drop into the system prompt. */
  bullets: string[];
  /** Observed patterns the model should be aware of. */
  patterns: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeEvents(events: EventRow[], now: Date = new Date()): SummaryOutput {
  const bullets: string[] = [];
  const patterns: string[] = [];

  const recent = events
    .slice()
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
    .slice(0, 20);

  for (const ev of recent) {
    bullets.push(formatEvent(ev, now));
  }

  // Pattern: rejection clustering by industry / company-shape in last 30 days.
  const last30 = recent.filter((e) => +now - +new Date(e.occurredAt) <= 30 * DAY_MS);
  const rejections = last30.filter((e) => e.kind === 'rejection');
  if (rejections.length >= 3) {
    const industries = new Map<string, number>();
    for (const r of rejections) {
      const ind = String(r.payload?.industry || '').toLowerCase().trim();
      if (ind) industries.set(ind, (industries.get(ind) || 0) + 1);
    }
    const topIndustry = [...industries.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topIndustry && topIndustry[1] >= 3) {
      patterns.push(`Three or more rejections in "${topIndustry[0]}" in the last 30 days — worth noting, not concluding.`);
    } else {
      patterns.push(`${rejections.length} rejections in the last 30 days. The cadence is heavy; that matters.`);
    }
  }

  // Pattern: mood trend — if last 3 mood ratings average < 2.5, flag.
  const moods = recent
    .filter((e) => typeof e.moodRating === 'number' && (e.moodRating ?? 0) > 0)
    .slice(0, 3)
    .map((e) => Number(e.moodRating));
  if (moods.length >= 3) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
    if (avg < 2.5) {
      patterns.push(`Recent mood ratings average ${avg.toFixed(1)}/5. They've been low for a while.`);
    }
  }

  // Pattern: silence streak — last interview > 14 days ago and no recent events.
  const lastInterview = recent.find((e) => e.kind === 'interview');
  const daysSinceInterview = lastInterview
    ? Math.floor((+now - +new Date(lastInterview.occurredAt)) / DAY_MS)
    : null;
  if (daysSinceInterview !== null && daysSinceInterview >= 14) {
    patterns.push(`No interview logged in ${daysSinceInterview} days. The wait is part of the story.`);
  }

  return { bullets, patterns };
}

function formatEvent(ev: EventRow, now: Date): string {
  const days = Math.max(0, Math.floor((+now - +new Date(ev.occurredAt)) / DAY_MS));
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
  const p = ev.payload || {};
  switch (ev.kind) {
    case 'rejection':
      return `- ${when}: rejection from ${p.company || 'a company'}${p.role ? ` for ${p.role}` : ''}${p.stage ? ` after ${p.stage}` : ''}.`;
    case 'interview':
      return `- ${when}: interview at ${p.company || 'a company'}${p.role ? ` for ${p.role}` : ''}.`;
    case 'offer':
      return `- ${when}: OFFER from ${p.company || 'a company'}${p.role ? ` for ${p.role}` : ''}.`;
    case 'layoff':
      return `- ${when}: layoff from ${p.company || 'their previous role'}.`;
    case 'win':
      return `- ${when}: win — ${p.detail || ev.note || 'something good'}.`;
    case 'mood':
      return `- ${when}: mood ${ev.moodRating ?? '?'}/5${ev.note ? ` — "${truncate(ev.note, 80)}"` : ''}.`;
    case 'reflection':
      return `- ${when}: reflection — ${truncate(ev.note || '', 120)}`;
    default:
      return `- ${when}: ${ev.kind}${ev.note ? ` — ${truncate(ev.note, 80)}` : ''}.`;
  }
}

function truncate(text: string, max: number): string {
  const s = String(text || '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
