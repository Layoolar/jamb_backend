import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '../db/index.js';
import { refreshTokens } from '../db/schema.js';
import { env } from '../env.js';
import { unauthorized } from '../lib/errors.js';

const KEY = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'sabipass';

export const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

/**
 * Refresh tokens are opaque random strings, not JWTs — they must be revocable,
 * and only a stored record can be. We keep the SHA-256, never the token.
 */
const hashToken = (raw: string) =>
  createHash('sha256').update(raw).digest('hex');

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(KEY);
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, KEY, { issuer: ISSUER });
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
      throw unauthorized('bad_token', 'That session token is not valid.');
    }
    return payload.sub;
  } catch {
    throw unauthorized('bad_token', 'Your session has expired. Sign in again.');
  }
}

async function mintRefresh(userId: string, familyId: string): Promise<string> {
  const raw = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);

  await db.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: hashToken(raw),
    expiresAt,
  });

  return raw;
}

/** Called on a fresh login — starts a new token family. */
export async function issueTokens(userId: string): Promise<TokenPair> {
  const familyId = randomUUID();
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId),
    mintRefresh(userId, familyId),
  ]);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

/**
 * Rotates a refresh token.
 *
 * Reuse detection: a token that was already spent means it leaked, so the entire
 * family is revoked and the user must sign in again. Without this, a stolen
 * refresh token is valid until it expires.
 */
export async function rotateTokens(rawToken: string): Promise<TokenPair> {
  const tokenHash = hashToken(rawToken);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for('update');

    if (!row) {
      throw unauthorized('bad_refresh', 'Sign in again to continue.');
    }

    if (row.revokedAt) {
      throw unauthorized('revoked_refresh', 'Your session was ended. Sign in again.');
    }

    if (row.usedAt) {
      // Replay: burn the whole family.
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.familyId, row.familyId),
            isNull(refreshTokens.revokedAt),
          ),
        );
      throw unauthorized(
        'reused_refresh',
        'That session was already refreshed elsewhere. Sign in again.',
      );
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw unauthorized('expired_refresh', 'Your session expired. Sign in again.');
    }

    await tx
      .update(refreshTokens)
      .set({ usedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));

    const raw = randomBytes(48).toString('base64url');
    await tx.insert(refreshTokens).values({
      userId: row.userId,
      familyId: row.familyId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
    });

    return {
      accessToken: await signAccessToken(row.userId),
      refreshToken: raw,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  });
}

/** Sign-out / account deletion — kills every live session for the user. */
export async function revokeAllForUser(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
    );
}
