import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId?: string;
  email?: string;
  mobile?: string;
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly logger = new Logger(AdminAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const userId = String(req.user?.userId || '').trim();
    if (!userId) return false;

    // Always load user from DB for authoritative check
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mobile: true, isAdmin: true },
    });
    if (!row) return false;

    // DB-level isAdmin flag (set during registration / admin promotion)
    if (row.isAdmin) return true;

    // Env-based allow-lists (defense in depth)
    const adminUserIds = parseCsvSet(process.env.ADMIN_USER_IDS);
    if (adminUserIds.has(userId)) return this.grantAndLog(userId, 'ADMIN_USER_IDS');

    const adminEmails = parseCsvSet(process.env.ADMIN_EMAILS);
    const userEmail = String(row.email || '').trim().toLowerCase();
    if (userEmail && adminEmails.has(userEmail)) return this.grantAndLog(userId, 'ADMIN_EMAILS');

    const adminMobiles = parseMobileSet(process.env.ADMIN_MOBILES);
    if (!adminMobiles.size) return false;

    const userMobile = normalizeMobile(row.mobile ?? undefined);
    if (userMobile && adminMobiles.has(userMobile)) return this.grantAndLog(userId, 'ADMIN_MOBILES');

    return false;
  }

  private grantAndLog(userId: string, source: string): true {
    this.logger.log(`Admin access granted to ${userId} via ${source}`);
    return true;
  }
}

function parseCsvSet(value?: string) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseMobileSet(value?: string) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => normalizeMobile(item))
      .filter(Boolean),
  );
}

function normalizeMobile(input?: string) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return `+${digits}`;
}
