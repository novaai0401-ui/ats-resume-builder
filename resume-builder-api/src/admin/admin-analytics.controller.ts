import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin-only analytics endpoints feeding the /admin dashboard.
 *
 * Everything here is read-only aggregate data. The heaviest query caps at
 * `limit` rows (default 50) and uses indexed columns so it stays cheap even
 * on production-sized tables.
 */
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async getSummary() {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since5min = new Date(now.getTime() - 5 * 60 * 1000);

    const [
      totalUsers,
      totalLogins,
      paidUsers,
      byokUsers,
      last24hLogins,
      activeNow,
      planBreakdown,
      providerBreakdown,
      newUsers7d,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.loginEvent.count(),
      this.prisma.user.count({ where: { plan: { not: 'FREE' } } }),
      this.prisma.user.count({ where: { byokKeyEnabled: true } }),
      this.prisma.loginEvent.count({ where: { createdAt: { gte: since24h } } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: since5min } } }),
      this.prisma.user.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),
      this.prisma.user.groupBy({
        by: ['primaryAuthProvider'],
        _count: { primaryAuthProvider: true },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    return {
      totalRegisteredUsers: totalUsers,
      totalLoginEvents: totalLogins,
      paidSubscribers: paidUsers,
      usersWithByokKey: byokUsers,
      logins24h: last24hLogins,
      activeRightNow: activeNow,
      newUsers7d,
      planBreakdown: planBreakdown.map((row) => ({ plan: row.plan, count: row._count.plan })),
      providerBreakdown: providerBreakdown.map((row) => ({
        provider: row.primaryAuthProvider,
        count: row._count.primaryAuthProvider,
      })),
    };
  }

  @Get('users')
  async getUsers(@Query('limit') limitRaw?: string) {
    const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10) || 50, 1), 200);
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        mobile: true,
        isAdmin: true,
        loginCount: true,
        plan: true,
        primaryAuthProvider: true,
        hasUserSetPassword: true,
        byokKeyEnabled: true,
        failedLoginCount: true,
        lockedUntil: true,
        lastActiveAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return { users };
  }

  /** Recent login events with IP + user-agent for the activity feed. */
  @Get('recent-activity')
  async getRecentActivity(@Query('limit') limitRaw?: string) {
    const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10) || 50, 1), 200);
    const events = await this.prisma.loginEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        email: true,
        method: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    });
    return { events };
  }

  /**
   * Aggregate login counts by IP across the last 30 days. IP is a rough
   * proxy for location; doing real GeoIP lookup needs an external service
   * (MaxMind / ipinfo) and is intentionally out of scope for this endpoint.
   */
  @Get('locations')
  async getLocations(@Query('days') daysRaw?: string) {
    const days = Math.min(Math.max(parseInt(daysRaw || '30', 10) || 30, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const grouped = await this.prisma.loginEvent.groupBy({
      by: ['ip'],
      where: { createdAt: { gte: since }, ip: { not: null } },
      _count: { ip: true },
      orderBy: { _count: { ip: 'desc' } },
      take: 50,
    });
    return {
      days,
      top: grouped.map((row) => ({ ip: row.ip, count: row._count.ip })),
    };
  }
}
