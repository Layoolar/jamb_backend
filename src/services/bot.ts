/**
 * Bot opponent (PLAN §3).
 *
 * The cold-start fix: with no userbase, a created duel would sit unclaimed for
 * 24h and expire, so the app would feel dead on launch day.
 *
 * The bot is ALWAYS labelled as a bot — `users.isBot` is exposed in every
 * player payload and the UI renders it as "Bot". Presenting a bot as a real
 * opponent would be a lie about who someone is playing, and the fake-social
 * shortcut is exactly the kind of thing that destroys trust when discovered.
 */

import { and, asc, eq, inArray, isNull, lt, sql as raw } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, matchPlayers, matches, questions, users, userStats } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { BOT_FILL_AFTER_MS, pointsFor, settle } from './scoring.js';

const BOT_EMAIL = 'bot@sabipass.internal';
const BOT_USERNAME = 'Bot';

/** Accuracy by difficulty — a plausible mid-tier candidate, not an oracle. */
const ACCURACY: Record<number, number> = { 1: 0.82, 2: 0.62, 3: 0.41 };

async function ensureBotUser(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, BOT_EMAIL))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      email: BOT_EMAIL,
      username: BOT_USERNAME,
      avatarSeed: 'bot',
      isBot: true,
      // No passwordHash and no linked account, so nothing can sign in as it.
      passwordHash: null,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  if (created) {
    await db.insert(userStats).values({ userId: created.id }).onConflictDoNothing();
    return created.id;
  }

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, BOT_EMAIL))
    .limit(1);
  if (!row) throw new Error('could not create or find the bot user');
  return row.id;
}

/**
 * Attaches the bot to an open duel and plays its whole round immediately, then
 * settles if the human is already finished.
 */
export async function fillWithBot(matchId: string): Promise<void> {
  const botId = await ensureBotUser();

  await db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1)
      .for('update');

    if (!match) throw notFound('no_match', 'That match does not exist.');
    if (match.mode !== 'duel') {
      throw conflict('not_a_duel', 'Only duels can have an opponent.');
    }
    if (match.opponentId) {
      throw conflict('already_joined', 'That duel already has an opponent.');
    }

    await tx
      .update(matches)
      .set({ opponentId: botId, isBotOpponent: true, status: 'in_progress' })
      .where(eq(matches.id, matchId));

    await tx
      .insert(matchPlayers)
      .values({ matchId, userId: botId })
      .onConflictDoNothing();

    const qRows = await tx
      .select({
        id: questions.id,
        correctIndex: questions.correctIndex,
        difficulty: questions.difficulty,
      })
      .from(questions)
      // inArray, never sql`= any(${array})` — Drizzle expands a JS array into a
      // tuple ($1,...,$n), which Postgres rejects as a row expression.
      .where(inArray(questions.id, match.questionIds));

    const byId = new Map(qRows.map((q) => [q.id, q]));

    let score = 0;
    let totalMs = 0;
    const now = Date.now();

    for (const [qIndex, questionId] of match.questionIds.entries()) {
      const q = byId.get(questionId);
      if (!q) continue;

      const accuracy = ACCURACY[q.difficulty] ?? 0.6;
      const isCorrect = Math.random() < accuracy;

      // 2.5–11s: a human range. Never sub-second, which would look like a cheat.
      const msTaken = Math.round(2500 + Math.random() * 8500);
      const points = pointsFor({ isCorrect, msTaken });

      const selectedIndex = isCorrect
        ? q.correctIndex
        : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;

      const servedAt = new Date(now + qIndex * 15_000);

      await tx.insert(answers).values({
        matchId,
        userId: botId,
        questionId,
        qIndex,
        selectedIndex,
        isCorrect,
        points,
        msTaken,
        servedAt,
        deadlineAt: new Date(servedAt.getTime() + 15_000),
        answeredAt: new Date(servedAt.getTime() + msTaken),
      });

      score += points;
      totalMs += msTaken;
    }

    await tx
      .update(matchPlayers)
      .set({
        score,
        totalMs,
        answeredCount: match.questionIds.length,
        finishedAt: new Date(),
      })
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, botId)));

    // Settle only if the human already finished; otherwise their last answer will.
    const players = await tx
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, matchId));

    if (players.length === 2 && players.every((p) => p.finishedAt)) {
      const [a, b] = players;
      if (!a || !b) return;
      const result = settle(a, b);

      await tx
        .update(matches)
        .set({
          status: 'settled',
          settledAt: new Date(),
          winnerId: result.winnerId,
          isDraw: result.isDraw,
        })
        .where(eq(matches.id, matchId));

      // Stats for the human only — a bot's record is meaningless.
      const human = players.find((p) => p.userId !== botId);
      if (human) {
        const won = result.winnerId === human.userId;
        const drew = result.isDraw;
        await tx
          .insert(userStats)
          .values({
            userId: human.userId,
            wins: won ? 1 : 0,
            losses: !won && !drew ? 1 : 0,
            draws: drew ? 1 : 0,
            streak: won ? 1 : 0,
            bestStreak: won ? 1 : 0,
            duelsPlayed: 1,
          })
          .onConflictDoUpdate({
            target: userStats.userId,
            set: {
              wins: raw`${userStats.wins} + ${won ? 1 : 0}`,
              losses: raw`${userStats.losses} + ${!won && !drew ? 1 : 0}`,
              draws: raw`${userStats.draws} + ${drew ? 1 : 0}`,
              duelsPlayed: raw`${userStats.duelsPlayed} + 1`,
              streak: won ? raw`${userStats.streak} + 1` : raw`0`,
              bestStreak: won
                ? raw`greatest(${userStats.bestStreak}, ${userStats.streak} + 1)`
                : raw`${userStats.bestStreak}`,
            },
          });
      }
    }
  });
}

/**
 * Hourly sweep: any duel still unclaimed past the fill window gets a bot rather
 * than expiring, so a player who created a duel always eventually gets a result.
 */
export async function fillStaleMatches(): Promise<number> {
  const cutoff = new Date(Date.now() - BOT_FILL_AFTER_MS);

  const stale = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.status, 'awaiting_opponent'),
        eq(matches.mode, 'duel'),
        isNull(matches.opponentId),
        lt(matches.createdAt, cutoff),
        raw`${matches.expiresAt} > now()`,
      ),
    )
    .orderBy(asc(matches.createdAt))
    .limit(100);

  let filled = 0;
  for (const m of stale) {
    try {
      await fillWithBot(m.id);
      filled++;
    } catch {
      // Someone joined in the meantime. Fine — that is the better outcome.
    }
  }
  return filled;
}
