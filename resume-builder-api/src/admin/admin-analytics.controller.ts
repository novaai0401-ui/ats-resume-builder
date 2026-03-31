import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async getSummary() {
    const totalUsers = await this.prisma.user.count();
    const totalLogins = await this.prisma.loginEvent.count();

    return {
      totalRegisteredUsers: totalUsers,
      totalLoginEvents: totalLogins,
    };
  }

  @Get('users')
  async getUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        mobile: true,
        isAdmin: true,
        loginCount: true,
        plan: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { users };
  }
}
