import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { captureException, isSentryEnabled } from './sentry';

/**
 * Reports server-side failures (5xx and non-HTTP exceptions) to Sentry and
 * re-throws, so the existing exception filters still format the response.
 *
 * Client errors (4xx: validation, auth, quota, paywall) are deliberately
 * NOT reported — they're expected outcomes, not incidents, and would drown
 * the signal we care about (payments/exports/DB actually breaking).
 */
@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isSentryEnabled() || context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        if (status >= 500) {
          captureException(error, {
            route: req?.route?.path || req?.originalUrl,
            method: req?.method,
            userId: req?.user?.userId,
          });
        }
        return throwError(() => error);
      }),
    );
  }
}
