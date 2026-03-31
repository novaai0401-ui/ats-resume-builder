import { BadRequestException, Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CreateCheckoutSessionSchema, type CreateCheckoutSessionDto } from 'resume-builder-shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /** Get the current user's plan and limits. */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: { user: { userId: string } }) {
    return this.billingService.getPlanStatus(req.user.userId);
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
  @SkipThrottle()
  webhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    return this.billingService.handleWebhook(req, signature);
  }
}
