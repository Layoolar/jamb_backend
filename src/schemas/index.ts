import { z } from 'zod';

// ------------------------------------------------------------------ shared

export const Uuid = z.string().uuid();

export const PublicUser = z.object({
  id: Uuid,
  username: z.string(),
  avatarSeed: z.string(),
  isBot: z.boolean(),
});

export const Stats = z.object({
  wins: z.number().int(),
  losses: z.number().int(),
  draws: z.number().int(),
  streak: z.number().int(),
  bestStreak: z.number().int(),
  duelsPlayed: z.number().int(),
});

// -------------------------------------------------------------------- auth

/**
 * 10 chars minimum with no composition rules. Length beats character classes,
 * and "must contain a symbol" mainly produces Password1! on a phone keyboard.
 */
const Password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.');

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email('Enter a valid email address.'));

const Username = z
  .string()
  .trim()
  .min(3, 'Pick at least 3 characters.')
  .max(18, 'Keep it under 18 characters.')
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'Letters, numbers and underscores only.',
  );

export const SignupBody = z.object({
  email: Email,
  password: Password,
  username: Username.optional(),
});

export const LoginBody = z.object({
  email: Email,
  password: z.string().min(1, 'Enter your password.'),
});

export const OAuthBody = z.object({
  idToken: z.string().min(1),
  /** Only used when creating a brand-new account. */
  username: Username.optional(),
});

export const RefreshBody = z.object({
  refreshToken: z.string().min(1),
});

export const AuthResult = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: PublicUser,
  isNewAccount: z.boolean(),
});

export const TokenResult = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});

export const MeResult = z.object({
  user: PublicUser,
  email: z.string(),
  stats: Stats,
  linkedProviders: z.array(z.enum(['google', 'apple'])),
  hasPassword: z.boolean(),
});

// ------------------------------------------------------------------ matches

export const CreateMatchBody = z.object({
  /** Omit for a mixed-subject match. */
  subjectSlug: z.string().min(1).optional(),
  mode: z.enum(['duel', 'solo']).default('duel'),
});

export const JoinMatchBody = z.object({
  /** Omit to be matched from the open pool. */
  inviteCode: z.string().min(4).max(12).optional(),
  subjectSlug: z.string().min(1).optional(),
});

export const IntegrityFlagInput = z.object({
  kind: z.enum(['app_away', 'screenshot', 'split_screen']),
  msAway: z.number().int().nonnegative().optional(),
});

export const SubmitAnswerBody = z.object({
  questionId: Uuid,
  /** Null means the client let the timer run out. */
  selectedIndex: z.number().int().min(0).max(3).nullable(),
  flags: z.array(IntegrityFlagInput).max(20).default([]),
});

export const MatchSummary = z.object({
  matchId: Uuid,
  mode: z.enum(['duel', 'solo']),
  status: z.enum(['awaiting_opponent', 'in_progress', 'settled', 'expired']),
  subject: z.object({ slug: z.string(), name: z.string() }).nullable(),
  inviteCode: z.string().nullable(),
  totalQuestions: z.number().int(),
  answeredCount: z.number().int(),
  expiresAt: z.string(),
});

/**
 * What the client gets to see of a question.
 *
 * Note what is absent: correctIndex and explanation. This omission is the
 * enforcement — see lib/respond.ts.
 */
export const ServedQuestion = z.object({
  qIndex: z.number().int(),
  totalQuestions: z.number().int(),
  questionId: Uuid,
  stem: z.string(),
  options: z.array(z.string()).length(4),
  contentFormat: z.enum(['plain', 'latex']),
  subject: z.string(),
  year: z.number().int().nullable(),
  deadlineAt: z.string(),
  serverNow: z.string(),
});

/**
 * The ONLY response schema in this codebase containing correctIndex.
 * It is reachable exclusively from the answer-submission handler, after the
 * server has recorded a decision for that question.
 */
export const AnswerResult = z.object({
  isCorrect: z.boolean(),
  correctIndex: z.number().int(),
  explanation: z.string().nullable(),
  points: z.number().int(),
  runningScore: z.number().int(),
  msTaken: z.number().int(),
  wasLate: z.boolean(),
  qIndex: z.number().int(),
  isFinalQuestion: z.boolean(),
  strikes: z.number().int(),
  forfeited: z.boolean(),
});

export const PlayerLine = z.object({
  user: PublicUser,
  score: z.number().int(),
  totalMs: z.number().int(),
  answeredCount: z.number().int(),
  forfeited: z.boolean(),
  finished: z.boolean(),
});

export const MatchResult = z.object({
  matchId: Uuid,
  status: z.enum(['awaiting_opponent', 'in_progress', 'settled', 'expired']),
  subject: z.object({ slug: z.string(), name: z.string() }).nullable(),
  isDraw: z.boolean(),
  isBotOpponent: z.boolean(),
  winnerId: Uuid.nullable(),
  you: PlayerLine,
  opponent: PlayerLine.nullable(),
  /** Per-question comparison. Answer keys are safe here — the match is over. */
  questions: z.array(
    z.object({
      qIndex: z.number().int(),
      stem: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number().int(),
      explanation: z.string().nullable(),
      yours: z
        .object({
          selectedIndex: z.number().int().nullable(),
          isCorrect: z.boolean().nullable(),
          msTaken: z.number().int().nullable(),
          points: z.number().int(),
        })
        .nullable(),
      theirs: z
        .object({
          selectedIndex: z.number().int().nullable(),
          isCorrect: z.boolean().nullable(),
          msTaken: z.number().int().nullable(),
          points: z.number().int(),
        })
        .nullable(),
    }),
  ),
});

export const SubjectList = z.object({
  subjects: z.array(
    z.object({ slug: z.string(), name: z.string(), liveQuestions: z.number().int() }),
  ),
});

export const ReportBody = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const Ok = z.object({ ok: z.literal(true) });
