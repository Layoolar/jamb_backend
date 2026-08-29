import { createHash, randomInt } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { requireAuth, userIdOf } from '../auth/middleware.js';
import { verifyProviderIdToken } from '../auth/oauth.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { issueTokens, revokeAllForUser, rotateTokens } from '../auth/tokens.js';
import { db } from '../db/index.js';
import { isProd } from '../env.js';
import { accounts, passwordResets, users } from '../db/schema.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { send } from '../lib/respond.js';
import { resetEmail, sendMail } from '../services/email.js';
import { registerPushToken } from '../services/push.js';
import {
  AuthResult,
  ForgotBody,
  LoginBody,
  MeResult,
  Ok,
  OAuthBody,
  PublicUser,
  PushTokenBody,
  RefreshBody,
  ResetBody,
  SignupBody,
  TokenResult,
  UsernameBody,
} from '../schemas/index.js';
import {
  createUser,
  findByEmail,
  findOrCreateFromProvider,
  publicUser,
  statsFor,
} from '../services/users.js';

export const authRouter = Router();

/**
 * Credential endpoints are the ones worth brute-forcing, so they get limited.
 *
 * Production keeps a genuinely strict ceiling. Development raises it so the
 * smoke suite — which creates a dozen accounts per run — is not fighting the
 * control it is meant to be testing around. The production value is the one
 * that matters; do not "fix" a local 429 by lowering it.
 */
const strict = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 20 : 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 'rate_limited', message: 'Too many attempts. Try again shortly.' },
});

authRouter.post('/signup', strict, async (req, res, next) => {
  try {
    const body = SignupBody.parse(req.body);
    const user = await createUser({
      email: body.email,
      username: body.username,
      passwordHash: await hashPassword(body.password),
    });
    const tokens = await issueTokens(user.id);

    send(res, AuthResult, {
      ...tokens,
      user: await publicUser(user.id),
      isNewAccount: true,
    }, 201);
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', strict, async (req, res, next) => {
  try {
    const body = LoginBody.parse(req.body);
    const user = await findByEmail(body.email);

    // Same error either way — never reveal whether an email is registered.
    const generic = unauthorized('bad_credentials', 'Email or password is wrong.');
    if (!user?.passwordHash) throw generic;
    if (!(await verifyPassword(user.passwordHash, body.password))) throw generic;

    const tokens = await issueTokens(user.id);
    send(res, AuthResult, {
      ...tokens,
      user: await publicUser(user.id),
      isNewAccount: false,
    });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/oauth/:provider', strict, async (req, res, next) => {
  try {
    const provider = req.params.provider;
    if (provider !== 'google' && provider !== 'apple') {
      throw badRequest('unknown_provider', 'Only Google and Apple sign-in are supported.');
    }

    const body = OAuthBody.parse(req.body);
    const identity = await verifyProviderIdToken(provider, body.idToken);
    const { userId, isNewAccount } = await findOrCreateFromProvider(
      identity,
      body.username,
    );

    const tokens = await issueTokens(userId);
    send(res, AuthResult, {
      ...tokens,
      user: await publicUser(userId),
      isNewAccount,
    });
  } catch (e) {
    next(e);
  }
});

/** Attaches another provider to the account you are already signed in as. */
authRouter.post('/link/:provider', requireAuth, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const provider = req.params.provider;
    if (provider !== 'google' && provider !== 'apple') {
      throw badRequest('unknown_provider', 'Only Google and Apple sign-in are supported.');
    }

    const body = OAuthBody.parse(req.body);
    const identity = await verifyProviderIdToken(provider, body.idToken);

    const [claimed] = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(eq(accounts.providerAccountId, identity.subject))
      .limit(1);

    if (claimed && claimed.userId !== userId) {
      throw badRequest(
        'provider_already_linked',
        'That account is already linked to a different SabiPass user.',
      );
    }

    await db
      .insert(accounts)
      .values({
        userId,
        provider,
        providerAccountId: identity.subject,
        email: identity.email,
      })
      .onConflictDoNothing();

    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Lets a player replace the username derived from their email at signup.
 * Apple Sign-In returns no reliable display name, so this is the only place a
 * player ever names themselves.
 */
authRouter.post('/username', requireAuth, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const { username } = UsernameBody.parse(req.body);

    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (taken && taken.id !== userId) {
      throw conflict('username_taken', 'That username is taken. Pick another.');
    }

    await db.update(users).set({ username }).where(eq(users.id, userId));
    send(res, PublicUser, await publicUser(userId));
  } catch (e) {
    next(e);
  }
});

/**
 * Starts a password reset.
 *
 * ALWAYS answers ok, whether or not the email exists. Confirming which
 * addresses have accounts turns this endpoint into an account-enumeration
 * oracle, and the honest-looking "no account with that email" message is
 * exactly the leak.
 */
authRouter.post('/password/forgot', strict, async (req, res, next) => {
  try {
    const { email } = ForgotBody.parse(req.body);
    const user = await findByEmail(email);

    if (user) {
      // 8 digits: typeable on a phone, and rate limiting plus a 30-minute
      // single-use window makes the search space irrelevant.
      const code = String(randomInt(10_000_000, 99_999_999));

      await db.delete(passwordResets).where(eq(passwordResets.userId, user.id));
      await db.insert(passwordResets).values({
        userId: user.id,
        tokenHash: createHash('sha256').update(code).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const mail = resetEmail(code);
      await sendMail({ to: user.email, ...mail });
    }

    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/password/reset', strict, async (req, res, next) => {
  try {
    const { code, password } = ResetBody.parse(req.body);
    const tokenHash = createHash('sha256').update(code).digest('hex');

    const [row] = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, tokenHash))
      .limit(1);

    const invalid = badRequest(
      'bad_reset_code',
      'That code is wrong or has expired. Request a new one.',
    );

    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) throw invalid;

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, row.userId));

    await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.tokenHash, tokenHash));

    // A password change must end every existing session. Otherwise a reset
    // prompted by a suspected compromise leaves the intruder signed in.
    await revokeAllForUser(row.userId);

    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/push-token', requireAuth, async (req, res, next) => {
  try {
    const { token, platform } = PushTokenBody.parse(req.body);
    await registerPushToken(userIdOf(req), token, platform);
    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = RefreshBody.parse(req.body);
    send(res, TokenResult, await rotateTokens(body.refreshToken));
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await revokeAllForUser(userIdOf(req));
    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = userIdOf(req);

    const [row] = await db
      .select({ email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const linked = await db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    send(res, MeResult, {
      user: await publicUser(userId),
      email: row?.email ?? '',
      stats: await statsFor(userId),
      linkedProviders: linked.map((l) => l.provider),
      hasPassword: Boolean(row?.passwordHash),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Required by App Store Guideline 5.1.1(v) for any app that supports account
 * creation. Cascades remove matches, answers and stats.
 */
authRouter.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    await revokeAllForUser(userId);
    await db.delete(users).where(eq(users.id, userId));
    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});
