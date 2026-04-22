import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

function isPlaceholderSmtpValue(value: string): boolean {
  return /your[_-]|example\.com|changeme|change[_-]me|placeholder|test@|demo@|fake/i.test(value);
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const host = this.readEnv('SMTP_HOST');
    const port = parseInt(this.readEnv('SMTP_PORT') || '587', 10);
    const user = this.readEnv('SMTP_USER');
    const pass = this.readEnv('SMTP_PASS');
    const fromRaw = this.readEnv('SMTP_FROM');
    this.fromAddress = fromRaw || user || '';
    const secure = this.readEnv('SMTP_SECURE') === 'true';

    if (host && user && pass && !isPlaceholderSmtpValue(user) && !isPlaceholderSmtpValue(pass)) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
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
      if (host || user || pass) {
        this.logger.warn(
          'SMTP credentials appear to be placeholder values. Update SMTP_USER and SMTP_PASS in .env with real credentials.',
        );
      } else {
        this.logger.warn(
          'SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS required). Email sending disabled. See .env.example for setup.',
        );
      }
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
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

  async sendResumePdfEmail(params: {
    to: string;
    resumeTitle: string;
    pdfBuffer: Buffer;
    fileName: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Cannot email resume PDF to ${params.to}: SMTP not configured`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.to,
        subject: `Your resume copy: ${params.resumeTitle}`,
        text: [
          `Hi,`,
          ``,
          `Your resume "${params.resumeTitle}" has been successfully downloaded. A copy is attached for your records.`,
          ``,
          `If you did not download this resume, please sign in and change your password immediately.`,
          ``,
          `— ATS Resume Builder`,
        ].join('\n'),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a3a5c; margin-bottom: 8px;">Your resume copy</h2>
            <p style="color: #555; font-size: 14px;">
              Your resume <strong>${escapeHtml(params.resumeTitle)}</strong> has been successfully downloaded. A copy is attached to this email for your records.
            </p>
            <p style="color: #888; font-size: 12px; margin-top: 24px;">
              If you did not download this resume, please sign in and change your password immediately.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: params.fileName,
            content: params.pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      this.logger.log(`Resume PDF emailed to ${params.to}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to email resume PDF to ${params.to}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
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
