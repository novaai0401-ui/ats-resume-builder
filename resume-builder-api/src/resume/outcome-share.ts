/**
 * Shareable Outcome Card — stateless, signed, anonymized.
 *
 * The Outcome Loop is the product's defensible moat ("proof, not opinions"),
 * so we let users share it. The catch: a share link must leak ZERO resume
 * content. The approach here is a self-contained HMAC-signed token:
 *
 *   token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload))
 *
 * The payload carries only anonymized numbers (callback rate, counts, and a
 * v1/v2/v3 score-history trend). No titles, no employers, no resume text.
 * Because the data lives inside the signed token, the public read endpoint
 * needs no database row — it just verifies the signature and decodes. That
 * keeps the feature migration-free and makes links durable.
 *
 * Trade-off accepted: a shared link is a point-in-time snapshot and cannot be
 * revoked (it's stateless). That's fine for a brag card — if the numbers go
 * stale, the user simply shares a fresh link.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { OutcomeReport } from './outcome-stats';

export interface OutcomeCard {
  /** Schema version so we can evolve the payload without breaking old links. */
  v: 1;
  /** Hero metric: overall callback rate as a percentage 0..100. */
  callbackRate: number;
  applied: number;
  responses: number;
  interviews: number;
  offers: number;
  /** Best version's improvement headline, already stripped of any labels. */
  liftMultiplier: number | null;
  liftDeltaPoints: number | null;
  /** Anonymized trend: [{ n: 1, score, callback }] where n is version order. */
  trend: Array<{ n: number; score: number | null; callback: number | null }>;
  /** Unix ms the card was generated. UI shows "as of <date>". */
  generatedAt: number;
}

/** Build the anonymized card from a full (private) outcome report. */
export function buildOutcomeCard(report: OutcomeReport, now: number = Date.now()): OutcomeCard {
  const trend = report.scoreHistory.map((p, i) => ({
    n: i + 1,
    score: p.atsScore,
    callback: p.callbackRate === null ? null : Math.round(p.callbackRate * 100),
  }));
  return {
    v: 1,
    callbackRate: Math.round(report.overall.callbackRate * 100),
    applied: report.overall.applied,
    responses: report.overall.responses,
    interviews: report.overall.interviews,
    offers: report.overall.offers,
    liftMultiplier: report.lift.multiplier,
    liftDeltaPoints: report.lift.deltaPoints === null ? null : Math.round(report.lift.deltaPoints),
    trend,
    generatedAt: now,
  };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payloadB64).digest());
}

/** Encode + sign a card into a URL-safe token. */
export function signOutcomeCard(card: OutcomeCard, secret: string): string {
  if (!secret) throw new Error('A signing secret is required for share tokens');
  const payloadB64 = b64url(Buffer.from(JSON.stringify(card), 'utf8'));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Verify a token's signature and return the card, or null if tampered/invalid. */
export function verifyOutcomeCard(token: string, secret: string): OutcomeCard | null {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
    if (!parsed || parsed.v !== 1) return null;
    return parsed as OutcomeCard;
  } catch {
    return null;
  }
}
