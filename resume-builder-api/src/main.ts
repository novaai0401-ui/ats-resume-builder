import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { validateProductionEnv } from './env-validation';

async function bootstrap() {
  // Validate secrets before the app even starts wiring modules
  validateProductionEnv();

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const isProduction = process.env.NODE_ENV === 'production';

  // ── Trusted proxy (Railway / Vercel / Cloudflare) ─────────────────────
  if (isProduction) {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 1);
  }

  // ── CORS ──────────────────────────────────────────────────────────────
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // ── Security headers ─────────────────────────────────────────────────
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0'); // modern browsers — rely on CSP
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'",
      );
    }
    next();
  });

  // ── Body parsing ──────────────────────────────────────────────────────
  app.use(
    json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        if (req.originalUrl === '/billing/webhook') {
          req.rawBody = buf;
        }
      },
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  if (!isProduction) {
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
  return ['http://localhost:3000', 'http://localhost:3001'];
}
