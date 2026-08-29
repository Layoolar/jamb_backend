/**
 * SabiPass schema (PLAN §6).
 *
 * Two rules this file exists to enforce:
 *   1. `questions.correctIndex` and `questions.explanation` are never selected
 *      into a response except by the answer-submission handler.
 *   2. Timing is server-owned. `answers.servedAt` is stamped here, never by a client.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const authProvider = pgEnum('auth_provider', ['google', 'apple']);
export const questionSource = pgEnum('question_source', ['past', 'ai']);
export const questionStatus = pgEnum('question_status', [
  'draft',
  'live',
  'flagged',
  'retired',
]);
/**
 * v1 only ever writes 'plain'. The column exists so adding Maths/Physics
 * equations later is a renderer change rather than a migration (PLAN §5).
 */
export const contentFormat = pgEnum('content_format', ['plain', 'latex']);
export const matchMode = pgEnum('match_mode', ['duel', 'solo']);
export const matchStatus = pgEnum('match_status', [
  'awaiting_opponent',
  'in_progress',
  'settled',
  'expired',
]);

// ---------------------------------------------------------------- identity

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    avatarSeed: text('avatar_seed').notNull(),
    /** Stored lowercased so a plain unique index gives case-insensitive identity. */
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    /** argon2id. Null for accounts that only ever signed in with Google/Apple. */
    passwordHash: text('password_hash'),
    isBot: boolean('is_bot').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_username_key').on(t.username),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProvider('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    /** Apple returns this only on FIRST authorization — persist it immediately. */
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index('accounts_user_idx').on(t.userId),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /**
     * All tokens descended from one login share a family. Presenting an
     * already-used token means it leaked, so the whole family is revoked.
     */
    familyId: uuid('family_id').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_key').on(t.tokenHash),
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------- content

/** Subjects are rows, never hardcoded slugs — adding one is an INSERT. */
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('subjects_slug_key').on(t.slug)],
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    source: questionSource('source').notNull(),
    /** Present for past papers, null for AI-generated. */
    year: integer('year'),
    stem: text('stem').notNull(),
    /** Exactly 4 strings. Enforced by the Zod schema on every write path. */
    options: jsonb('options').notNull().$type<string[]>(),
    correctIndex: integer('correct_index').notNull(),
    explanation: text('explanation'),
    contentFormat: contentFormat('content_format').notNull().default('plain'),
    difficulty: integer('difficulty').notNull().default(2),
    topic: text('topic'),
    status: questionStatus('status').notNull().default('draft'),
    reportsCount: integer('reports_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Drives random selection: filter to live + subject, then sample.
    index('questions_pick_idx').on(t.subjectId, t.status, t.source),
  ],
);

export const questionReports = pgTable(
  'question_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One report per user per question — stops a single user flagging en masse.
    uniqueIndex('question_reports_unique').on(t.questionId, t.userId),
  ],
);

// ---------------------------------------------------------------- matches

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'restrict',
    }),
    mode: matchMode('mode').notNull(),
    /** Fixed order. Both players see the same questions in the same sequence. */
    questionIds: uuid('question_ids').array().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opponentId: uuid('opponent_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: matchStatus('status').notNull().default('awaiting_opponent'),
    winnerId: uuid('winner_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    isDraw: boolean('is_draw').notNull().default(false),
    isBotOpponent: boolean('is_bot_opponent').notNull().default(false),
    inviteCode: text('invite_code'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('matches_invite_code_key').on(t.inviteCode),
    // The quick-match pool scan: open duels, oldest first.
    index('matches_pool_idx').on(t.status, t.mode, t.subjectId, t.createdAt),
    index('matches_creator_idx').on(t.createdBy),
  ],
);

export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull().default(0),
    totalMs: integer('total_ms').notNull().default(0),
    answeredCount: integer('answered_count').notNull().default(0),
    strikes: integer('strikes').notNull().default(0),
    forfeited: boolean('forfeited').notNull().default(false),
    /** Client-reported anti-cheat signals. Logged for analysis, never auto-banned. */
    integrityFlags: jsonb('integrity_flags')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<IntegrityFlag[]>(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })],
);

export type IntegrityFlag = {
  kind: 'app_away' | 'screenshot' | 'split_screen';
  msAway?: number;
  qIndex?: number;
  at: string;
};

export const answers = pgTable(
  'answers',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    qIndex: integer('q_index').notNull(),
    selectedIndex: integer('selected_index'),
    isCorrect: boolean('is_correct'),
    points: integer('points').notNull().default(0),
    msTaken: integer('ms_taken'),
    /**
     * Set once, server-side, when the question is first served. Re-serving must
     * NOT overwrite it — that is the "kill the app for more time" exploit.
     */
    servedAt: timestamp('served_at', { withTimezone: true }).notNull(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.userId, t.questionId] }),
    index('answers_progress_idx').on(t.matchId, t.userId, t.qIndex),
  ],
);

export const userStats = pgTable('user_stats', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
  duelsPlayed: integer('duels_played').notNull().default(0),
});

// ---------------------------------------------------------------- relations

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  stats: one(userStats, {
    fields: [users.id],
    references: [userStats.userId],
  }),
}));

export const matchesRelations = relations(matches, ({ many, one }) => ({
  players: many(matchPlayers),
  subject: one(subjects, {
    fields: [matches.subjectId],
    references: [subjects.id],
  }),
}));

export const matchPlayersRelations = relations(matchPlayers, ({ one }) => ({
  match: one(matches, {
    fields: [matchPlayers.matchId],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [matchPlayers.userId],
    references: [users.id],
  }),
}));
