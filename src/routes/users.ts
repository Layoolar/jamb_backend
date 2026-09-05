/**
 * Player moderation endpoints (App Store 1.2).
 *
 * Deliberately quiet: none of these tell the target anything. A block that
 * notifies the person blocked is a block nobody being harassed will use.
 */

import { Router } from 'express';
import { requireAuth, userIdOf } from '../auth/middleware.js';
import {
  blockUser,
  listBlocked,
  reportUser,
  unblockUser,
} from '../services/moderation.js';
import { send } from '../lib/respond.js';
import { BlockedList, Ok, ReportUserBody, Uuid } from '../schemas/index.js';

export const userRouter = Router();

userRouter.get('/blocked', requireAuth, async (req, res, next) => {
  try {
    send(res, BlockedList, { blocked: await listBlocked(userIdOf(req)) });
  } catch (e) {
    next(e);
  }
});

userRouter.post('/:id/block', requireAuth, async (req, res, next) => {
  try {
    await blockUser(userIdOf(req), Uuid.parse(req.params.id));
    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});

userRouter.delete('/:id/block', requireAuth, async (req, res, next) => {
  try {
    await unblockUser(userIdOf(req), Uuid.parse(req.params.id));
    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});

userRouter.post('/:id/report', requireAuth, async (req, res, next) => {
  try {
    const body = ReportUserBody.parse(req.body);
    await reportUser({
      reporterId: userIdOf(req),
      reportedId: Uuid.parse(req.params.id),
      matchId: body.matchId ?? null,
      reason: body.reason,
      detail: body.detail ?? null,
    });
    send(res, Ok, { ok: true });
  } catch (e) {
    next(e);
  }
});
