import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accounts, userStats, users } from '../db/schema.js';
import { conflict } from '../lib/errors.js';
import type { ProviderIdentity } from '../auth/oauth.js';

const avatarSeed = () => randomBytes(8).toString('hex');

/** Strips an email down to a usable username base. */
function baseFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'player';
  const cleaned = local.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12);
  return cleaned.length >= 3 ? cleaned : 'player';
}

async function uniqueUsername(base: string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}${randomBytes(3).toString('hex')}`;
}

export async function findByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash?: string | null;
  username?: string;
  emailVerified?: boolean;
}) {
  const email = input.email.toLowerCase();

  if (await findByEmail(email)) {
    throw conflict(
      'email_taken',
      'An account already uses that email. Sign in instead.',
    );
  }

  const username = input.username
    ? await (async () => {
        const [taken] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, input.username as string))
          .limit(1);
        if (taken) {
          throw conflict('username_taken', 'That username is taken. Pick another.');
        }
        return input.username as string;
      })()
    : await uniqueUsername(baseFromEmail(email));

  const [user] = await db
    .insert(users)
    .values({
      email,
      username,
      avatarSeed: avatarSeed(),
      passwordHash: input.passwordHash ?? null,
      emailVerified: input.emailVerified ?? false,
    })
    .returning();

  if (!user) throw new Error('user insert returned nothing');

  await db.insert(userStats).values({ userId: user.id }).onConflictDoNothing();

  return user;
}

/**
 * Resolves a social sign-in to a user (PLAN §2.4).
 *
 * Linking rule: an existing account is adopted only when the provider reports
 * the email as VERIFIED and it matches. Linking on an unverified email is an
 * account-takeover path — anyone who can mint a token claiming
 * someone@gmail.com would inherit that account.
 */
export async function findOrCreateFromProvider(
  identity: ProviderIdentity,
  username?: string,
): Promise<{ userId: string; isNewAccount: boolean }> {
  const [existingAccount] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, identity.provider),
        eq(accounts.providerAccountId, identity.subject),
      ),
    )
    .limit(1);

  if (existingAccount) {
    return { userId: existingAccount.userId, isNewAccount: false };
  }

  if (identity.email && identity.emailVerified) {
    const byEmail = await findByEmail(identity.email);
    if (byEmail) {
      await db
        .insert(accounts)
        .values({
          userId: byEmail.id,
          provider: identity.provider,
          providerAccountId: identity.subject,
          email: identity.email,
        })
        .onConflictDoNothing();
      return { userId: byEmail.id, isNewAccount: false };
    }
  }

  if (!identity.email) {
    throw conflict(
      'no_email_from_provider',
      'That sign-in did not return an email address. Use email and password instead.',
    );
  }

  const user = await createUser({
    email: identity.email,
    username,
    emailVerified: identity.emailVerified,
  });

  await db.insert(accounts).values({
    userId: user.id,
    provider: identity.provider,
    providerAccountId: identity.subject,
    // Apple returns the email ONLY on first authorization — persist it now.
    email: identity.email,
  });

  return { userId: user.id, isNewAccount: true };
}

export async function publicUser(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarSeed: users.avatarSeed,
      isBot: users.isBot,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new Error(`user ${userId} vanished`);
  return row;
}

export async function statsFor(userId: string) {
  const [row] = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);

  return {
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    draws: row?.draws ?? 0,
    streak: row?.streak ?? 0,
    bestStreak: row?.bestStreak ?? 0,
    duelsPlayed: row?.duelsPlayed ?? 0,
  };
}
