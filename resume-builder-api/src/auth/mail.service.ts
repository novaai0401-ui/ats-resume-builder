import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/** Detect common placeholder values from .env.example that should not be used. */
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

    // Reject placeholder values copied from .env.example
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

      // Verify SMTP connection on startup (non-blocking)
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
      // Log sanitized error without credentials
      this.logger.error(`Failed to send OTP email to ${to}: ${msg.replace(/pass[^\s]*/gi, '***')}`);
      return false;
    }
  }

  private readEnv(key: string): string {
    return String(this.config.get<string>(key, '') || '').trim();
  }
}
