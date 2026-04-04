import { BadRequestException, Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateCheckoutSessionSchema, type CreateCheckoutSessionDto } from 'resume-builder-shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { RazorpayService } from './razorpay.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly razorpayService: RazorpayService,
  ) {}

  /** Get the current user's plan and limits. */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: { user: { userId: string } }) {
    return this.billingService.getPlanStatus(req.user.userId, this.razorpayService.isConfigured());
  }

  /** Directly upgrade plan (no Stripe required). For personal/dev use. */
  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
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

  /** Add premium credits (admin or purchase callback). */
  @Post('add-credits')
  @UseGuards(JwtAuthGuard)
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
  checkout(@Req() req: { user: { userId: string } }, @Body() body: CreateCheckoutSessionDto) {
    const parsed = CreateCheckoutSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.billingService.createCheckoutSession(req.user.userId, parsed.data.plan);
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
}
