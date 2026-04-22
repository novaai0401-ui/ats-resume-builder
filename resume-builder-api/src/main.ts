import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

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
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-locale', 'x-user-timezone'],
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

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Bootstrap failed';
  console.error(`[bootstrap] ${message}`);
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
