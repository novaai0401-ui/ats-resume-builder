import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * R-032 — mail-in outcome capture.
 *
 * The user forwards a rejection / interview-invite / offer email to
 * track@pocketresume.app. An inbound-mail provider (SendGrid Inbound
 * Parse, Mailgun Routes, Cloudflare Email Workers — all POST the
 * parsed message to a webhook) hits POST /outcome-mail/inbound. We:
 *
 *   1. Identify the user by the From address (it must match a
 *      registered account — forwarding from an unknown address is
 *      acknowledged but ignored, no oracle).
 *   2. Detect the outcome from the text (rejected / interview /
 *      offer) using conservative phrase patterns.
 *   3. Match the email text against the user's OPEN applications by
 *      company name.
 *   4. Exactly one match → apply the status change directly.
 *      Zero or multiple matches → send a disambiguation email with
 *      one-tap links (reusing the R-031 OutcomeNudge token machinery)
 *      so the user picks the application from their inbox.
 *
 * Privacy: email BODIES are never stored. The InboundOutcomeMail
 * audit row keeps from-address + truncated subject + what we did,
 * and expires after 30 days (purged by the nudge cron).
 */

const RETENTION_DAYS = 30;
const TOKEN_TTL_DAYS = 30;

export type DetectedOutcome = 'rejected' | 'interview' | 'offer';

// Conservative phrase lists. False negatives are fine (the user can
// always log manually); false positives write wrong statuses, so
// every pattern requires an explicit, unambiguous phrase.
const REJECTED_RE = /\b(unfortunately|regret to inform|not (?:be )?moving forward|decided to (?:pursue|proceed with) other candidates|not selected|position has been filled|will not be progressing|application was unsuccessful)\b/i;
const OFFER_RE = /\b(pleased to (?:offer|extend)|offer letter|extend(?:ing)? an offer|formal offer|letter of intent|congratulations on your offer)\b/i;
const INTERVIEW_RE = /\b(schedule (?:an |your )?interview|interview (?:invite|invitation|scheduled|round)|shortlisted|next round|technical round|screening call|would like to (?:speak|talk|meet) with you|availability for a call)\b/i;

@Injectable()
export class InboundMailService {
  private readonly logger = new Logger(InboundMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * Webhook entry point. Always resolves to { accepted: true } for
   * the provider (4xx would make providers retry/disable the route);
   * the audit row records what actually happened.
   */
  async handleInbound(input: { fromEmail: string; subject?: string; text?: string }) {
    const fromEmail = normalizeEmail(input.fromEmail);
    const subject = String(input.subject || '').slice(0, 140);
    const text = `${input.subject || ''}\n${input.text || ''}`.slice(0, 20_000);
    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const audit = async (resolution: string, userId?: string | null, detected?: DetectedOutcome | null, matchedApplicationId?: string | null) => {
      await this.prisma.inboundOutcomeMail.create({
        data: { userId: userId ?? null, fromEmail, subject, detectedOutcome: detected ?? null, resolution, matchedApplicationId: matchedApplicationId ?? null, expiresAt },
      }).catch(() => undefined);
    };

    if (!fromEmail) {
      await audit('unknown_sender');
      return { accepted: true };
    }
    const user = await this.prisma.user.findUnique({
      where: { email: fromEmail },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) {
      await audit('unknown_sender');
      return { accepted: true };
    }

    const detected = detectOutcome(text);
    if (!detected) {
      await audit('no_outcome', user.id);
      return { accepted: true };
    }

    // Open applications only — a rejection can't apply to an already
    // closed/rejected row, and matching against the full history
    // multiplies ambiguity.
    const openApps = await this.prisma.jobApplication.findMany({
      where: { userId: user.id, status: { in: ['wishlist', 'applied', 'phone_screen', 'interview'] } },
      select: { id: true, company: true, role: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const matches = matchApplicationsByCompany(openApps, text);

    if (matches.length === 1) {
      const app = matches[0];
      await this.applyOutcome(app.id, detected);
      await audit('applied', user.id, detected, app.id);
      this.analytics.track({ type: 'mail_in_outcome_applied', properties: { outcome: detected } });
      return { accepted: true };
    }

    // Zero or many → ask the user from their inbox. Candidates =
    // matched subset when ambiguous, all open apps when none matched.
    const candidates = (matches.length > 1 ? matches : openApps).slice(0, 5);
    if (candidates.length === 0) {
      await audit('no_match', user.id, detected);
      return { accepted: true };
    }

    const sent = await this.sendDisambiguation(user, detected, candidates);
    await audit(sent ? 'disambiguation_sent' : 'no_match', user.id, detected);
    return { accepted: true };
  }

  /** Purge audit rows past retention. Called from the nudge cron run. */
  async purgeExpired() {
    const res = await this.prisma.inboundOutcomeMail.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return res.count;
  }

  // ── internals ─────────────────────────────────────────────────────

  private async applyOutcome(applicationId: string, outcome: DetectedOutcome) {
    await this.prisma.jobApplication.update({
      where: { id: applicationId },
      data: {
        status: outcome,
        ...(outcome === 'rejected' ? { closedAt: new Date() } : {}),
      },
    });
  }

  /**
   * One-tap disambiguation reusing the R-031 OutcomeNudge token rows:
   * one single-use token per candidate application; tapping the link
   * applies the DETECTED outcome to THAT application via the existing
   * GET /outcome-nudge/:token/:action endpoint.
   */
  private async sendDisambiguation(
    user: { id: string; email: string; fullName: string | null },
    outcome: DetectedOutcome,
    candidates: Array<{ id: string; company: string; role: string }>,
  ): Promise<boolean> {
    const appBaseUrl = String(process.env.API_PUBLIC_URL || 'http://localhost:4001').replace(/\/+$/, '');
    const rows: Array<{ company: string; role: string; link: string }> = [];
    for (const app of candidates) {
      const token = randomToken();
      await this.prisma.outcomeNudge.create({
        data: {
          userId: user.id,
          jobApplicationId: app.id,
          token,
          expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      rows.push({
        company: app.company,
        role: app.role,
        link: `${appBaseUrl}/outcome-nudge/${token}/${outcome}`,
      });
    }
    return this.mail.sendOutcomeDisambiguationEmail({
      to: user.email,
      userName: user.fullName || '',
      outcome,
      rows,
    });
  }
}

// ── pure helpers (exported for tests) ────────────────────────────────

export function detectOutcome(text: string): DetectedOutcome | null {
  const t = String(text || '');
  // Offer outranks interview ("pleased to offer ... after your
  // interview"); rejection outranks both ("unfortunately, following
  // your interview ...").
  if (REJECTED_RE.test(t)) return 'rejected';
  if (OFFER_RE.test(t)) return 'offer';
  if (INTERVIEW_RE.test(t)) return 'interview';
  return null;
}

/**
 * Match open applications by company-name occurrence in the email
 * text. Word-boundary, case-insensitive, with corporate suffixes
 * stripped so "Acme Corp" in the tracker matches "Acme" in the email
 * (and vice versa). Companies shorter than 3 chars never match —
 * "GE" in random prose would false-positive constantly.
 */
export function matchApplicationsByCompany<T extends { company: string }>(
  applications: T[],
  text: string,
): T[] {
  const haystack = ` ${String(text || '').toLowerCase()} `;
  const out: T[] = [];
  for (const app of applications) {
    const core = coreCompanyName(app.company);
    if (core.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(core)}\\b`, 'i');
    if (re.test(haystack)) out.push(app);
  }
  return out;
}

const COMPANY_SUFFIX_RE = /\s+(pvt\.?|private|ltd\.?|limited|inc\.?|llc|llp|corp\.?|corporation|co\.?|gmbh|technologies|technology|tech|solutions|labs|india)\s*$/i;

export function coreCompanyName(company: string): string {
  let name = String(company || '').trim().toLowerCase();
  // Strip trailing suffixes until stable ("Acme Tech Pvt Ltd" needs
  // three passes: ltd → pvt → tech). Keep at least one word — a name
  // that is ALL suffixes ("Tech Solutions") falls back to its own
  // first word rather than the empty string.
  for (let i = 0; i < 4; i += 1) {
    const stripped = name.replace(COMPANY_SUFFIX_RE, '').trim();
    if (stripped === name || !stripped) break;
    name = stripped;
  }
  return name;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEmail(raw: string): string {
  // Providers send "Display Name <user@host>" — extract the address.
  const s = String(raw || '').trim();
  const angled = s.match(/<([^>]+)>/);
  const addr = (angled ? angled[1] : s).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : '';
}

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomToken(length = 32): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

export const __testables = { detectOutcome, matchApplicationsByCompany, coreCompanyName, normalizeEmail };
