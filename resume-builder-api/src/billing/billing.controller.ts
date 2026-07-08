import { BadRequestException, Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateCheckoutSessionSchema, type CreateCheckoutSessionDto } from 'resume-builder-shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { BillingService } from './billing.service';
import { RazorpayService } from './razorpay.service';
import { DownloadChargeService } from './download-charge.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly razorpayService: RazorpayService,
    private readonly downloadCharge: DownloadChargeService,
  ) {}

  /** Get the current user's plan and limits. */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: { user: { userId: string } }) {
    return this.billingService.getPlanStatus(req.user.userId, this.razorpayService.isConfigured());
  }

  /**
   * Directly set a user's plan with NO payment. ADMIN ONLY — this is an
   * ops/seed tool, never reachable by ordinary users. Real upgrades must
   * go through the signature-verified Razorpay flow (verify-payment).
   */
  @Post('upgrade')
  @UseGuards(JwtAuthGuard, AdminAuthGuard)
  upgrade(@Req() req: { user: { userId: string } }, @Body() body: CreateCheckoutSessionDto) {
    const parsed = CreateCheckoutSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.billingService.directUpgrade(req.user.userId, parsed.data.plan);
  }

  /** Check if user can use premium features. */
  @Get('premium-access')
  @UseGuards(JwtAuthGuard)
  checkPremiumAccess(@Req() req: { user: { userId: string } }) {
    return this.billingService.checkPremiumAccess(req.user.userId);
  }

  /** Consume one premium credit for a specific feature. */
  @Post('consume-credit')
  @UseGuards(JwtAuthGuard)
  consumeCredit(@Req() req: { user: { userId: string } }, @Body() body: { feature: string }) {
    return this.billingService.consumePremiumCredit(req.user.userId, String(body?.feature || 'unknown'));
  }

  /** Add premium credits with NO payment. ADMIN ONLY (ops/purchase callback). */
  @Post('add-credits')
  @UseGuards(JwtAuthGuard, AdminAuthGuard)
  addCredits(@Req() req: { user: { userId: string } }, @Body() body: { count: number }) {
    const count = Number(body?.count) || 0;
    if (count <= 0 || count > 100) throw new BadRequestException('Invalid credit count (1-100).');
    return this.billingService.addPremiumCredits(req.user.userId, count);
  }

  /** Downgrade to free plan. */
  @Post('downgrade')
  @UseGuards(JwtAuthGuard)
  downgrade(@Req() req: { user: { userId: string } }) {
    return this.billingService.directDowngrade(req.user.userId);
  }

  /** Stripe checkout (requires valid STRIPE_SECRET_KEY). */
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(
    @Req() req: { user: { userId: string } },
    @Body() body: CreateCheckoutSessionDto,
    @Headers('x-user-locale') locale?: string,
    @Headers('x-user-timezone') timezone?: string,
  ) {
    const parsed = CreateCheckoutSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.billingService.createCheckoutSession(req.user.userId, parsed.data.plan, { locale, timezone });
  }

  /** Stripe portal (requires valid STRIPE_SECRET_KEY). */
  @Post('portal')
  @UseGuards(JwtAuthGuard)
  portal(@Req() req: { user: { userId: string } }) {
    return this.billingService.createPortalSession(req.user.userId);
  }

  @Post('webhook')
  webhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    return this.billingService.handleWebhook(req, signature);
  }

  // ─── Razorpay Endpoints ──────────────────────────────────────────────────

  /** Create a Razorpay order for plan purchase. */
  @Post('razorpay/create-order')
  @UseGuards(JwtAuthGuard)
  createRazorpayOrder(
    @Req() req: { user: { userId: string } },
    @Body() body: { plan: 'STUDENT' | 'PRO'; interval?: 'monthly' | 'annual' },
  ) {
    const plan = body?.plan;
    if (plan !== 'STUDENT' && plan !== 'PRO') {
      throw new BadRequestException('Invalid plan. Must be STUDENT or PRO.');
    }
    const interval = body?.interval === 'annual' ? 'annual' : 'monthly';
    return this.razorpayService.createOrder(req.user.userId, plan, interval);
  }

  /** Verify Razorpay payment after checkout completion. */
  @Post('razorpay/verify-payment')
  @UseGuards(JwtAuthGuard)
  verifyRazorpayPayment(
    @Req() req: { user: { userId: string } },
    @Body() body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      plan: 'STUDENT' | 'PRO';
      interval?: 'monthly' | 'annual';
    },
  ) {
    if (!body?.razorpay_order_id || !body?.razorpay_payment_id || !body?.razorpay_signature) {
      throw new BadRequestException('Missing Razorpay payment details.');
    }
    if (body.plan !== 'STUDENT' && body.plan !== 'PRO') {
      throw new BadRequestException('Invalid plan.');
    }
    return this.razorpayService.verifyPayment(req.user.userId, body);
  }

  /** Razorpay webhook handler. */
  @Post('razorpay/webhook')
  razorpayWebhook(
    @Req() req: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody = req.rawBody || req.body;
    return this.razorpayService.handleWebhook(rawBody, signature);
  }

  /** Get payment history. */
  @Get('payment-history')
  @UseGuards(JwtAuthGuard)
  getPaymentHistory(@Req() req: { user: { userId: string } }) {
    return this.razorpayService.getPaymentHistory(req.user.userId);
  }

  /** Check Razorpay configuration status. */
  @Get('razorpay/status')
  @UseGuards(JwtAuthGuard)
  getRazorpayStatus() {
    return { configured: this.razorpayService.isConfigured() };
  }

  // ─── Per-download charge ─────────────────────────────────────────────────

  /** Whether per-download charging is currently enabled (env flag). */
  @Get('download-charge/config')
  @UseGuards(JwtAuthGuard)
  getDownloadChargeConfig() {
    return { enabled: this.downloadCharge.isFeatureEnabled() };
  }

  /** Create a per-download payment order. */
  @Post('download-charge/init')
  @UseGuards(JwtAuthGuard)
  initDownloadCharge(
    @Req() req: { user: { userId: string } },
    @Body() body: { resumeId: string; region?: string },
  ) {
    const resumeId = String(body?.resumeId || '').trim();
    if (!resumeId) throw new BadRequestException('resumeId is required.');
    return this.downloadCharge.createOrder({
      userId: req.user.userId,
      resumeId,
      region: body?.region,
    });
  }

  /** Verify a Razorpay per-download payment and issue a download token. */
  @Post('download-charge/verify/razorpay')
  @UseGuards(JwtAuthGuard)
  verifyDownloadChargeRazorpay(
    @Req() req: { user: { userId: string } },
    @Body() body: {
      resumeId: string;
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    if (!body?.resumeId || !body?.razorpay_order_id || !body?.razorpay_payment_id || !body?.razorpay_signature) {
      throw new BadRequestException('Missing Razorpay verification fields.');
    }
    return this.downloadCharge.verifyRazorpay({
      userId: req.user.userId,
      resumeId: body.resumeId,
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature,
    });
  }

  /** Verify a Stripe Checkout Session and issue a download token. */
  @Post('download-charge/verify/stripe')
  @UseGuards(JwtAuthGuard)
  verifyDownloadChargeStripe(
    @Req() req: { user: { userId: string } },
    @Body() body: { resumeId: string; sessionId: string },
  ) {
    if (!body?.resumeId || !body?.sessionId) {
      throw new BadRequestException('Missing session details.');
    }
    return this.downloadCharge.verifyStripe({
      userId: req.user.userId,
      resumeId: body.resumeId,
      sessionId: body.sessionId,
    });
  }

  /**
   * R-073 self-serve recovery: re-issue a download token for a resume the
   * caller has ALREADY paid for (captured DOWNLOAD or paid plan). Lets a
   * user who lost their download — expired token, closed tab, failed render
   * — get it back without paying again. Throws 403 if there's no paid
   * entitlement, so it can't be used to skip the charge.
   */
  @Post('download-charge/reissue')
  @UseGuards(JwtAuthGuard)
  reissueDownloadToken(
    @Req() req: { user: { userId: string } },
    @Body() body: { resumeId: string },
  ) {
    const resumeId = String(body?.resumeId || '').trim();
    if (!resumeId) throw new BadRequestException('resumeId is required.');
    return this.downloadCharge.reissuePaidToken(req.user.userId, resumeId);
  }
}
