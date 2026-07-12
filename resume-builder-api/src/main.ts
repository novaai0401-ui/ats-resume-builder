import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import { validateProductionEnv } from './env-validation';
import { initSentry, flushSentry, captureException } from './observability/sentry';
import { SentryInterceptor } from './observability/sentry.interceptor';

async function bootstrap() {
  // Error tracking first so anything below (incl. boot failures and
  // unhandled rejections) is reported. No-op unless SENTRY_DSN is set.
  initSentry();

  // Fail loud BEFORE booting if a critical prod secret is missing/weak/
  // placeholder — otherwise the app would silently sign JWTs with the
  // public 'dev_secret' fallback. No-op (warnings only) outside production.
  validateProductionEnv();

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // Report server-side (5xx / non-HTTP) failures to Sentry, then re-throw so
  // the exception filters still format the response. No-op when disabled.
  app.useGlobalInterceptors(new SentryInterceptor());
  // Flush buffered Sentry events on exit so nothing is lost.
  process.on('beforeExit', () => { void flushSentry(); });
  // Behind Render's proxy the real client IP is in X-Forwarded-For. Trust
  // exactly one hop so rate limiters key on the actual client, not the
  // proxy, and can't be trivially spoofed by adding extra XFF entries.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // Keep raw Prisma error messages (column names, SQL, stack hints) out of
  // every HTTP response body. Registered globally so we catch JSON API
  // responses as well as anything the controllers forget to wrap.
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Security headers. Strict defaults; the API itself serves JSON only, so a
  // very narrow CSP is fine. CORS/browser callers still work because helmet
  // doesn't touch Access-Control-* headers.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'none'"],
          connectSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
          : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isOriginAllowed(origin, allowedOrigins));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // BYOK free-tier users attach their own AI key/provider as custom
    // headers; without these in the allowlist the browser's CORS preflight
    // blocks every AI request they make (their key never reaches the API,
    // and the editor surfaces it as an "AI Critique error"). See R-084.
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-user-locale',
      'x-user-timezone',
      'X-User-AI-Key',
      'X-User-AI-Provider',
      'X-User-AI-Model',
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  app.use(
    json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        if (req.originalUrl === '/billing/webhook' || req.originalUrl === '/billing/razorpay/webhook') {
          req.rawBody = buf;
        }
      },
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 4001;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[bootstrap] Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  }
  try {
    await app.listen(port);
    console.log(`[bootstrap] API listening on http://localhost:${port}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('EADDRINUSE')) {
      console.error(`[bootstrap] Port ${port} is already in use.`);
      console.error(`[bootstrap] Stop the other process using port ${port}, or set a different PORT in .env`);
    } else {
      console.error(`[bootstrap] Failed to start server: ${msg}`);
    }
    process.exit(1);
  }
}

bootstrap().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Bootstrap failed';
  console.error(`[bootstrap] ${message}`);
  captureException(error, { route: 'bootstrap' });
  await flushSentry();
  process.exit(1);
});

function parseAllowedOrigins(value?: string) {
  const fromEnv = (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return ['http://localhost:4000', 'http://localhost:4001'];
}

/** Check if an origin is allowed — supports exact match and Render preview patterns. */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;

  // Allow Render preview/PR deployments matching any configured .onrender.com origin
  // Pattern: <service-name>-<pr-id>.onrender.com or <service-name>-<hash>.onrender.com
  if (allowedOrigins.some((o) => o.endsWith('.onrender.com')) && origin.endsWith('.onrender.com')) {
    for (const allowed of allowedOrigins) {
      try {
        const allowedHost = new URL(allowed).hostname;
        const originHost = new URL(origin).hostname;
        const slug = allowedHost.replace('.onrender.com', '');
        if (originHost === allowedHost || originHost.startsWith(`${slug}-`)) {
          return true;
        }
      } catch { /* skip invalid URLs */ }
    }
  }

  return false;
}
