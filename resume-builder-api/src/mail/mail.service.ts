import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

function isPlaceholderSmtpValue(value: string): boolean {
  // Anchored/word-ish patterns so a real address like "attest@x.com" or a
  // random app-password isn't wrongly flagged. Only obvious dummies match.
  return /(^|[_-])your[_-]|@example\.(com|org)$|changeme|change[_-]me|placeholder|^(test|demo|fake)@/i.test(value);
}

/**
 * Non-secret SMTP defaults. Every deployment sends from the same Gmail
 * mailbox, so defaulting host/port/user/from here means a deploy only has
 * to set ONE variable — SMTP_PASS, the App Password. Nothing secret lives
 * here; the password is env-only and is never committed. Any env var still
 * wins, so switching providers needs no code change.
 */
const SMTP_DEFAULTS = {
  host: 'smtp.gmail.com',
  port: '587',
  user: 'novaai0401@gmail.com',
  from: 'ATS Resume Builder <novaai0401@gmail.com>',
} as const;

function isGmailHost(host: string): boolean {
  return /(^|\.)gmail\.com$|(^|\.)googlemail\.com$/i.test(String(host || '').trim());
}

/**
 * Map a raw SMTP send error to a SAFE, actionable hint (no secrets, no
 * account-existence signal) so the cause can be shown to the operator
 * without leaking credentials.
 */
export function categorizeSmtpError(raw: string): string {
  const e = String(raw || '');
  if (!e) return 'The email service is temporarily unavailable.';
  if (/invalid login|username and password not accepted|badcredentials|5\.7\.8|auth(entication)? fail|not authenticated|535/i.test(e)) {
    return 'The mail login was rejected — the Gmail App Password is wrong or revoked. Regenerate it (no spaces) and update SMTP_PASS.';
  }
  if (/\betimedout\b|\beconnrefused\b|\benotfound\b|\beconnreset\b|connection timeout|greeting never received|socket/i.test(e)) {
    return 'Could not reach the mail server — check SMTP_HOST/SMTP_PORT and that outbound SMTP (587) is not blocked.';
  }
  if (/from|sender|does not (match|own)|5\.7\.1|not allowed to send/i.test(e)) {
    return 'The sender address was rejected — SMTP_FROM must be the same mailbox as SMTP_USER.';
  }
  if (/self.signed|certificate|tls|ssl|wrong version number/i.test(e)) {
    return 'A TLS error occurred — for port 587 use SMTP_SECURE=false; for 465 use SMTP_SECURE=true.';
  }
  return 'The mail server rejected the message.';
}

/**
 * Gmail App Passwords are 16 chars shown grouped in fours ("abcd efgh ijkl
 * mnop"); the ACTUAL secret has no spaces, but users paste it with them and
 * Gmail then rejects the login. Strip internal spaces for Gmail/Google
 * hosts only (a real password with spaces on other hosts is left intact).
 */
export function normalizeSmtpPass(host: string, pass: string): string {
  const p = String(pass || '');
  return isGmailHost(host) ? p.replace(/\s+/g, '') : p;
}

/**
 * Most SMTP providers (Gmail, Outlook, Zoho, SES) only allow sending FROM
 * the authenticated mailbox — a mismatched From is the #1 silent send
 * rejection. So force the From email to the authenticated SMTP_USER while
 * keeping any display name the operator set in SMTP_FROM. When SMTP_USER
 * isn't an email (unusual providers), fall back to SMTP_FROM as-is.
 */
export function resolveFromAddress(fromRaw: string, user: string): string {
  const u = String(user || '').trim();
  const raw = String(fromRaw || '').trim();
  const userIsEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u);
  if (!userIsEmail) return raw || u;
  // Parse an optional display name from `Name <email>` or a bare address.
  const angled = raw.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  const displayName = angled ? angled[1].trim() : raw && !raw.includes('@') ? raw : '';
  return displayName ? `${displayName} <${u}>` : u;
}

/** Structured, log/endpoint-friendly view of the mail config. */
export type MailConfigStatus = {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  fromAddress: string;
  /** Masked SMTP username so support can eyeball it without leaking it. */
  userMasked: string;
  /** Human-readable reason when not configured (empty when configured). */
  reason: string;
};

function maskEmail(value: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  const at = v.indexOf('@');
  if (at <= 0) return `${v.slice(0, 2)}***`;
  const name = v.slice(0, at);
  const domain = v.slice(at);
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}${'*'.repeat(Math.max(1, name.length - 2))}${domain}`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;
  private readonly status: MailConfigStatus;
  /** Most recent real send failure, surfaced by the admin diagnostic. */
  private lastSendError: { at: string; context: string; error: string } | null = null;

  /** Record + log a real send failure so ops can see the actual SMTP error. */
  private recordSendError(context: string, err: unknown): void {
    const msg = (err instanceof Error ? err.message : String(err)).replace(/pass[^\s]*/gi, '***');
    this.lastSendError = { at: new Date().toISOString(), context, error: msg };
    this.logger.error(`Email send failed (${context}): ${msg}`);
  }

  constructor(private readonly config: ConfigService) {
    // Env always wins; fall back to the shared Gmail mailbox so a deploy
    // only needs SMTP_PASS set.
    const host = this.readEnv('SMTP_HOST') || SMTP_DEFAULTS.host;
    const port = parseInt(this.readEnv('SMTP_PORT') || SMTP_DEFAULTS.port, 10);
    const user = this.readEnv('SMTP_USER') || SMTP_DEFAULTS.user;
    // Strip the display spaces from a pasted Gmail App Password ("abcd efgh…").
    const pass = normalizeSmtpPass(host, this.readEnv('SMTP_PASS'));
    const fromRaw = this.readEnv('SMTP_FROM') || SMTP_DEFAULTS.from;
    // Force From = the authenticated mailbox (keep any display name) so a
    // mismatched SMTP_FROM can't get the send silently rejected.
    this.fromAddress = resolveFromAddress(fromRaw, user);
    // Auto-derive TLS mode from the port for the standard SMTP ports so a
    // 587/465 mix-up can't silently break sends (the #1 Gmail misconfig:
    // port 587 is STARTTLS → secure=false; 465 is implicit TLS → secure=true).
    // Only fall back to the explicit SMTP_SECURE flag for non-standard ports.
    const secure =
      port === 465 ? true : (port === 587 || port === 25) ? false : this.readEnv('SMTP_SECURE') === 'true';

    // Compute a precise reason so ops can see EXACTLY what's wrong instead
    // of a generic "not configured".
    // host/user/from now always resolve via SMTP_DEFAULTS, so SMTP_PASS is
    // in practice the only variable a deploy can still be missing.
    const missing: string[] = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    let reason = '';
    if (missing.length) {
      reason = `Missing env: ${missing.join(', ')}.`;
    } else if (isPlaceholderSmtpValue(user)) {
      reason = 'SMTP_USER looks like a placeholder — set your real SMTP username/email.';
    } else if (isPlaceholderSmtpValue(pass)) {
      reason = 'SMTP_PASS looks like a placeholder — set your real SMTP password / app password.';
    }

    if (!reason) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        // On the STARTTLS ports, require the TLS upgrade so we never send
        // credentials over a plaintext connection.
        requireTLS: !secure,
        auth: { user, pass },
        connectionTimeout: parseInt(this.readEnv('SMTP_CONNECTION_TIMEOUT_MS') || '10000', 10),
        greetingTimeout: parseInt(this.readEnv('SMTP_GREETING_TIMEOUT_MS') || '10000', 10),
      });
      this.logger.log(`Mail service configured (host=${host}, port=${port}, from=${this.fromAddress})`);

      this.transporter.verify()
        .then(() => this.logger.log('SMTP connection verified successfully.'))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`SMTP connection verification failed: ${msg}. Emails may fail at send time.`);
        });
    } else {
      this.transporter = null;
      this.logger.warn(`SMTP not configured — ${reason} See .env.example / Gmail SMTP setup.`);
    }

    this.status = {
      configured: this.transporter !== null,
      host,
      port,
      secure,
      fromAddress: this.fromAddress,
      userMasked: maskEmail(user),
      reason,
    };
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Snapshot of the mail config (no secrets) for the admin diagnostic. */
  getStatus(): MailConfigStatus & { lastSendError: { at: string; context: string; error: string } | null } {
    return { ...this.status, lastSendError: this.lastSendError };
  }

  /**
   * Live SMTP handshake (AUTH + connection) so ops can see the real error
   * — wrong app password, blocked port, etc. Returns the raw error message.
   */
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter) return { ok: false, error: this.status.reason || 'SMTP not configured' };
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (err: unknown) {
      this.recordSendError('verify', err);
      return { ok: false, error: this.lastSendError?.error };
    }
  }

  /** Send a plain diagnostic email to prove end-to-end delivery works. */
  async sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter) return { ok: false, error: this.status.reason || 'SMTP not configured' };
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: 'CallbackCV — SMTP test email',
        text: 'This is a test email from CallbackCV. If you received it, email delivery is working.',
      });
      return { ok: true };
    } catch (err: unknown) {
      this.recordSendError('test', err);
      return { ok: false, error: this.lastSendError?.error };
    }
  }

  /**
   * R-038 contact-relay: send the owner a message a recruiter typed
   * into their public-portfolio "Get in touch" form. Owner's real
   * email never leaves the server — we set Reply-To to the
   * recruiter's address so the owner can reply directly without us
   * having to maintain a threaded mailbox.
   *
   * Returns true on send, false on silent-fail (SMTP not configured
   * or transporter error). The controller treats "configured but
   * failed" the same as "not configured" from the visitor's
   * perspective: a generic "could not deliver" — no probing oracle.
   */
  /**
   * Ops report (the daily spend tripwire). Plain text on purpose: it is read
   * by one founder in an inbox, and a metric mail that needs HTML to be
   * legible is hiding something.
   */
  async sendOpsReportEmail(args: { to: string; subject: string; text: string }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Cannot send ops report: SMTP not configured');
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: args.to,
        subject: args.subject,
        text: args.text,
      });
      return true;
    } catch (err: unknown) {
      this.logger.error(`Ops report send failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendShareRelayEmail(args: {
    ownerEmail: string;
    senderName: string;
    senderEmail: string;
    senderCompany?: string | null;
    message: string;
    slug: string;
    publicUrl: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot relay share-link message for ${args.slug}: SMTP not configured`);
      return false;
    }
    const safeMsg = String(args.message || '').slice(0, 4000);
    const subject = `New message about your resume (${args.slug})`;
    const text = [
      `${args.senderName} reached out via your public CallbackCV link.`,
      args.senderCompany ? `Company: ${args.senderCompany}` : '',
      `Reply directly to: ${args.senderEmail}`,
      `Link: ${args.publicUrl}`,
      '',
      'Message:',
      safeMsg,
      '',
      '— CallbackCV contact relay. The sender does not see your email address.',
    ].filter(Boolean).join('\n');
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: args.ownerEmail,
        replyTo: `${args.senderName.replace(/[<>"]/g, '')} <${args.senderEmail}>`,
        subject,
        text,
      });
      this.logger.log(`Share relay sent for slug=${args.slug}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to relay share message for slug=${args.slug}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
      return false;
    }
  }

  /**
   * R-031 outcome-nudge: "any reply from <company>?" with three
   * one-tap links. Plain-text first (mail clients trust it more),
   * minimal HTML with three real buttons.
   */
  /** New-openings digest for a saved job alert. */
  async sendJobAlertEmail(args: {
    to: string;
    userName: string;
    query: string;
    location?: string | null;
    openings: Array<{ title: string; company: string; location: string; url: string; salaryText?: string | null }>;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot send job alert to ${args.to}: SMTP not configured`);
      return false;
    }
    const firstName = (args.userName || '').trim().split(/\s+/)[0] || 'there';
    const where = args.location ? ` in ${args.location}` : '';
    const subject = `${args.openings.length} new ${args.openings.length === 1 ? 'opening' : 'openings'} for "${args.query}"${where}`;
    const text = [
      `Hi ${firstName},`,
      '',
      `New openings matching your saved search "${args.query}"${where}:`,
      '',
      ...args.openings.map((o) => `- ${o.title} @ ${o.company} (${o.location})${o.salaryText ? ` — ${o.salaryText}` : ''}\n  ${o.url}`),
      '',
      'Tailor your resume to the JD before applying — JD Match on CallbackCV shows the gap in seconds.',
      '',
      'Manage alerts from the Jobs page in CallbackCV.',
    ].join('\n');
    const rows = args.openings.map((o) => `
        <tr><td style="padding:10px 0;border-bottom:1px solid #e6e8f2;">
          <a href="${o.url}" style="color:#4f46e5;font-weight:600;text-decoration:none;">${o.title}</a>
          <div style="color:#334155;font-size:14px;">${o.company} · ${o.location}${o.salaryText ? ` · ${o.salaryText}` : ''}</div>
        </td></tr>`).join('');
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 6px;">New openings for "${args.query}"${where}</h2>
        <p style="color:#64748b;margin:0 0 14px;">Hi ${firstName} — your saved search just matched ${args.openings.length} new ${args.openings.length === 1 ? 'opening' : 'openings'}.</p>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
        <p style="color:#64748b;font-size:13px;margin-top:16px;">Tip: run JD Match before applying so your resume covers the keywords. Manage alerts from the Jobs page.</p>
      </div>`;
    try {
      await this.transporter.sendMail({ from: this.fromAddress, to: args.to, subject, text, html });
      return true;
    } catch (err) {
      this.logger.warn(`Job alert email to ${args.to} failed: ${String(err)}`);
      return false;
    }
  }

  async sendOutcomeNudgeEmail(args: {
    to: string;
    userName: string;
    company: string;
    role: string;
    appliedAt: Date;
    links: { noReply: string; rejected: string; interview: string; unsubscribe: string };
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot send outcome nudge to ${args.to}: SMTP not configured`);
      return false;
    }
    const appliedOn = args.appliedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const firstName = (args.userName || '').trim().split(/\s+/)[0] || 'there';
    const subject = `Any reply from ${args.company}?`;
    const text = [
      `Hi ${firstName},`,
      '',
      `You applied to ${args.role} at ${args.company} on ${appliedOn}. One tap keeps your tracker honest:`,
      '',
      `No reply yet:   ${args.links.noReply}`,
      `Rejected:       ${args.links.rejected}`,
      `Interview! :    ${args.links.interview}`,
      '',
      `Recording outcomes is how CallbackCV learns which of your resume versions actually works.`,
      '',
      `Stop these emails: ${args.links.unsubscribe}`,
    ].join('\n');
    const btn = (href: string, label: string, bg: string) =>
      `<a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin:4px 6px 4px 0;">${label}</a>`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#1a3a5c;margin:0 0 6px;">Any reply from ${escapeHtml(args.company)}?</h2>
        <p style="color:#555;font-size:14px;margin:0 0 16px;">
          You applied to <strong>${escapeHtml(args.role)}</strong> at <strong>${escapeHtml(args.company)}</strong> on ${appliedOn}.
          One tap keeps your tracker honest:
        </p>
        <div style="margin-bottom:16px;">
          ${btn(args.links.noReply, 'No reply yet', '#64748b')}
          ${btn(args.links.rejected, 'Rejected', '#b91c1c')}
          ${btn(args.links.interview, 'Interview!', '#1e7a3a')}
        </div>
        <p style="color:#888;font-size:12px;margin:0 0 4px;">
          Recording outcomes is how CallbackCV learns which of your resume versions actually works.
        </p>
        <p style="color:#aaa;font-size:11px;margin:12px 0 0;">
          <a href="${args.links.unsubscribe}" style="color:#aaa;">Stop these emails</a>
        </p>
      </div>`;
    try {
      await this.transporter.sendMail({ from: this.fromAddress, to: args.to, subject, text, html });
      this.logger.log(`Outcome nudge sent to ${args.to} for ${args.company}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send outcome nudge to ${args.to}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
      return false;
    }
  }

  /**
   * R-032 disambiguation: the user forwarded an outcome email but we
   * couldn't tell which application it belongs to. One tap per
   * candidate applies the detected outcome to that application.
   */
  async sendOutcomeDisambiguationEmail(args: {
    to: string;
    userName: string;
    outcome: 'rejected' | 'interview' | 'offer';
    rows: Array<{ company: string; role: string; link: string }>;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot send disambiguation email to ${args.to}: SMTP not configured`);
      return false;
    }
    const firstName = (args.userName || '').trim().split(/\s+/)[0] || 'there';
    const OUTCOME_LABEL: Record<string, string> = {
      rejected: 'a rejection',
      interview: 'an interview invite',
      offer: 'an offer',
    };
    const subject = `Which application was that about?`;
    const text = [
      `Hi ${firstName},`,
      '',
      `You forwarded ${OUTCOME_LABEL[args.outcome]}, but it matches more than one tracked application (or none clearly). One tap records it:`,
      '',
      ...args.rows.map((r) => `${r.role} @ ${r.company}:  ${r.link}`),
      '',
      `If none of these fit, update the application directly in your tracker.`,
    ].join('\n');
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#1a3a5c;margin:0 0 6px;">Which application was that about?</h2>
        <p style="color:#555;font-size:14px;margin:0 0 16px;">
          You forwarded ${OUTCOME_LABEL[args.outcome]}, but it matches more than one tracked
          application. One tap records it:
        </p>
        ${args.rows.map((r) => `
          <p style="margin:0 0 10px;">
            <a href="${r.link}" style="display:inline-block;background:#1a3a5c;color:#ffffff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:600;">
              ${escapeHtml(r.role)} @ ${escapeHtml(r.company)}
            </a>
          </p>`).join('')}
        <p style="color:#888;font-size:12px;margin:12px 0 0;">
          If none of these fit, update the application directly in your tracker.
        </p>
      </div>`;
    try {
      await this.transporter.sendMail({ from: this.fromAddress, to: args.to, subject, text, html });
      this.logger.log(`Disambiguation email sent to ${args.to} (${args.rows.length} candidates)`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send disambiguation email to ${args.to}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
      return false;
    }
  }

  async sendOtpEmail(to: string, otp: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot send OTP email to ${to}: SMTP not configured`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: 'Your Resume Builder verification code',
        text: [
          `Your verification code is: ${otp}`,
          '',
          'This code will expire in 10 minutes.',
          'If you did not request this code, you can safely ignore this email.',
        ].join('\n'),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a3a5c; margin-bottom: 8px;">Your Verification Code</h2>
            <p style="color: #555; font-size: 14px; margin-bottom: 20px;">
              Use the code below to sign in to ATS Resume Builder.
            </p>
            <div style="background: #f4f8fc; border: 1px solid #c4d5e0; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 20px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a3a5c;">${otp}</span>
            </div>
            <p style="color: #888; font-size: 12px; margin-bottom: 4px;">
              This code expires in 10 minutes.
            </p>
            <p style="color: #888; font-size: 12px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      });
      this.logger.log(`OTP email sent successfully to ${to}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send OTP email to ${to}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
      return false;
    }
  }

  /** Registration email-ownership code. Plain + simple on purpose: this is
   * the first mail a user ever gets from us and it must survive every client. */
  async sendEmailVerificationCode(to: string, otp: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot send verification email to ${to}: SMTP not configured`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `${otp} is your CallbackCV verification code`,
        text: [
          `Your CallbackCV verification code is: ${otp}`,
          '',
          'Enter it on the sign-up page to finish creating your account.',
          'The code expires in 15 minutes.',
          'If you did not try to create a CallbackCV account, ignore this email — nothing was created.',
        ].join('\n'),
      });
      return true;
    } catch (err: unknown) {
      this.recordSendError('email-verification', err);
      return false;
    }
  }

  async sendPasswordResetEmail(to: string, otp: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot send password-reset email to ${to}: SMTP not configured`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: 'Your Resume Builder password-reset code',
        text: [
          `Your password-reset code is: ${otp}`,
          '',
          'This code will expire in 15 minutes.',
          'If you did not request a password reset, you can safely ignore this email — your account stays as it was.',
        ].join('\n'),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a3a5c; margin-bottom: 8px;">Reset your password</h2>
            <p style="color: #555; font-size: 14px; margin-bottom: 20px;">
              Use the code below to reset your ATS Resume Builder password.
            </p>
            <div style="background: #f4f8fc; border: 1px solid #c4d5e0; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 20px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a3a5c;">${otp}</span>
            </div>
            <p style="color: #888; font-size: 12px; margin-bottom: 4px;">
              This code expires in 15 minutes.
            </p>
            <p style="color: #888; font-size: 12px;">
              If you didn't request this, you can safely ignore this email — your account stays as it was.
            </p>
          </div>
        `,
      });
      this.logger.log(`Password-reset email sent to ${to}`);
      return true;
    } catch (err: unknown) {
      this.recordSendError('password-reset', err);
      return false;
    }
  }

  async sendResumePdfEmail(params: {
    to: string;
    resumeTitle: string;
    pdfBuffer: Buffer;
    fileName: string;
    /** Defaults to PDF; pass the DOCX mime so a Word export attaches correctly. */
    contentType?: string;
    /** Optional override so a support resend can explain itself. */
    intro?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot email resume copy to ${params.to}: SMTP not configured`);
      return false;
    }
    const intro =
      params.intro ||
      `Your resume "${params.resumeTitle}" has been successfully downloaded. A copy is attached for your records.`;
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.to,
        subject: `Your resume copy: ${params.resumeTitle}`,
        text: [
          `Hi,`,
          ``,
          intro,
          ``,
          `If you did not request this resume, please sign in and change your password immediately.`,
          ``,
          `— ATS Resume Builder`,
        ].join('\n'),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a3a5c; margin-bottom: 8px;">Your resume copy</h2>
            <p style="color: #555; font-size: 14px;">${escapeHtml(intro)}</p>
            <p style="color: #888; font-size: 12px; margin-top: 24px;">
              If you did not request this resume, please sign in and change your password immediately.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: params.fileName,
            content: params.pdfBuffer,
            contentType: params.contentType || 'application/pdf',
          },
        ],
      });
      this.logger.log(`Resume copy emailed to ${params.to}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to email resume copy to ${params.to}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
      return false;
    }
  }

  async sendNewDeviceLoginAlert(params: {
    to: string;
    ip: string;
    userAgent: string;
    when: Date;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot send new-device alert to ${params.to}: SMTP not configured`);
      return false;
    }
    const whenStr = params.when.toUTCString();
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.to,
        subject: 'New sign-in to your ATS Resume Builder account',
        text: [
          `We noticed a sign-in from a new device or location.`,
          ``,
          `When: ${whenStr}`,
          `IP: ${params.ip}`,
          `Device: ${params.userAgent}`,
          ``,
          `If this was you, no action is needed. If not, please reset your password immediately.`,
        ].join('\n'),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a3a5c; margin-bottom: 8px;">New sign-in detected</h2>
            <p style="color: #555; font-size: 14px;">We noticed a sign-in to your account from a new device or location.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 6px 0; color: #888; font-size: 13px;">When</td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(whenStr)}</td></tr>
              <tr><td style="padding: 6px 0; color: #888; font-size: 13px;">IP</td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(params.ip)}</td></tr>
              <tr><td style="padding: 6px 0; color: #888; font-size: 13px;">Device</td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(params.userAgent)}</td></tr>
            </table>
            <p style="color: #888; font-size: 12px;">If this wasn't you, reset your password immediately.</p>
          </div>
        `,
      });
      this.logger.log(`New-device alert emailed to ${params.to}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send new-device alert to ${params.to}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
      return false;
    }
  }

  private readEnv(key: string): string {
    return String(this.config.get<string>(key, '') || '').trim();
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
