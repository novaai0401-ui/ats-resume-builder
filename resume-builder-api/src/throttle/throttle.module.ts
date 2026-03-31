import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate limiting module.
 *
 * Two tiers:
 *   - short: 20 requests per 10 seconds (burst protection)
 *   - long:  100 requests per 60 seconds (sustained rate limit)
 *
 * Individual routes can override with @Throttle() decorator.
 * File upload endpoints (parse-upload) should use a stricter limit.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 10_000,   // 10 seconds
        limit: 20,     // 20 requests per 10s window
      },
      {
        name: 'long',
        ttl: 60_000,   // 60 seconds
        limit: 100,    // 100 requests per 60s window
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ThrottleModule {}
