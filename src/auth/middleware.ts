import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw unauthorized('no_token', 'Sign in to continue.');
    }

    const userId = await verifyAccessToken(token);

    // A deleted account must stop working immediately, not in 15 minutes.
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      throw unauthorized('no_account', 'That account no longer exists.');
    }

    req.userId = userId;
    next();
  } catch (e) {
    next(e);
  }
}

/** Narrows the optional `userId` for handlers behind requireAuth. */
export function userIdOf(req: Request): string {
  const id = req.userId;
  if (!id) throw unauthorized();
  return id;
}
