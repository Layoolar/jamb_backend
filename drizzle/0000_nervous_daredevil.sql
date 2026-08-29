CREATE TYPE "public"."auth_provider" AS ENUM('google', 'apple');--> statement-breakpoint
CREATE TYPE "public"."content_format" AS ENUM('plain', 'latex');--> statement-breakpoint
CREATE TYPE "public"."match_mode" AS ENUM('duel', 'solo');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('awaiting_opponent', 'in_progress', 'settled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."question_source" AS ENUM('past', 'ai');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('draft', 'live', 'flagged', 'retired');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"q_index" integer NOT NULL,
	"selected_index" integer,
	"is_correct" boolean,
	"points" integer DEFAULT 0 NOT NULL,
	"ms_taken" integer,
	"served_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "answers_match_id_user_id_question_id_pk" PRIMARY KEY("match_id","user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"total_ms" integer DEFAULT 0 NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"forfeited" boolean DEFAULT false NOT NULL,
	"integrity_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finished_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_players_match_id_user_id_pk" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid,
	"mode" "match_mode" NOT NULL,
	"question_ids" uuid[] NOT NULL,
	"created_by" uuid NOT NULL,
	"opponent_id" uuid,
	"status" "match_status" DEFAULT 'awaiting_opponent' NOT NULL,
	"winner_id" uuid,
	"is_draw" boolean DEFAULT false NOT NULL,
	"is_bot_opponent" boolean DEFAULT false NOT NULL,
	"invite_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"source" "question_source" NOT NULL,
	"year" integer,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text,
	"content_format" "content_format" DEFAULT 'plain' NOT NULL,
	"difficulty" integer DEFAULT 2 NOT NULL,
	"topic" text,
	"status" "question_status" DEFAULT 'draft' NOT NULL,
	"reports_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"duels_played" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"avatar_seed" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_id_users_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "answers_progress_idx" ON "answers" USING btree ("match_id","user_id","q_index");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_invite_code_key" ON "matches" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "matches_pool_idx" ON "matches" USING btree ("status","mode","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "matches_creator_idx" ON "matches" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_reports_unique" ON "question_reports" USING btree ("question_id","user_id");--> statement-breakpoint
CREATE INDEX "questions_pick_idx" ON "questions" USING btree ("subject_id","status","source");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_key" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_slug_key" ON "subjects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");