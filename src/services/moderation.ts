/**
 * Blocking and reporting (App Store 1.2).
 *
 * A block is only worth having if it changes matchmaking, so `blockedPairSql`
 * below is the load-bearing part of this file — see its use in `joinMatch`.
 * A block that merely hides a name still hands the same person to you next
 * round, which is the complaint Apple's guideline exists to prevent.
 */

import { and, desc, eq, sql as raw } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userBlocks, userReports, users } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

/** Blocking is symmetric for matchmaking: either direction keeps the pair apart. */
export const blockedPairSql = (a: string, b: unknown) => raw`
  not exists (
    select 1 from ${userBlocks}
    where (${userBlocks.blockerId} = ${a} and ${userBlocks.blockedId} = ${b})
       or (${userBlocks.blockerId} = ${b} and ${userBlocks.blockedId} = ${a})
  )
`;

async function requireRealUser(userId: string) {
  const [row] = await db
    .select({ id: users.id, username: users.username, isBot: users.isBot })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) throw notFound('no_user', 'That account no longer exists.');
  // Blocking the bot would silently empty the pool for players with no partner.
  if (row.isBot) throw badRequest('cannot_block_bot', 'That is a practice bot.');
  return row;
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw badRequest('cannot_block_self', 'You cannot block yourself.');
  }
  await requireRealUser(blockedId);

  await db
    .insert(userBlocks)
    .values({ blockerId, blockedId })
    .onConflictDoNothing();
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await db
    .delete(userBlocks)
    .where(
      and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)),
    );
}

export async function listBlocked(blockerId: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      avatarSeed: users.avatarSeed,
      isBot: users.isBot,
    })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, blockerId))
    .orderBy(desc(userBlocks.createdAt));
}

/**
 * Files a report and blocks in the same breath.
 *
 * Reporting someone you must then separately block is a design that produces
 * reports and no relief, so the block is not optional here.
 */
export async function reportUser(input: {
  reporterId: string;
  reportedId: string;
  matchId?: string | null;
  reason: 'offensive_username' | 'harassment' | 'cheating' | 'other';
  detail?: string | null;
}) {
  if (input.reporterId === input.reportedId) {
    throw badRequest('cannot_report_self', 'You cannot report yourself.');
  }
  const reported = await requireRealUser(input.reportedId);

  const inserted = await db
    .insert(userReports)
    .values({
      reporterId: input.reporterId,
      reportedId: input.reportedId,
      matchId: input.matchId ?? null,
      reason: input.reason,
      detail: input.detail ?? null,
      reportedUsername: reported.username,
    })
    .onConflictDoNothing()
    .returning({ id: userReports.id });

  if (inserted.length === 0) {
    throw conflict('already_reported', 'You already reported that player.');
  }

  // Reporting implies not wanting to meet them again.
  await blockUser(input.reporterId, input.reportedId);
}
