import * as Sentry from '@sentry/node';

/**
 * Error tracking (Sentry) — OPT-IN and fully no-op when SENTRY_DSN is unset.
 *
 * The audit flagged that nobody is alerted when payments/exports throw in
 * prod: errors only went to stdout. This wires a single, dependency-light
 * capture path. When SENTRY_DSN is absent (local/dev, or a founder who
 * hasn't set up a project yet) every function here is a cheap no-op — the
 * app behaves exactly as before.
 */

let enabled = false;

export function isSentryEnabled(): boolean {
  return enabled;
}

export function initSentry(): void {
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) return; // no-op: no DSN configured

  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0') || 0;
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || undefined,
      // Perf tracing is off by default (cost/overhead); flip the env to enable.
      tracesSampleRate,
      // Don't ship request bodies / headers with PII unless explicitly opted in.
      sendDefaultPii: String(process.env.SENTRY_SEND_PII || '').toLowerCase() === 'true',
    });
    enabled = true;
    // eslint-disable-next-line no-console
    console.log('[observability] Sentry error tracking enabled');
  } catch (err) {
    // Never let observability wiring break the boot.
    // eslint-disable-next-line no-console
    console.warn(`[observability] Sentry init failed, continuing without it: ${String(err)}`);
  }
}

/** Report an exception. No-op when Sentry is disabled. */
export function captureException(
  error: unknown,
  context?: { route?: string; method?: string; userId?: string; extra?: Record<string, unknown> },
): void {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      if (context?.route) scope.setTag('route', context.route);
      if (context?.method) scope.setTag('http.method', context.method);
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.extra) scope.setExtras(context.extra);
      Sentry.captureException(error);
    });
  } catch {
    // swallow — reporting must never throw into the request path
  }
}

/** Flush buffered events on shutdown so nothing is lost. No-op when disabled. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // ignore
  }
}
