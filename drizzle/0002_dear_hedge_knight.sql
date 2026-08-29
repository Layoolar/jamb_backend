CREATE TYPE "public"."question_pool" AS ENUM('duel', 'practice');--> statement-breakpoint
DROP INDEX "questions_pick_idx";--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "pool" "question_pool" DEFAULT 'practice' NOT NULL;--> statement-breakpoint
CREATE INDEX "questions_pick_idx" ON "questions" USING btree ("subject_id","status","pool","source");