import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanConfig, getPlanPricing, isIndianUser, type PlanName } from './plan-limits';
import { resetUsageForPlan } from './usage';

function isValidStripeKey(key: string): boolean {
  return Boolean(key) && key.startsWith('sk_') && !key.includes('change_me') && key.length > 20;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY', '');
    if (isValidStripeKey(key)) {
      this.stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion });
      this.logger.log('Stripe billing: CONFIGURED');
    } else {
      this.stripe = null;
      this.logger.warn('Stripe billing: NOT CONFIGURED — set a valid STRIPE_SECRET_KEY in .env');
    }
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Billing is not configured. Set a valid STRIPE_SECRET_KEY in .env to enable subscriptions.');
    }
    return this.stripe;
  }

  // ─── Direct Plan Management (no Stripe required) ─────────────────────────

  async getPlanStatus(userId: string, razorpayConfigured = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    const config = getPlanConfig(user.plan as PlanName);
    const credits = (user as any).premiumCredits ?? 0;
    return {
      plan: user.plan,
      premiumCredits: credits,
      limits: config,
      usage: {
        aiTokensUsed: user.aiTokensUsed,
        aiTokensLimit: user.aiTokensLimit,
        pdfExportsUsed: user.pdfExportsUsed,
        pdfExportsLimit: user.pdfExportsLimit,
        atsScansUsed: user.atsScansUsed,
        atsScansLimit: user.atsScansLimit,
      },
      periodEnd: user.stripeCurrentPeriodEnd?.toISOString() || null,
      stripeConfigured: Boolean(this.stripe),
      razorpayConfigured,
    };
  }

  // ─── Premium Feature Access ─────────────────────────────────────────────

  async checkPremiumAccess(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    const isPaidPlan = user.plan === 'STUDENT' || user.plan === 'PRO';
    const credits = (user as any).premiumCredits ?? 0;
    const hasCredits = credits > 0;
    return {
      allowed: isPaidPlan || hasCredits,
      plan: user.plan,
      premiumCredits: credits,
      reason: isPaidPlan ? 'subscription' : hasCredits ? 'credits' : 'none',
    };
  }

  async consumePremiumCredit(userId: string, feature: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    const credits = (user as any).premiumCredits ?? 0;
    if (user.plan === 'STUDENT' || user.plan === 'PRO') {
      return { consumed: false, reason: 'subscription', premiumCredits: credits };
    }
    if (credits <= 0) {
      throw new ForbiddenException('No premium credits remaining. Upgrade or purchase a Boost Pack.');
    }
    try {
      await this.prisma.$executeRawUnsafe(
        'UPDATE "User" SET "premiumCredits" = "premiumCredits" - 1 WHERE id = $1',
        userId,
      );
    } catch {
      // Column may not exist yet — graceful fallback
      this.logger.warn('premiumCredits column not available. Run: npx prisma db push');
    }
    this.logger.log(`User ${userId} consumed 1 premium credit for ${feature}. Remaining: ${credits - 1}`);
    return { consumed: true, reason: 'credit', premiumCredits: credits - 1 };
  }

  async addPremiumCredits(userId: string, count: number) {
    try {
      await this.prisma.$executeRawUnsafe(
        'UPDATE "User" SET "premiumCredits" = COALESCE("premiumCredits", 0) + $1 WHERE id = $2',
        count,
        userId,
      );
    } catch {
      this.logger.warn('premiumCredits column not available. Run: npx prisma db push');
    }
    const updated = await this.prisma.user.findUnique({ where: { id: userId } });
    return { premiumCredits: (updated as any)?.premiumCredits ?? count };
  }

  async directUpgrade(userId: string, plan: PlanName) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    const config = getPlanConfig(plan);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan,
        aiTokensLimit: config.aiTokensLimit,
        pdfExportsLimit: config.pdfExportsLimit,
        atsScansLimit: config.atsScansLimit,
        resumesLimit: config.resumesLimit,
      },
    });
    await resetUsageForPlan(this.prisma, userId, plan);
    this.logger.log(`User ${userId} upgraded to ${plan} (direct)`);
    return { ok: true, plan, limits: config, message: `Upgraded to ${plan} successfully.` };
  }

  async directDowngrade(userId: string) {
    const config = getPlanConfig('FREE');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan: 'FREE',
        aiTokensLimit: config.aiTokensLimit,
        pdfExportsLimit: config.pdfExportsLimit,
        atsScansLimit: config.atsScansLimit,
        resumesLimit: config.resumesLimit,
        stripeSubscriptionId: null,
        stripeCurrentPeriodEnd: null,
      },
    });
    await resetUsageForPlan(this.prisma, userId, 'FREE');
    this.logger.log(`User ${userId} downgraded to FREE (direct)`);
    return { ok: true, plan: 'FREE', limits: config, message: 'Downgraded to Free plan.' };
  }

  // ─── Stripe-based Plan Management ────────────────────────────────────────

  async createCheckoutSession(userId: string, plan: PlanName, options?: { locale?: string; timezone?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const isIndia = isIndianUser({
      locale: options?.locale,
      timezone: options?.timezone,
      phone: user.mobile || undefined,
    });

    // Use INR price IDs for Indian users if configured
    const priceIdKey = isIndia
      ? (plan === 'STUDENT' ? 'STRIPE_PRICE_STUDENT_INR' : 'STRIPE_PRICE_PRO_INR')
      : (plan === 'STUDENT' ? 'STRIPE_PRICE_STUDENT' : 'STRIPE_PRICE_PRO');
    const fallbackKey = plan === 'STUDENT' ? 'STRIPE_PRICE_STUDENT' : 'STRIPE_PRICE_PRO';
    const priceId = this.config.get<string>(priceIdKey, '') || this.config.get<string>(fallbackKey, '');

    if (!priceId) {
      throw new ForbiddenException('Stripe price not configured');
    }

    const customerId = user.stripeCustomerId || (await this.createCustomer(user));

    const pricing = getPlanPricing(plan);
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: this.config.get<string>('STRIPE_SUCCESS_URL', 'http://localhost:4000/dashboard'),
      cancel_url: this.config.get<string>('STRIPE_CANCEL_URL', 'http://localhost:4000/dashboard'),
      metadata: { userId, plan, currency: isIndia ? 'INR' : 'USD' },
    };

    // Add tax ID collection for Indian users (GST compliance)
    if (isIndia) {
      sessionConfig.tax_id_collection = { enabled: true };
      sessionConfig.metadata!.gstRate = String(pricing.gstRate);
    }

    const session = await this.requireStripe().checkout.sessions.create(sessionConfig);

    return {
      url: session.url,
      currency: isIndia ? 'INR' : 'USD',
      pricing,
    };
  }

  async createPortalSession(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeCustomerId) {
      throw new ForbiddenException('No Stripe customer found');
    }

    const session = await this.requireStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: this.config.get<string>('STRIPE_SUCCESS_URL', 'http://localhost:4000/dashboard'),
    });

    return { url: session.url };
  }

  async handleWebhook(req: any, signature: string) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    let event: Stripe.Event;
    try {
      const rawBody = req.rawBody || req.body;
      event = this.requireStripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.customer && session.metadata?.userId) {
          await this.prisma.user.update({
            where: { id: session.metadata.userId },
            data: {
              stripeCustomerId: String(session.customer),
            },
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.applySubscription(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.cancelSubscription(subscription);
        break;
      }
      default:
        break;
    }

    return { received: true };
  }

  private async createCustomer(user: { id: string; email: string; fullName: string }) {
    const customer = await this.requireStripe().customers.create({
      email: user.email,
      name: user.fullName,
      metadata: { userId: user.id },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private async applySubscription(subscription: Stripe.Subscription) {
    const customerId = String(subscription.customer);
    const user = await this.prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
    if (!user) return;

    const priceId = subscription.items.data[0]?.price?.id || '';
    const plan = priceId === this.config.get<string>('STRIPE_PRICE_STUDENT', '') ? 'STUDENT' : 'PRO';
    const planConfig = getPlanConfig(plan);
    const itemPeriodEnd = subscription.items.data[0]?.current_period_end;
    const currentPeriodEnd = new Date((itemPeriodEnd ?? Math.floor(Date.now() / 1000)) * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        plan,
        stripeSubscriptionId: subscription.id,
        stripeCurrentPeriodEnd: currentPeriodEnd,
        aiTokensLimit: planConfig.aiTokensLimit,
        pdfExportsLimit: planConfig.pdfExportsLimit,
        atsScansLimit: planConfig.atsScansLimit,
        resumesLimit: planConfig.resumesLimit,
      },
    });

    await resetUsageForPlan(this.prisma, user.id, plan, currentPeriodEnd);
  }

  private async cancelSubscription(subscription: Stripe.Subscription) {
    const customerId = String(subscription.customer);
    const user = await this.prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
    if (!user) return;

    const planConfig = getPlanConfig('FREE');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        plan: 'FREE',
        stripeSubscriptionId: null,
        stripeCurrentPeriodEnd: null,
        aiTokensLimit: planConfig.aiTokensLimit,
        pdfExportsLimit: planConfig.pdfExportsLimit,
        atsScansLimit: planConfig.atsScansLimit,
        resumesLimit: planConfig.resumesLimit,
      },
    });

    await resetUsageForPlan(this.prisma, user.id, 'FREE');
  }
}
