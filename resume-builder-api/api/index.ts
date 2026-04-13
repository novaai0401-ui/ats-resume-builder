import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import type { Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';

let app: NestExpressApplication;

async function bootstrap(): Promise<NestExpressApplication> {
  if (app) return app;

  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

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
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.use(
    json({
      limit: '1mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        if (req.originalUrl === '/billing/webhook') {
          req.rawBody = buf;
        }
      },
    }),
  );

  await app.init();
  return app;
}

function parseAllowedOrigins(value?: string) {
  const fromEnv = (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return ['http://localhost:4000', 'http://localhost:4001'];
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;
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
  return false;
}

export default async function handler(req: Request, res: Response) {
  const nestApp = await bootstrap();
  const instance = nestApp.getHttpAdapter().getInstance();
  instance(req, res);
}
