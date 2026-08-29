/**
 * Match notifications. Kept out of the match transaction on purpose — a slow
 * push gateway must not hold a database lock, and a failed send must not fail
 * the answer that triggered it.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matchPlayers, matches, users } from '../db/schema.js';
import { notify } from './push.js';

/** Sent to both players once a duel settles. */
export async function notifySettled(matchId: string): Promise<void> {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match || match.status !== 'settled' || match.mode !== 'duel') return;

  const players = await db
    .select({
      userId: matchPlayers.userId,
      score: matchPlayers.score,
      isBot: users.isBot,
      username: users.username,
    })
    .from(matchPlayers)
    .innerJoin(users, eq(users.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, matchId));

  for (const p of players) {
    if (p.isBot) continue;

    const them = players.find((o) => o.userId !== p.userId);
    const won = match.winnerId === p.userId;

    const title = match.isDraw ? 'Dead heat' : won ? 'You won' : 'You lost';
    const body = them
      ? `${p.score} – ${them.score} against ${them.isBot ? 'Bot' : them.username}. Tap to see the review.`
      : 'Tap to see the review.';

    await notify([p.userId], { title, body, data: { matchId, kind: 'settled' } });
  }
}

/**
 * Sent to the creator when someone claims their open duel, so a duel that sat
 * waiting does not need the app open to be noticed.
 */
export async function notifyOpponentJoined(
  matchId: string,
  joinerId: string,
): Promise<void> {
  const [match] = await db
    .select({ createdBy: matches.createdBy })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match || match.createdBy === joinerId) return;

  const [joiner] = await db
    .select({ username: users.username, isBot: users.isBot })
    .from(users)
    .where(eq(users.id, joinerId))
    .limit(1);

  await notify([match.createdBy], {
    title: 'Your duel was accepted',
    body: `${joiner?.isBot ? 'Bot' : (joiner?.username ?? 'Someone')} is playing your questions now.`,
    data: { matchId, kind: 'joined' },
  });
}
