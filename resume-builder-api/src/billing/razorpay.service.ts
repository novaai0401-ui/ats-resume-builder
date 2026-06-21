import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanConfig, type PlanName } from './plan-limits';
import { resetUsageForPlan } from './usage';

/**
 * Plan pricing in paise (INR smallest unit).
 *
 * Post-pivot there is ONE paid plan — "Pocket Resume Plus" at ₹499/mo —
 * which maps to the internal 'PRO' value. STUDENT is retained only so old
 * payment history keeps resolving; it is not offered in the UI.
 * Overridable via RAZORPAY_PRICE_<PLAN>_<INTERVAL> env vars.
 */
const DEFAULT_PLAN_PRICES: Record<string, { amount: number; currency: string }> = {
  STUDENT_MONTHLY: { amount: 41900, currency: 'INR' },
  PRO_MONTHLY: { amount: 49900, currency: 'INR' },      // ₹499/mo — the single plan
  STUDENT_ANNUAL: { amount: 419000, currency: 'INR' },  // 10 months (2 free)
  PRO_ANNUAL: { amount: 499000, currency: 'INR' },      // 10 months (2 free)
};

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly razorpay: any | null;
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.keyId = this.config.get<string>('RAZORPAY_KEY_ID', '');
    this.keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET', '');
    this.webhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET', '');

    if (this.isConfigured()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Razorpay = require('razorpay');
        this.razorpay = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret,
        });
        this.logger.log('Razorpay billing: CONFIGURED');
      } catch (err) {
        this.razorpay = null;
        this.logger.warn('Razorpay billing: SDK load failed — ' + String(err));
      }
    } else {
      this.razorpay = null;
      this.logger.warn('Razorpay billing: NOT CONFIGURED — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.keyId) && Boolean(this.keySecret) && this.keyId.length > 5;
  }

  private requireRazorpay() {
    if (!this.razorpay) {
      throw new ServiceUnavailableException(
        'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.',
      );
    }
    return this.razorpay;
  }

  /**
   * Get price for a plan + billing interval.
   */
  private getPlanPrice(plan: PlanName, interval: 'monthly' | 'annual') {
    const key = `${plan}_${interval.toUpperCase()}`;
    const envAmount = this.config.get<string>(`RAZORPAY_PRICE_${key}`, '');
    if (envAmount && Number(envAmount) > 0) {
      return { amount: Number(envAmount), currency: this.config.get<string>('RAZORPAY_CURRENCY', 'INR') };
    }
    return DEFAULT_PLAN_PRICES[key] || DEFAULT_PLAN_PRICES[`${plan}_MONTHLY`];
  }

  // ─── Create Order ───────────────────────────────────────────────────────

  async createOrder(userId: string, plan: PlanName, interval: 'monthly' | 'annual' = 'monthly') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');

    const rz = this.requireRazorpay();
    const price = this.getPlanPrice(plan, interval);
    const receipt = `rcpt_${plan.toLowerCase()}_${userId.slice(0, 8)}_${Date.now()}`;

    const order = await rz.orders.create({
      amount: price.amount,
      currency: price.currency,
      receipt,
      notes: {
        userId,
        plan,
        interval,
        userEmail: user.email,
      },
    });

    // Record pending payment
    await this.prisma.paymentHistory.create({
      data: {
        userId,
        amountPaise: price.amount,
        currency: price.currency,
        status: 'pending',
        planType: plan,
        paymentProvider: 'razorpay',
        providerOrderId: order.id,
      },
    });

    return {
      orderId: order.id,
      amount: price.amount,
      currency: price.currency,
      keyId: this.keyId,
      plan,
      interval,
      userEmail: user.email,
      userName: user.fullName,
    };
  }

  // ─── Verify Payment ─────────────────────────────────────────────────────

  async verifyPayment(
    userId: string,
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      plan: PlanName;
      interval?: 'monthly' | 'annual';
    },
  ) {
    // Step 1: Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== body.razorpay_signature) {
      this.logger.warn(`Payment signature mismatch for user ${userId}, order ${body.razorpay_order_id}`);
      // Update payment record as failed
      await this.prisma.paymentHistory.updateMany({
        where: { providerOrderId: body.razorpay_order_id },
        data: { status: 'failed' },
      });
      throw new ForbiddenException('Payment verification failed — invalid signature.');
    }

    // Step 2: Fetch payment details from Razorpay for extra verification
    let paymentMethod = 'unknown';
    try {
      const rz = this.requireRazorpay();
      const payment = await rz.payments.fetch(body.razorpay_payment_id);
      paymentMethod = payment.method || 'unknown'; // card, upi, netbanking, wallet
    } catch {
      // Non-critical — proceed with upgrade
      this.logger.warn(`Could not fetch payment details for ${body.razorpay_payment_id}`);
    }

    // Step 3: Update payment record
    await this.prisma.paymentHistory.updateMany({
      where: { providerOrderId: body.razorpay_order_id },
      data: {
        status: 'captured',
        providerPaymentId: body.razorpay_payment_id,
        paymentMethod,
      },
    });

    // Step 4: Upgrade user plan
    const plan = body.plan;
    const config = getPlanConfig(plan);
    const interval = body.interval || 'monthly';
    const periodDays = interval === 'annual' ? 365 : 30;
    const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan,
        aiTokensLimit: config.aiTokensLimit,
        pdfExportsLimit: config.pdfExportsLimit,
        atsScansLimit: config.atsScansLimit,
        resumesLimit: config.resumesLimit,
        stripeCurrentPeriodEnd: periodEnd, // Reuse the existing column for period tracking
      },
    });
    await resetUsageForPlan(this.prisma, userId, plan, periodEnd);

    this.logger.log(`User ${userId} upgraded to ${plan} (${interval}) via Razorpay`);

    return {
      ok: true,
      plan,
      interval,
      limits: config,
      periodEnd: periodEnd.toISOString(),
      message: `Successfully upgraded to ${plan}! Your ${interval} subscription is now active.`,
    };
  }

  // ─── Webhook Handler ────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer | string, signature: string) {
    // Verify webhook signature
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(bodyStr)
      .digest('hex');

    if (expectedSig !== signature) {
      this.logger.warn('Razorpay webhook signature mismatch');
      throw new ForbiddenException('Invalid webhook signature');
    }

    const event = JSON.parse(bodyStr);
    const eventType = event?.event;

    this.logger.log(`Razorpay webhook received: ${eventType}`);

    switch (eventType) {
      case 'payment.captured': {
        const payment = event.payload?.payment?.entity;
        if (payment) {
          await this.prisma.paymentHistory.updateMany({
            where: { providerOrderId: payment.order_id },
            data: {
              status: 'captured',
              providerPaymentId: payment.id,
              paymentMethod: payment.method,
            },
          });
        }
        break;
      }
      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        if (payment) {
          await this.prisma.paymentHistory.updateMany({
            where: { providerOrderId: payment.order_id },
            data: { status: 'failed' },
          });
        }
        break;
      }
      case 'refund.created': {
        const refund = event.payload?.refund?.entity;
        if (refund?.payment_id) {
          await this.prisma.paymentHistory.updateMany({
            where: { providerPaymentId: refund.payment_id },
            data: { status: 'refunded' },
          });
        }
        break;
      }
      default:
        this.logger.log(`Unhandled Razorpay event: ${eventType}`);
        break;
    }

    return { received: true };
  }

  // ─── Payment History ────────────────────────────────────────────────────

  async getPaymentHistory(userId: string) {
    const payments = await this.prisma.paymentHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return payments.map((p: any) => ({
      id: p.id,
      amount: p.amountPaise / 100, // Convert paise to rupees
      currency: p.currency,
      status: p.status,
      plan: p.planType,
      provider: p.paymentProvider,
      paymentMethod: p.paymentMethod,
      date: p.createdAt,
    }));
  }
}
