import { Router } from 'express';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { requireAuth, userIdOf } from '../auth/middleware.js';
import { db } from '../db/index.js';
import { matchPlayers, matches, subjects } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { send } from '../lib/respond.js';
import {
  AnswerResult,
  CreateMatchBody,
  JoinMatchBody,
  MatchResult,
  MatchSummary,
  ServedQuestion,
  SubmitAnswerBody,
} from '../schemas/index.js';
import { fillWithBot } from '../services/bot.js';
import {
  createMatch,
  getMatchResult,
  joinMatch,
  serveQuestion,
  submitAnswer,
} from '../services/match.js';
import { notifyOpponentJoined, notifySettled } from '../services/notify.js';

export const matchRouter = Router();

matchRouter.use(requireAuth);

const summarise = async (matchId: string, userId: string) => {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!m) throw notFound('no_match', 'That match does not exist.');

  const subject = m.subjectId
    ? (
        await db
          .select({ slug: subjects.slug, name: subjects.name })
          .from(subjects)
          .where(eq(subjects.id, m.subjectId))
          .limit(1)
      )[0] ?? null
    : null;

  const [me] = await db
    .select({ answeredCount: matchPlayers.answeredCount })
    .from(matchPlayers)
    .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)))
    .limit(1);

  return {
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    subject,
    inviteCode: m.inviteCode,
    totalQuestions: m.questionIds.length,
    answeredCount: me?.answeredCount ?? 0,
    expiresAt: m.expiresAt.toISOString(),
  };
};

matchRouter.post('/', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const body = CreateMatchBody.parse(req.body ?? {});
    const { match } = await createMatch(userId, body);
    send(res, MatchSummary, await summarise(match.id, userId), 201);
  } catch (e) {
    next(e);
  }
});

/**
 * Joins an open duel, or creates one when the pool is empty. Returning a created
 * match rather than an error means "Quick duel" always does something, which is
 * what makes the app usable before it has a userbase.
 */
matchRouter.post('/join', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const body = JoinMatchBody.parse(req.body ?? {});

    const joined = await joinMatch(userId, body);
    if (joined) {
      send(res, MatchSummary, await summarise(joined.id, userId));
      void notifyOpponentJoined(joined.id, userId);
      return;
    }

    const { match } = await createMatch(userId, {
      subjectSlug: body.subjectSlug,
      mode: 'duel',
    });
    send(res, MatchSummary, await summarise(match.id, userId), 201);
  } catch (e) {
    next(e);
  }
});

/** Lists the player's live and recent matches for the Home screen. */
matchRouter.get('/', async (req, res, next) => {
  try {
    const userId = userIdOf(req);

    const mine = await db
      .select({ matchId: matchPlayers.matchId })
      .from(matchPlayers)
      .where(eq(matchPlayers.userId, userId));

    const ids = mine.map((m) => m.matchId);
    if (ids.length === 0) {
      res.json({ matches: [] });
      return;
    }

    const rows = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          inArray(matches.id, ids),
          or(
            eq(matches.status, 'awaiting_opponent'),
            eq(matches.status, 'in_progress'),
            eq(matches.status, 'settled'),
          ),
        ),
      )
      .orderBy(desc(matches.createdAt))
      .limit(20);

    res.json({
      matches: await Promise.all(
        rows.map((r) => summarise(r.id, userId).then((s) => MatchSummary.parse(s))),
      ),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Serves the current question. Idempotent — reconnecting returns the same
 * question with its ORIGINAL deadline, so force-quitting buys no extra time.
 */
matchRouter.post('/:id/question', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = req.params.id as string;
    const result = await serveQuestion(userId, id);

    if ('done' in result) {
      res.status(409).json({
        code: 'match_complete',
        message: 'You have answered every question in this match.',
      });
      return;
    }

    send(res, ServedQuestion, {
      ...result,
      deadlineAt: result.deadlineAt.toISOString(),
      serverNow: result.serverNow.toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

matchRouter.post('/:id/answer', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = req.params.id as string;
    const body = SubmitAnswerBody.parse(req.body);
    const outcome = await submitAnswer(userId, id, body);

    send(res, AnswerResult, outcome);

    // After the response, and never awaited: the player should not wait on a
    // push gateway to see their own result.
    if (outcome.isFinalQuestion || outcome.forfeited) {
      void notifySettled(id);
    }
  } catch (e) {
    next(e);
  }
});

/**
 * Gives an unclaimed duel a bot opponent on demand. Offered by the waiting
 * screen so a player is never stuck watching a spinner for lack of a userbase.
 */
matchRouter.post('/:id/bot', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = req.params.id as string;

    const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
    if (!match) throw notFound('no_match', 'That match does not exist.');
    if (match.createdBy !== userId) {
      throw notFound('no_match', 'That match does not exist.');
    }

    await fillWithBot(id);
    send(res, MatchSummary, await summarise(id, userId));

    void notifySettled(id);
  } catch (e) {
    next(e);
  }
});

matchRouter.get('/:id/result', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const id = req.params.id as string;
    send(res, MatchResult, await getMatchResult(userId, id));
  } catch (e) {
    next(e);
  }
});
