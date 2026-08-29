/**
 * Scoring and timing rules (PLAN §3).
 *
 * All of it is server-side by construction: the client never reports elapsed
 * time, it only says which option was tapped. `servedAt` and `deadlineAt` come
 * from the database.
 */

export const QUESTION_MS = 15_000;

/**
 * Leniency for slow uploads. Nigerian mobile data makes a 600ms round-trip
 * normal, and scoring a real answer as a timeout because of the network is
 * worse than allowing 1.5s of slack.
 */
export const DEADLINE_GRACE_MS = 1_500;

export const QUESTIONS_PER_MATCH = 10;

/** Roughly 70/30 past-paper to AI, per PLAN §1. */
export const PAST_QUESTIONS_PER_MATCH = 7;

export const STRIKE_THRESHOLD_MS = 2_000;
export const MAX_STRIKES = 2;

export const MATCH_TTL_MS = 24 * 60 * 60 * 1000;
/** After this, an unclaimed duel is offered a labelled bot opponent. */
export const BOT_FILL_AFTER_MS = 12 * 60 * 60 * 1000;

export type ScoreInput = {
  isCorrect: boolean;
  /** Wall-clock ms from serve to answer. */
  msTaken: number;
};

/**
 * 100 for a correct answer plus up to 100 for speed, so a perfect fast round is
 * 2000. Wrong answers score 0 with no negative marking — punishing guesses adds
 * no signal and makes the game feel hostile.
 */
export function pointsFor({ isCorrect, msTaken }: ScoreInput): number {
  if (!isCorrect) return 0;
  const remaining = Math.max(0, QUESTION_MS - msTaken);
  return 100 + Math.round(remaining / 150);
}

export type Timing = {
  msTaken: number;
  /** Past the deadline plus grace — scored 0 regardless of the option chosen. */
  wasLate: boolean;
};

export function timingFor(servedAt: Date, deadlineAt: Date, now: Date): Timing {
  const msTaken = Math.max(0, now.getTime() - servedAt.getTime());
  const wasLate = now.getTime() > deadlineAt.getTime() + DEADLINE_GRACE_MS;
  return { msTaken, wasLate };
}

export type Settlement =
  | { winnerId: string; isDraw: false }
  | { winnerId: null; isDraw: true };

/**
 * Higher score wins; ties break on total time; a genuine tie is a draw.
 * A forfeit loses outright regardless of score.
 */
export function settle(
  a: { userId: string; score: number; totalMs: number; forfeited: boolean },
  b: { userId: string; score: number; totalMs: number; forfeited: boolean },
): Settlement {
  if (a.forfeited && !b.forfeited) return { winnerId: b.userId, isDraw: false };
  if (b.forfeited && !a.forfeited) return { winnerId: a.userId, isDraw: false };
  if (a.forfeited && b.forfeited) return { winnerId: null, isDraw: true };

  if (a.score !== b.score) {
    return { winnerId: a.score > b.score ? a.userId : b.userId, isDraw: false };
  }
  if (a.totalMs !== b.totalMs) {
    return { winnerId: a.totalMs < b.totalMs ? a.userId : b.userId, isDraw: false };
  }
  return { winnerId: null, isDraw: true };
}
