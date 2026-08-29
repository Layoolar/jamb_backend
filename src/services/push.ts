/**
 * Push via Expo's push service (PLAN §11) — no Firebase or APNs credentials to
 * manage, no per-notification cost.
 *
 * Every send is fire-and-forget: a failed notification must never fail the
 * request that triggered it. Nobody should lose a settled match because a push
 * gateway was slow.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushTokens } from '../db/schema.js';

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type Message = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function registerPushToken(
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  // A device can change hands between accounts, so the token owns the row.
  await db
    .insert(pushTokens)
    .values({ token, userId, platform })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId, platform, updatedAt: new Date() },
    });
}

export async function notify(userIds: string[], msg: Message): Promise<void> {
  if (userIds.length === 0) return;

  try {
    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, userIds));

    if (rows.length === 0) return;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        rows.map((r) => ({
          to: r.token,
          sound: 'default',
          title: msg.title,
          body: msg.body,
          data: msg.data ?? {},
        })),
      ),
    });

    if (!res.ok) return;

    // Expo reports dead tokens per-message; prune them so the table does not
    // grow into a pile of uninstalled devices.
    const payload = (await res.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };

    const dead = (payload.data ?? [])
      .map((d, i) => (d.details?.error === 'DeviceNotRegistered' ? rows[i]?.token : null))
      .filter((t): t is string => Boolean(t));

    for (const token of dead) {
      await db.delete(pushTokens).where(eq(pushTokens.token, token));
    }
  } catch {
    // Intentionally swallowed. See the note at the top of this file.
  }
}
