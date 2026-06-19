import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One-time per-PDF-download payment.
 *
 * Flow:
 *  1. Client calls /billing/download-charge/init with the resumeId.
 *     Server picks provider by region (Razorpay INR for India, Stripe USD otherwise),
 *     creates a provider order, and returns the details the client needs to open
 *     the provider's checkout.
 *  2. After provider confirms payment, client calls
 *     /billing/download-charge/verify with the provider callback payload.
 *     Server validates the signature, marks PaymentHistory captured, and issues
 *     a short-lived signed JWT "download token" scoped to (userId, resumeId).
 *  3. Client includes the download token when calling the PDF endpoint. The
 *     controller refuses the download if the token is missing or invalid
 *     whenever the feature flag is on.
 *
 * The feature is gated by the env flag `ENABLE_DOWNLOAD_CHARGE`. When the flag
 * is OFF, the PDF endpoint short-circuits the token check so existing free
 * downloads keep working — this lets the rest of the app be previewed without
 * wiring real payment keys.
 */

const DEFAULT_INR_PAISE = 4900; // ₹49
const DEFAULT_USD_CENTS = 99;   // $0.99
const TOKEN_TTL_SECONDS = 15 * 60;

@Injectable()
export class DownloadChargeService {
  private readonly logger = new Logger(DownloadChargeService.name);
  private readonly razorpayKeyId: string;
  private readonly razorpayKeySecret: string;
  private readonly stripeSecretKey: string;
  private readonly razorpay: any | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    this.razorpayKeyId = this.config.get<string>('RAZORPAY_KEY_ID', '');
    this.razorpayKeySecret = this.config.get<string>('RAZORPAY_KEY_SECRET', '');
    this.stripeSecretKey = this.config.get<string>('STRIPE_SECRET_KEY', '');

    if (this.razorpayKeyId && this.razorpayKeySecret) {
      try {
        const Razorpay = require('razorpay');
        this.razorpay = new Razorpay({ key_id: this.razorpayKeyId, key_secret: this.razorpayKeySecret });
      } catch (err) {
        this.razorpay = null;
        this.logger.warn(`Razorpay SDK failed to load: ${String(err)}`);
      }
    } else {
      this.razorpay = null;
    }
  }

  static isFeatureEnabled(config: ConfigService): boolean {
    return String(config.get<string>('ENABLE_DOWNLOAD_CHARGE', '') || '').toLowerCase() === 'true';
  }

  isFeatureEnabled(): boolean {
    return DownloadChargeService.isFeatureEnabled(this.config);
  }

  /**
   * Pick gateway by region. Indian users go through Razorpay (INR ₹49);
   * everyone else pays via Stripe Checkout in USD (~$0.99).
   */
  async createOrder(params: { userId: string; resumeId: string; region?: string }) {
    if (!this.isFeatureEnabled()) {
      throw new ServiceUnavailableException('Per-download charging is disabled.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) throw new ForbiddenException('User not found');

    // Model (post-pivot): no subscription tiers. EVERY download is ₹49
    // (or ~$0.99 outside India). There is no plan-based exemption.
    const isIndia = (params.region || '').trim().toUpperCase() === 'IN';
    if (isIndia) {
      return this.createRazorpayOrder(params.userId, params.resumeId, user.email);
    }
    return this.createStripeSession(params.userId, params.resumeId, user.email);
  }

  private async createRazorpayOrder(userId: string, resumeId: string, userEmail: string) {
    if (!this.razorpay) {
      throw new ServiceUnavailableException('Razorpay is not configured on the server.');
    }
    const amount = Number(this.config.get<string>('DOWNLOAD_CHARGE_INR_PAISE', '')) || DEFAULT_INR_PAISE;
    const receipt = `dl_${resumeId.slice(0, 8)}_${Date.now()}`;
    const order = await this.razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt,
      notes: { kind: 'download', userId, resumeId, userEmail },
    });
    await this.prisma.paymentHistory.create({
      data: {
        userId,
        amountPaise: amount,
        currency: 'INR',
        status: 'pending',
        planType: 'DOWNLOAD',
        paymentProvider: 'razorpay',
        providerOrderId: order.id,
      },
    });
    return {
      provider: 'razorpay' as const,
      orderId: order.id,
      amount,
      currency: 'INR',
      keyId: this.razorpayKeyId,
      resumeId,
    };
  }

  private async createStripeSession(userId: string, resumeId: string, userEmail: string) {
    if (!this.stripeSecretKey) {
      throw new ServiceUnavailableException('Stripe is not configured on the server.');
    }
    const amount = Number(this.config.get<string>('DOWNLOAD_CHARGE_USD_CENTS', '')) || DEFAULT_USD_CENTS;
    const successUrl = this.config.get<string>('DOWNLOAD_CHARGE_SUCCESS_URL', '');
    const cancelUrl = this.config.get<string>('DOWNLOAD_CHARGE_CANCEL_URL', '');
    if (!successUrl || !cancelUrl) {
      throw new ServiceUnavailableException('Stripe download checkout URLs are not configured.');
    }
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', `${successUrl}?session_id={CHECKOUT_SESSION_ID}&resumeId=${encodeURIComponent(resumeId)}`);
    params.append('cancel_url', cancelUrl);
    params.append('customer_email', userEmail);
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', String(amount));
    params.append('line_items[0][price_data][product_data][name]', 'Resume PDF download');
    params.append('metadata[kind]', 'download');
    params.append('metadata[userId]', userId);
    params.append('metadata[resumeId]', resumeId);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`Stripe session creation failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const session = await res.json() as { id: string; url: string };

    await this.prisma.paymentHistory.create({
      data: {
        userId,
        amountPaise: amount,
        currency: 'USD',
        status: 'pending',
        planType: 'DOWNLOAD',
        paymentProvider: 'stripe',
        providerOrderId: session.id,
      },
    });
    return {
      provider: 'stripe' as const,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount,
      currency: 'USD',
      resumeId,
    };
  }

  /**
   * Verify a Razorpay callback, record the payment, and return a short-lived
   * signed token the client must present to the PDF endpoint.
   */
  async verifyRazorpay(params: {
    userId: string;
    resumeId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    if (!this.razorpayKeySecret) {
      throw new ServiceUnavailableException('Razorpay not configured.');
    }
    const expected = crypto
      .createHmac('sha256', this.razorpayKeySecret)
      .update(`${params.razorpay_order_id}|${params.razorpay_payment_id}`)
      .digest('hex');
    if (expected !== params.razorpay_signature) {
      await this.prisma.paymentHistory.updateMany({
        where: { providerOrderId: params.razorpay_order_id },
        data: { status: 'failed' },
      });
      throw new ForbiddenException('Payment verification failed — invalid signature.');
    }
    await this.prisma.paymentHistory.updateMany({
      where: { providerOrderId: params.razorpay_order_id },
      data: { status: 'captured', providerPaymentId: params.razorpay_payment_id },
    });
    return { downloadToken: this.issueDownloadToken(params.userId, params.resumeId) };
  }

  /**
   * Verify a Stripe Checkout Session payment and return a download token.
   */
  async verifyStripe(params: { userId: string; resumeId: string; sessionId: string }) {
    if (!this.stripeSecretKey) {
      throw new ServiceUnavailableException('Stripe not configured.');
    }
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(params.sessionId)}`, {
      headers: { Authorization: `Bearer ${this.stripeSecretKey}` },
    });
    if (!res.ok) {
      throw new ForbiddenException('Stripe session lookup failed.');
    }
    const session = await res.json() as { payment_status?: string; metadata?: Record<string, string> };
    if (session.payment_status !== 'paid') {
      throw new ForbiddenException('Payment not completed.');
    }
    if (session.metadata?.userId !== params.userId || session.metadata?.resumeId !== params.resumeId) {
      throw new ForbiddenException('Session does not match user/resume.');
    }
    await this.prisma.paymentHistory.updateMany({
      where: { providerOrderId: params.sessionId },
      data: { status: 'captured' },
    });
    return { downloadToken: this.issueDownloadToken(params.userId, params.resumeId) };
  }

  /** Sign a short-lived download token bound to (userId, resumeId). */
  private issueDownloadToken(userId: string, resumeId: string): string {
    return this.jwt.sign(
      { typ: 'resume_download', userId, resumeId },
      { expiresIn: TOKEN_TTL_SECONDS },
    );
  }

  /** Verify a download token. Throws if invalid / expired / wrong resume. */
  assertDownloadToken(token: string, userId: string, resumeId: string): void {
    if (!token) {
      throw new ForbiddenException('Payment required to download this resume.');
    }
    let payload: Record<string, unknown>;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new ForbiddenException('Invalid or expired download token.');
    }
    if (payload.typ !== 'resume_download' || payload.userId !== userId || payload.resumeId !== resumeId) {
      throw new ForbiddenException('Download token does not match this user or resume.');
    }
  }
}
