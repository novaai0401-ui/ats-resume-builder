import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

/**
 * Whether request throttling is bypassed for this environment.
 *
 * We enforce ONLY in production (and any NODE_ENV=production preview), and
 * honour the existing FORCE_DISABLE_RATE_LIMIT ops switch. Local/dev/test
 * stay unthrottled so the test suite and local loops don't hit 429s.
 */
export function shouldSkipThrottle(env: NodeJS.ProcessEnv = process.env): boolean {
  const disabled = String(env.FORCE_DISABLE_RATE_LIMIT || '').toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(disabled)) return true;
  return String(env.NODE_ENV || '').toLowerCase() !== 'production';
}

/**
 * Global rate limiting. Default: 60 requests / 60s / IP (keyed on the real
 * client IP thanks to `trust proxy` in main.ts). Sensitive routes tighten
 * this with @Throttle(). Previously this module was written but NEVER
 * imported into AppModule, so nothing was throttled — this wires it in.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      skipIf: () => shouldSkipThrottle(),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ThrottleModule {}
