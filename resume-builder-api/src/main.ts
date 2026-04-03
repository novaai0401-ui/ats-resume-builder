import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
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
        if (req.originalUrl === '/billing/webhook') {
          req.rawBody = buf;
        }
      },
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
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
  return ['http://localhost:3000', 'http://localhost:3001'];
}

/** Check if an origin is allowed — supports exact match, Vercel preview, and Render patterns. */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;

  // Allow Vercel preview deployments matching any configured .vercel.app origin
  if (allowedOrigins.some((o) => o.endsWith('.vercel.app')) && origin.endsWith('.vercel.app')) {
    for (const allowed of allowedOrigins) {
      try {
        const allowedHost = new URL(allowed).hostname;
        const originHost = new URL(origin).hostname;
        const slug = allowedHost.replace('.vercel.app', '');
        if (originHost === allowedHost || originHost.endsWith(`-${slug}.vercel.app`)) {
          return true;
        }
      } catch { /* skip invalid URLs */ }
    }
  }

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
