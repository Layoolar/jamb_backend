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

export const UsernameBody = z.object({
  username: Username,
});

export const ForgotBody = z.object({
  email: Email,
});

export const ResetBody = z.object({
  code: z.string().trim().min(4).max(32),
  password: Password,
});

/**
 * `currentPassword` is required only when the account already has one. An
 * account created through Google or Apple has no password yet, so this is also
 * how such a user sets their first one.
 */
export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: Password,
});

export const PushTokenBody = z.object({
  token: z.string().min(10).max(256),
  platform: z.enum(['ios', 'android']),
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
 *
 * In a DUEL every reveal field is null: you find out nothing until the match
 * settles. Telling a player they got question 7 right lets them count their own
 * hits and infer their score, which is the same information the score itself
 * carries — so hiding only the number would be cosmetic.
 *
 * In PRACTICE everything is revealed immediately. That is the difference
 * between the two modes: a duel is an exam, practice is a lesson.
 */
export const AnswerResult = z.object({
  /** False for a duel in progress; true for practice. */
  revealed: z.boolean(),
  isCorrect: z.boolean().nullable(),
  correctIndex: z.number().int().nullable(),
  explanation: z.string().nullable(),
  points: z.number().int().nullable(),
  runningScore: z.number().int().nullable(),
  /** Always returned — it is your own timing, and it reveals nothing. */
  msTaken: z.number().int(),
  wasLate: z.boolean(),
  qIndex: z.number().int(),
  isFinalQuestion: z.boolean(),
  strikes: z.number().int(),
  forfeited: z.boolean(),
});

export const PlayerLine = z.object({
  user: PublicUser,
  /** Null until the match settles — see MatchResult.revealed. */
  score: z.number().int().nullable(),
  totalMs: z.number().int().nullable(),
  answeredCount: z.number().int(),
  forfeited: z.boolean(),
  finished: z.boolean(),
});

export const MatchResult = z.object({
  matchId: Uuid,
  status: z.enum(['awaiting_opponent', 'in_progress', 'settled', 'expired']),
  mode: z.enum(['duel', 'solo']),
  /** Present while a duel is still open, so the creator can share it. */
  inviteCode: z.string().nullable(),
  subject: z.object({ slug: z.string(), name: z.string() }).nullable(),
  isDraw: z.boolean(),
  isBotOpponent: z.boolean(),
  winnerId: Uuid.nullable(),
  /**
   * True once scores and answer keys may be shown: a settled duel, or a
   * finished practice round. While false, scores are null and `questions` is
   * empty — nobody learns anything about a duel before it has a verdict.
   */
  revealed: z.boolean(),
  you: PlayerLine,
  opponent: PlayerLine.nullable(),
  /** Empty until `revealed`. Answer keys are safe here — the match is over. */
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
    z.object({
      slug: z.string(),
      name: z.string(),
      /** Counts are per-pool: a subject can be playable in one mode and not the other. */
      duelQuestions: z.number().int(),
      practiceQuestions: z.number().int(),
    }),
  ),
});

export const ReportBody = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const Ok = z.object({ ok: z.literal(true) });
