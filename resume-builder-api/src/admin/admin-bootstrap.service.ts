import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeMobile } from '../auth/mobile.util';

/**
 * On API startup, ensure the designated admin account exists in the DB and
 * carries the bootstrap password from env. The password is bcrypt-hashed at
 * boot — plaintext is never written anywhere persistent.
 *
 * Envs (all optional; if ADMIN_BOOTSTRAP_PASSWORD is unset the bootstrap is a
 * no-op so dev environments without the secret don't accidentally create an
 * admin with a known hash):
 *   ADMIN_BOOTSTRAP_EMAIL     default novaai0401@gmail.com
 *   ADMIN_BOOTSTRAP_MOBILE    default +919307009427
 *   ADMIN_BOOTSTRAP_NAME      default Platform Admin
 *   ADMIN_BOOTSTRAP_PASSWORD  required to create/reset the account
 *   ADMIN_BOOTSTRAP_FORCE_RESET=true re-hashes the password on every boot even
 *                              if the user already exists
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.run();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Admin bootstrap failed: ${msg}`);
    }
  }

  private async run(): Promise<void> {
    const password = (this.config.get<string>('ADMIN_BOOTSTRAP_PASSWORD', '') || '').trim();
    if (!password) {
      this.logger.debug('ADMIN_BOOTSTRAP_PASSWORD not set — skipping admin bootstrap.');
      return;
    }
    const email = (this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL', '') || 'novaai0401@gmail.com').trim().toLowerCase();
    const mobileRaw = this.config.get<string>('ADMIN_BOOTSTRAP_MOBILE', '') || '+919307009427';
    const mobile = normalizeMobile(mobileRaw);
    const fullName = (this.config.get<string>('ADMIN_BOOTSTRAP_NAME', '') || 'Platform Admin').trim();
    const forceReset = String(this.config.get<string>('ADMIN_BOOTSTRAP_FORCE_RESET', '') || '').toLowerCase() === 'true';

    if (!mobile) {
      this.logger.warn(`Admin bootstrap aborted: mobile "${mobileRaw}" is not a valid E.164 number.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (!existing) {
      await this.prisma.user.create({
        data: {
          email,
          mobile,
          fullName,
          passwordHash,
          isAdmin: true,
          plan: 'PRO',
          primaryAuthProvider: 'password',
          hasUserSetPassword: true,
        },
      });
      this.logger.log(`Admin bootstrap: created ${email}.`);
      return;
    }

    const updateData: Record<string, unknown> = { isAdmin: true };
    if (!existing.mobile && mobile) updateData.mobile = mobile;
    if (forceReset) updateData.passwordHash = passwordHash;

    await this.prisma.user.update({
      where: { id: existing.id },
      data: updateData,
    });
    this.logger.log(
      `Admin bootstrap: ensured ${email} is admin${forceReset ? ' and reset password' : ''}.`,
    );
  }
}
