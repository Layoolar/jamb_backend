import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env.js';
import { badRequest } from '../lib/errors.js';

/**
 * Google and Apple ID token verification (PLAN §2.4).
 *
 * Both are the same operation with different issuers and audiences, which is
 * why adding Apple Sign-In costs about a day rather than a week. Native iOS
 * Apple Sign-In needs no Services ID, no .p8 key and no client secret — the
 * client hands us an identity token and we check it against Apple's JWKS.
 *
 * The key sets are cached and refreshed by jose, so key rotation is handled.
 */
const JWKS = {
  google: createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs'),
  ),
  apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
} as const;

export type Provider = keyof typeof JWKS;

export type ProviderIdentity = {
  provider: Provider;
  /** Stable per-provider user id. */
  subject: string;
  email: string | null;
  /** Only a verified email may be used to link to an existing account. */
  emailVerified: boolean;
};

/** Google sends this as a boolean or the string "true" depending on the flow. */
const asBool = (v: unknown): boolean => v === true || v === 'true';

export async function verifyProviderIdToken(
  provider: Provider,
  idToken: string,
): Promise<ProviderIdentity> {
  const audience =
    provider === 'google' ? env.GOOGLE_CLIENT_IDS : [env.APPLE_BUNDLE_ID];

  if (audience.length === 0) {
    throw badRequest(
      'provider_not_configured',
      `${provider} sign-in is not configured on this server.`,
    );
  }

  const issuer =
    provider === 'google'
      ? ['https://accounts.google.com', 'accounts.google.com']
      : 'https://appleid.apple.com';

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, JWKS[provider], {
      issuer,
      audience,
    }));
  } catch (e) {
    throw badRequest(
      'bad_id_token',
      'That sign-in could not be verified. Try again.',
      e instanceof Error ? e.message : undefined,
    );
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw badRequest('bad_id_token', 'That sign-in token is missing a subject.');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;

  return {
    provider,
    subject: payload.sub,
    email,
    // Apple omits email_verified for private-relay addresses, which are
    // verified by construction — Apple controls the relay domain.
    emailVerified: asBool(payload.email_verified) || (provider === 'apple' && !!email),
  };
}
