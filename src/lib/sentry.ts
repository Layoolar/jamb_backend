/**
 * Sentry. Optional — with SENTRY_DSN unset, everything here is a no-op, so
 * local dev and CI need no account.
 *
 * Note the `beforeSend` scrub. Sentry captures request bodies, and this app's
 * bodies contain passwords, ID tokens and refresh tokens. Nothing is worth a
 * credential leaking into a third-party dashboard.
 */

import * as Sentry from '@sentry/node';
import { env, isProd } from '../env.js';

const SECRET_KEYS = new Set([
  'password',
  'idtoken',
  'refreshtoken',
  'accesstoken',
  'token',
  'code',
  'authorization',
  'jwt_secret',
  'tokenhash',
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.has(k.toLowerCase()) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

export function initSentry(): boolean {
  if (!env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Sampled, not everything — traces on every duel answer would be noise and
    // quota with nothing learned.
    tracesSampleRate: isProd ? 0.1 : 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.data) event.request.data = scrub(event.request.data);
      if (event.request?.headers) delete event.request.headers.authorization;
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },
  });

  return true;
}

export { Sentry };
