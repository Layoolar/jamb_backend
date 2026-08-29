/**
 * Match engine (PLAN §3, §6).
 *
 * Invariants this file must never break:
 *   1. `servedAt` is written exactly once per (match, player, question). Re-serving
 *      returns the ORIGINAL deadline — otherwise force-quitting mid-question
 *      grants unlimited thinking time, an exploit no screen-capture blocking
 *      touches.
 *   2. Settlement happens inside one transaction holding a row lock on the match,
 *      so two players finishing simultaneously cannot double-settle.
 *   3. The client never supplies timing. Only which option was tapped.
 */

import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, isNull, ne, sql as raw } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers,
  type IntegrityFlag,
  matchPlayers,
  matches,
  questions,
  subjects,
  userStats,
  users,
} from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import {
  MATCH_TTL_MS,
  MAX_STRIKES,
  PAST_QUESTIONS_PER_MATCH,
  QUESTIONS_PER_MATCH,
  QUESTION_MS,
  STRIKE_THRESHOLD_MS,
  pointsFor,
  settle,
  timingFor,
} from './scoring.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
};

const inviteCode = () => randomBytes(4).toString('hex').toUpperCase();

async function resolveSubject(slug?: string) {
  if (!slug) return null;
  const [row] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.slug, slug), eq(subjects.isActive, true)))
    .limit(1);
  if (!row) throw notFound('unknown_subject', `No subject called "${slug}".`);
  return row;
}

/**
 * Picks the question set. Aims for 7 past-paper + 3 AI and backfills from
 * whichever source has depth, so a thin AI bank does not block match creation.
 *
 * `pool` is the hard boundary: a duel never draws a question that practice can
 * reveal. Everything else here is a preference that degrades gracefully; this
 * one does not degrade at all.
 */
async function pickQuestionIds(
  subjectId: string | null,
  pool: 'duel' | 'practice',
): Promise<string[]> {
  const draw = async (source: 'past' | 'ai', limit: number) => {
    const rows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(
        and(
          eq(questions.status, 'live'),
          eq(questions.pool, pool),
          eq(questions.source, source),
          subjectId ? eq(questions.subjectId, subjectId) : undefined,
        ),
      )
      .orderBy(raw`random()`)
      .limit(limit);
    return rows.map((r) => r.id);
  };

  const past = await draw('past', PAST_QUESTIONS_PER_MATCH);
  const ai = await draw('ai', QUESTIONS_PER_MATCH - PAST_QUESTIONS_PER_MATCH);

  let picked = [...past, ...ai];

  if (picked.length < QUESTIONS_PER_MATCH) {
    const short = QUESTIONS_PER_MATCH - picked.length;
    const seen = new Set(picked);
    // Over-fetch, then filter, since SQL-side NOT IN with a big list is clumsy.
    const extra = [...(await draw('past', short * 4)), ...(await draw('ai', short * 4))];
    for (const id of extra) {
      if (picked.length >= QUESTIONS_PER_MATCH) break;
      if (!seen.has(id)) {
        picked.push(id);
        seen.add(id);
      }
    }
  }

  if (picked.length < QUESTIONS_PER_MATCH) {
    throw badRequest(
      'not_enough_questions',
      `Only ${picked.length} live ${pool} questions available for this subject. Need ${QUESTIONS_PER_MATCH}.`,
    );
  }

  return shuffle(picked).slice(0, QUESTIONS_PER_MATCH);
}

// -------------------------------------------------------------- create/join

/**
 * Creates a match.
 *
 * ONE OPEN DUEL AT A TIME. Without this, a player can create a duel, play it,
 * look at their score, and only share the code from a run that went well —
 * their best-of-N against an opponent's best-of-one. Worse, answer keys are
 * released as soon as YOU finish, so every discarded reroll hands out ten
 * answers with explanations, which farms the question bank.
 *
 * Holding only one open duel means getting out of a bad one costs a settled
 * match on your record (via the bot), so nothing is quietly discardable.
 * Practice mode is the free, record-neutral way to see answers.
 */
export async function createMatch(
  userId: string,
  opts: { subjectSlug?: string; mode: 'duel' | 'solo' },
) {
  if (opts.mode === 'duel') {
    const [open] = await db
      .select({ id: matches.id, inviteCode: matches.inviteCode })
      .from(matches)
      .where(
        and(
          eq(matches.createdBy, userId),
          eq(matches.mode, 'duel'),
          eq(matches.status, 'awaiting_opponent'),
          raw`${matches.expiresAt} > now()`,
        ),
      )
      .limit(1);

    if (open) {
      throw conflict(
        'duel_already_open',
        'You already have a duel waiting for an opponent. Share its code, or play it out against the bot, before starting another.',
      );
    }
  }

  const subject = await resolveSubject(opts.subjectSlug);
  const questionIds = await pickQuestionIds(
    subject?.id ?? null,
    opts.mode === 'solo' ? 'practice' : 'duel',
  );

  const [match] = await db
    .insert(matches)
    .values({
      subjectId: subject?.id ?? null,
      mode: opts.mode,
      questionIds,
      createdBy: userId,
      status: opts.mode === 'solo' ? 'in_progress' : 'awaiting_opponent',
      inviteCode: opts.mode === 'duel' ? inviteCode() : null,
      expiresAt: new Date(Date.now() + MATCH_TTL_MS),
    })
    .returning();

  if (!match) throw new Error('match insert returned nothing');

  await db.insert(matchPlayers).values({ matchId: match.id, userId });

  return { match, subject };
}

/**
 * Joins an open duel. `FOR UPDATE SKIP LOCKED` is what makes the open-match pool
 * safe under concurrency without Redis — two players racing for the same match
 * cannot both claim it, and neither blocks on the other.
 */
export async function joinMatch(
  userId: string,
  opts: { inviteCode?: string; subjectSlug?: string },
) {
  const subject = await resolveSubject(opts.subjectSlug);

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, 'awaiting_opponent'),
          eq(matches.mode, 'duel'),
          isNull(matches.opponentId),
          ne(matches.createdBy, userId),
          opts.inviteCode
            ? eq(matches.inviteCode, opts.inviteCode.toUpperCase())
            : undefined,
          !opts.inviteCode && subject ? eq(matches.subjectId, subject.id) : undefined,
          raw`${matches.expiresAt} > now()`,
        ),
      )
      .orderBy(asc(matches.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });

    const match = candidates[0];

    if (!match) {
      if (opts.inviteCode) {
        throw notFound(
          'no_such_duel',
          'That code is not an open duel. It may have been taken already or expired.',
        );
      }
      return null; // Caller creates a fresh match instead.
    }

    const [updated] = await tx
      .update(matches)
      .set({ opponentId: userId, status: 'in_progress' })
      .where(eq(matches.id, match.id))
      .returning();

    await tx.insert(matchPlayers).values({ matchId: match.id, userId });

    return updated ?? match;
  });
}

// -------------------------------------------------------------------- serve

/** The one duel this player currently has waiting for an opponent, if any. */
export async function findMyOpenDuel(userId: string) {
  const [open] = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.createdBy, userId),
        eq(matches.mode, 'duel'),
        eq(matches.status, 'awaiting_opponent'),
        raw`${matches.expiresAt} > now()`,
      ),
    )
    .limit(1);
  return open ?? null;
}

export type ServedQuestionData = {
  qIndex: number;
  totalQuestions: number;
  questionId: string;
  stem: string;
  options: string[];
  contentFormat: 'plain' | 'latex';
  subject: string;
  year: number | null;
  deadlineAt: Date;
  serverNow: Date;
};

/**
 * Serves the player's current question, creating the timing row on first call.
 *
 * Idempotent by design: if an unanswered row already exists we return it with
 * its original deadline. This is invariant 1 and the subtlest bug in the app.
 */
export async function serveQuestion(
  userId: string,
  matchId: string,
): Promise<ServedQuestionData | { done: true }> {
  return db.transaction(async (tx) => {
    const match = await loadPlayableMatch(tx, matchId, userId);

    const existing = await tx
      .select()
      .from(answers)
      .where(
        and(
          eq(answers.matchId, matchId),
          eq(answers.userId, userId),
          isNull(answers.answeredAt),
        ),
      )
      .orderBy(asc(answers.qIndex))
      .limit(1);

    const open = existing[0];
    if (open) {
      return hydrate(tx, match, open.qIndex, open.questionId, open.deadlineAt);
    }

    const served = await tx
      .select({ n: raw<number>`count(*)::int` })
      .from(answers)
      .where(and(eq(answers.matchId, matchId), eq(answers.userId, userId)));

    const qIndex = served[0]?.n ?? 0;
    if (qIndex >= match.questionIds.length) return { done: true } as const;

    const questionId = match.questionIds[qIndex];
    if (!questionId) return { done: true } as const;

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + QUESTION_MS);

    await tx.insert(answers).values({
      matchId,
      userId,
      questionId,
      qIndex,
      servedAt: now,
      deadlineAt,
    });

    return hydrate(tx, match, qIndex, questionId, deadlineAt);
  });
}

async function hydrate(
  tx: Tx,
  match: { questionIds: string[] },
  qIndex: number,
  questionId: string,
  deadlineAt: Date,
): Promise<ServedQuestionData> {
  const [q] = await tx
    .select({
      stem: questions.stem,
      options: questions.options,
      contentFormat: questions.contentFormat,
      year: questions.year,
      subjectName: subjects.name,
    })
    .from(questions)
    .innerJoin(subjects, eq(subjects.id, questions.subjectId))
    .where(eq(questions.id, questionId))
    .limit(1);

  if (!q) throw notFound('question_missing', 'That question is no longer available.');

  return {
    qIndex,
    totalQuestions: match.questionIds.length,
    questionId,
    stem: q.stem,
    options: q.options,
    contentFormat: q.contentFormat,
    subject: q.subjectName,
    year: q.year,
    deadlineAt,
    serverNow: new Date(),
  };
}

async function loadPlayableMatch(tx: Tx, matchId: string, userId: string) {
  const [match] = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) throw notFound('no_match', 'That match does not exist.');

  if (match.createdBy !== userId && match.opponentId !== userId) {
    throw notFound('no_match', 'That match does not exist.');
  }

  if (match.status === 'expired') {
    throw conflict('match_expired', 'That duel expired before it was finished.');
  }

  const [me] = await tx
    .select()
    .from(matchPlayers)
    .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)))
    .limit(1);

  if (!me) throw notFound('not_in_match', 'You are not part of that match.');
  if (me.forfeited) {
    throw conflict('forfeited', 'You forfeited this match by leaving the app.');
  }
  if (me.finishedAt) {
    throw conflict('already_finished', 'You have already finished this match.');
  }

  return match;
}

// ------------------------------------------------------------------- answer

export type AnswerOutcome = {
  /** False for a duel in progress — every field below it is then null. */
  revealed: boolean;
  isCorrect: boolean | null;
  correctIndex: number | null;
  explanation: string | null;
  points: number | null;
  runningScore: number | null;
  msTaken: number;
  wasLate: boolean;
  qIndex: number;
  isFinalQuestion: boolean;
  strikes: number;
  forfeited: boolean;
};

export async function submitAnswer(
  userId: string,
  matchId: string,
  input: {
    questionId: string;
    selectedIndex: number | null;
    flags: { kind: IntegrityFlag['kind']; msAway?: number }[];
  },
): Promise<AnswerOutcome> {
  return db.transaction(async (tx) => {
    // Lock the match row first: settlement later in this transaction depends on
    // no other player mutating it concurrently (invariant 2).
    const [match] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1)
      .for('update');

    if (!match) throw notFound('no_match', 'That match does not exist.');
    if (match.createdBy !== userId && match.opponentId !== userId) {
      throw notFound('no_match', 'That match does not exist.');
    }

    const [row] = await tx
      .select()
      .from(answers)
      .where(
        and(
          eq(answers.matchId, matchId),
          eq(answers.userId, userId),
          eq(answers.questionId, input.questionId),
        ),
      )
      .limit(1);

    if (!row) {
      throw badRequest(
        'not_served',
        'That question was not served to you. Reload the match.',
      );
    }
    if (row.answeredAt) {
      throw conflict('already_answered', 'You already answered that question.');
    }

    const [player] = await tx
      .select()
      .from(matchPlayers)
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)))
      .limit(1);

    if (!player) throw notFound('not_in_match', 'You are not part of that match.');

    const [q] = await tx
      .select({
        correctIndex: questions.correctIndex,
        explanation: questions.explanation,
      })
      .from(questions)
      .where(eq(questions.id, input.questionId))
      .limit(1);

    if (!q) throw notFound('question_missing', 'That question is no longer available.');

    const now = new Date();
    const { msTaken, wasLate } = timingFor(row.servedAt, row.deadlineAt, now);

    // Strikes come from client-reported app-away events. They can only ever
    // hurt the reporter, so a hostile client gains nothing by lying.
    const newFlags: IntegrityFlag[] = input.flags.map((f) => ({
      kind: f.kind,
      msAway: f.msAway,
      qIndex: row.qIndex,
      at: now.toISOString(),
    }));
    const gainedStrikes = input.flags.filter(
      (f) => f.kind === 'app_away' && (f.msAway ?? 0) > STRIKE_THRESHOLD_MS,
    ).length;

    const strikes = player.strikes + gainedStrikes;
    const forfeited = player.forfeited || strikes >= MAX_STRIKES;

    // A late answer, a strike on this question, or a forfeit all score zero.
    const scored = !wasLate && gainedStrikes === 0 && !forfeited;
    const isCorrect = input.selectedIndex !== null && input.selectedIndex === q.correctIndex;
    const points = scored ? pointsFor({ isCorrect, msTaken }) : 0;

    await tx
      .update(answers)
      .set({
        selectedIndex: input.selectedIndex,
        isCorrect,
        points,
        msTaken,
        answeredAt: now,
      })
      .where(
        and(
          eq(answers.matchId, matchId),
          eq(answers.userId, userId),
          eq(answers.questionId, input.questionId),
        ),
      );

    const answeredCount = player.answeredCount + 1;
    const isFinalQuestion = answeredCount >= match.questionIds.length;
    const finished = isFinalQuestion || forfeited;

    const [updatedPlayer] = await tx
      .update(matchPlayers)
      .set({
        score: player.score + points,
        totalMs: player.totalMs + msTaken,
        answeredCount,
        strikes,
        forfeited,
        integrityFlags: [...player.integrityFlags, ...newFlags],
        finishedAt: finished ? now : null,
      })
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)))
      .returning();

    if (finished) {
      await maybeSettle(tx, matchId);
    }

    // A duel reveals nothing until it settles. Scoring above is unaffected —
    // the server knows the answer, the player simply is not told yet.
    const reveal = match.mode === 'solo';

    return {
      revealed: reveal,
      isCorrect: reveal ? isCorrect : null,
      correctIndex: reveal ? q.correctIndex : null,
      explanation: reveal ? q.explanation : null,
      points: reveal ? points : null,
      runningScore: reveal ? (updatedPlayer?.score ?? player.score + points) : null,
      msTaken,
      wasLate,
      qIndex: row.qIndex,
      isFinalQuestion,
      strikes,
      forfeited,
    };
  });
}

/**
 * Settles once every participant has finished. Solo matches settle on the single
 * player; duels wait for both. Called with the match row already locked.
 */
async function maybeSettle(tx: Tx, matchId: string): Promise<void> {
  const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match || match.status === 'settled') return;

  const players = await tx
    .select()
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, matchId));

  const expected = match.mode === 'solo' ? 1 : 2;
  if (players.length < expected) return;
  if (players.some((p) => !p.finishedAt)) return;

  if (match.mode === 'solo') {
    await tx
      .update(matches)
      .set({ status: 'settled', settledAt: new Date() })
      .where(eq(matches.id, matchId));
    return;
  }

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

  for (const p of players) {
    const won = result.winnerId === p.userId;
    const drew = result.isDraw;

    await tx
      .insert(userStats)
      .values({
        userId: p.userId,
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

// ------------------------------------------------------------------- result

export async function getMatchResult(userId: string, matchId: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) throw notFound('no_match', 'That match does not exist.');
  if (match.createdBy !== userId && match.opponentId !== userId) {
    throw notFound('no_match', 'That match does not exist.');
  }

  const subject = match.subjectId
    ? (
        await db
          .select({ slug: subjects.slug, name: subjects.name })
          .from(subjects)
          .where(eq(subjects.id, match.subjectId))
          .limit(1)
      )[0] ?? null
    : null;

  const players = await db
    .select({
      userId: matchPlayers.userId,
      score: matchPlayers.score,
      totalMs: matchPlayers.totalMs,
      answeredCount: matchPlayers.answeredCount,
      forfeited: matchPlayers.forfeited,
      finishedAt: matchPlayers.finishedAt,
      username: users.username,
      avatarSeed: users.avatarSeed,
      isBot: users.isBot,
    })
    .from(matchPlayers)
    .innerJoin(users, eq(users.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, matchId));

  const mine = players.find((p) => p.userId === userId);
  const theirs = players.find((p) => p.userId !== userId) ?? null;
  if (!mine) throw notFound('not_in_match', 'You are not part of that match.');

  /**
   * Nothing about a DUEL is revealed until it settles — not your own score, not
   * the answer keys.
   *
   * This is what makes the challenge honest. If you could see your score before
   * an opponent committed, you could judge the run and decide whether it was
   * worth sharing, and the answer keys would leak on every abandoned attempt.
   * Practice reveals as soon as you finish; there is no opponent to be fair to.
   */
  const youFinished = mine.finishedAt !== null;
  const revealed =
    match.mode === 'solo' ? youFinished : match.status === 'settled';

  const line = (p: (typeof players)[number]) => ({
    user: {
      id: p.userId,
      username: p.username,
      avatarSeed: p.avatarSeed,
      isBot: p.isBot,
    },
    score: revealed ? p.score : null,
    totalMs: revealed ? p.totalMs : null,
    // Progress is safe to show — it says how far along someone is, not how well.
    answeredCount: p.answeredCount,
    forfeited: p.forfeited,
    finished: p.finishedAt !== null,
  });

  const allAnswers = revealed
    ? await db
        .select()
        .from(answers)
        .where(eq(answers.matchId, matchId))
        .orderBy(asc(answers.qIndex))
    : [];

  const qRows = revealed
    ? await db
        .select({
          id: questions.id,
          stem: questions.stem,
          options: questions.options,
          correctIndex: questions.correctIndex,
          explanation: questions.explanation,
        })
        .from(questions)
        .where(inArray(questions.id, match.questionIds))
    : [];

  const byId = new Map(qRows.map((q) => [q.id, q]));

  const shape = (a: (typeof allAnswers)[number] | undefined) =>
    a
      ? {
          selectedIndex: a.selectedIndex,
          isCorrect: a.isCorrect,
          msTaken: a.msTaken,
          points: a.points,
        }
      : null;

  // Once revealed, a duel is settled and a practice round is finished, so both
  // sides are complete — there is no longer a half-finished case to guard.
  const questionLines = revealed
    ? match.questionIds.map((qid, i) => {
        const q = byId.get(qid);
        return {
          qIndex: i,
          stem: q?.stem ?? '',
          options: q?.options ?? [],
          correctIndex: q?.correctIndex ?? -1,
          explanation: q?.explanation ?? null,
          yours: shape(allAnswers.find((a) => a.questionId === qid && a.userId === userId)),
          theirs: shape(
            allAnswers.find((a) => a.questionId === qid && a.userId !== userId),
          ),
        };
      })
    : [];

  return {
    matchId: match.id,
    status: match.status,
    mode: match.mode,
    totalQuestions: match.questionIds.length,
    // Only the creator can invite, and only while the duel is still open.
    inviteCode:
      match.status === 'awaiting_opponent' && match.createdBy === userId
        ? match.inviteCode
        : null,
    subject,
    isDraw: match.isDraw,
    isBotOpponent: match.isBotOpponent,
    winnerId: match.winnerId,
    revealed,
    you: line(mine),
    opponent: theirs ? line(theirs) : null,
    questions: questionLines,
  };
}
