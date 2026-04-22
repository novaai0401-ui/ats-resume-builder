import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Global exception filter that keeps Prisma error messages out of HTTP
 * responses. Prisma errors carry internal SQL, column names, and stack-trace
 * flavoured text that we don't want customers to see (or attackers to mine).
 *
 * - HttpExceptions we already threw ourselves are passed through unchanged.
 * - Known Prisma errors become a small, safe JSON body with an HTTP status
 *   that actually matches the situation (503 for schema drift / DB down,
 *   409 for unique constraint violations, etc.).
 * - Everything else falls through to Nest's default 500 handler.
 *
 * The full error, including its message, is always logged server-side so
 * operators still have the information they need to debug.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientRustPanicError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Don't shadow exceptions we already chose to throw with an explicit
    // user-facing message.
    if (exception instanceof HttpException) {
      throw exception;
    }

    const res = host.switchToHttp().getResponse<Response>();
    const code = (exception as { code?: string })?.code;
    const msg = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`Prisma error (code=${code ?? 'n/a'}): ${msg}`);

    const { status, message, errorCode } = mapPrismaException(exception);
    res.status(status).json({ error: errorCode, message });
  }
}

function mapPrismaException(exception: unknown): {
  status: number;
  message: string;
  errorCode: string;
} {
  const code = (exception as { code?: string })?.code;

  // Schema drift / database unavailable — operator-actionable.
  if (code === 'P2021' || code === 'P2022') {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      errorCode: 'service_unavailable',
      message:
        'The service is temporarily unavailable due to a pending update. Please try again in a few minutes.',
    };
  }
  if (code === 'P1001' || code === 'P1002' || code === 'P1017') {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      errorCode: 'service_unavailable',
      message: 'The service is temporarily unreachable. Please try again shortly.',
    };
  }

  // Unique constraint — typical on double-submit signups.
  if (code === 'P2002') {
    return {
      status: HttpStatus.CONFLICT,
      errorCode: 'duplicate',
      message: 'A record with these details already exists.',
    };
  }

  // Missing related record, e.g. deleting something with FK children.
  if (code === 'P2025') {
    return {
      status: HttpStatus.NOT_FOUND,
      errorCode: 'not_found',
      message: 'The requested resource could not be found.',
    };
  }

  // Anything else — keep it generic so we don't leak schema details.
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: 'internal_error',
    message: 'An unexpected error occurred. Please try again.',
  };
}
