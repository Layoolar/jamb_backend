import { Router } from 'express';
import { and, eq, sql as raw } from 'drizzle-orm';
import { requireAuth, userIdOf } from '../auth/middleware.js';
import { db } from '../db/index.js';
import { questionReports, questions, subjects } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { send } from '../lib/respond.js';
import { Ok, ReportBody, SubjectList } from '../schemas/index.js';

export const contentRouter = Router();

/** Live question counts per subject — lets the app hide a subject with a thin bank. */
contentRouter.get('/subjects', async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        slug: subjects.slug,
        name: subjects.name,
        liveQuestions: raw<number>`count(${questions.id})::int`,
      })
      .from(subjects)
      .leftJoin(
        questions,
        and(eq(questions.subjectId, subjects.id), eq(questions.status, 'live')),
      )
      .where(eq(subjects.isActive, true))
      .groupBy(subjects.id, subjects.slug, subjects.name, subjects.sortOrder)
      .orderBy(subjects.sortOrder);

    send(res, SubjectList, { subjects: rows });
  } catch (e) {
    next(e);
  }
});

/**
 * Player-reported bad questions. Three reports auto-flags for review — this is
 * how you find the wrong answer keys you shipped (PLAN §5).
 */
contentRouter.post('/questions/:id/report', requireAuth, async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const questionId = req.params.id as string;
    const body = ReportBody.parse(req.body);

    const [q] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);

    if (!q) throw notFound('no_question', 'That question does not exist.');

    const inserted = await db
      .insert(questionReports)
      .values({ questionId, userId, reason: body.reason })
      .onConflictDoNothing()
      .returning({ id: questionReports.id });

    if (inserted.length === 0) {
      throw conflict('already_reported', 'You already reported that question.');
    }

    const [updated] = await db
      .update(questions)
      .set({ reportsCount: raw`${questions.reportsCount} + 1` })
      .where(eq(questions.id, questionId))
      .returning({ reportsCount: questions.reportsCount, status: questions.status });

    // Auto-retire from circulation at 3 reports, pending human review.
    if (updated && updated.reportsCount >= 3 && updated.status === 'live') {
      await db
        .update(questions)
        .set({ status: 'flagged' })
        .where(eq(questions.id, questionId));
    }

    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});
