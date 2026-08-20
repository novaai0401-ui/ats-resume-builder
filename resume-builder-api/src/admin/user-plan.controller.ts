import { BadRequestException, Body, Controller, NotFoundException, Patch, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { getPlanConfig, type PlanName } from '../billing/plan-limits';

const VALID_PLANS = new Set<PlanName>(['FREE', 'STUDENT', 'PRO']);

/**
 * Admin: set a user's plan directly (comp accounts, the founder's own account,
 * refund-and-downgrade support cases). There was no way to do this without a
 * production psql session, which is exactly the kind of ad-hoc access this
 * codebase tries not to need.
 *
 * Applies the SAME limits the paid upgrade path applies (getPlanConfig), so a
 * granted account behaves identically to a purchased one — otherwise a comp
 * PRO user would carry FREE-plan quotas and every gate would misbehave in
 * confusing ways.
 *
 * Deliberately does NOT touch payment-gateway state: a granted plan has no
 * Stripe/Razorpay subscription, so there is nothing to cancel and no renewal.
 */
@SkipThrottle()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class UserPlanController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch('plan')
  async setPlan(
    @Req() req: { user: { userId: string } },
    @Body() body: { email?: string; plan?: string },
  ) {
    const email = String(body?.email || '').trim().toLowerCase();
    const plan = String(body?.plan || '').trim().toUpperCase() as PlanName;
    if (!email) throw new BadRequestException('email is required.');
    if (!VALID_PLANS.has(plan)) {
      throw new BadRequestException(`plan must be one of: ${[...VALID_PLANS].join(', ')}`);
    }

    const user = await this.prisma.user.findFirst({ where: { email }, select: { id: true, plan: true } });
    if (!user) throw new NotFoundException(`No user with email ${email}.`);

    const limits = getPlanConfig(plan);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        plan,
        aiTokensLimit: limits.aiTokensLimit,
        pdfExportsLimit: limits.pdfExportsLimit,
        atsScansLimit: limits.atsScansLimit,
        resumesLimit: limits.resumesLimit,
      },
      select: { email: true, plan: true, pdfExportsLimit: true, aiTokensLimit: true },
    });

    return {
      ok: true,
      previousPlan: user.plan,
      user: updated,
      note:
        plan === 'FREE'
          ? 'Downgraded. Any gateway subscription must be cancelled in Stripe/Razorpay separately.'
          : 'Granted without a gateway subscription — no renewal, no invoice; revoke by setting FREE.',
    };
  }
}
