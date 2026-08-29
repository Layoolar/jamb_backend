import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail at boot on bad config rather than at 2am on a live request.
 */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 chars — generate one, do not invent it'),

  /** Every Google OAuth client ID that may appear as an ID token audience. */
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),

  APPLE_BUNDLE_ID: z.string().default('com.sabipass.app'),

  ANTHROPIC_API_KEY: z.string().optional(),

  /**
   * Transactional email (password reset only). With these unset, sends are
   * logged instead of delivered — so local dev needs no credentials.
   */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

const parsed = Env.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${issues}\n\nSee .env.example`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
