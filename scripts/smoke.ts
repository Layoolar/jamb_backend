/**
 * Phase 2 exit gate, as an executable test (BUILD.md Phase 2).
 *
 * Asserts, against a running server:
 *   - two players complete the same match and it settles with a correct winner
 *   - a served question NEVER carries correctIndex or explanation
 *   - re-serving returns the ORIGINAL deadline (no extra thinking time)
 *   - an answer past the deadline + grace scores 0
 *   - the same question cannot be answered twice
 *
 * Usage:  npm run dev   (in another shell)
 *         npx tsx scripts/smoke.ts
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray, sql as raw } from 'drizzle-orm';
import { db, sql as pg } from '../src/db/index.js';
import { matches, passwordResets, questions, users } from '../src/db/schema.js';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4000';

/**
 * The API deliberately will not tell a client the answer before it commits, so
 * the test reads the key straight from the database. That the test needs a
 * back channel at all is the protection working.
 */
async function keyFor(questionId: string): Promise<number> {
  const [q] = await db
    .select({ correctIndex: questions.correctIndex })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!q) throw new Error(`question ${questionId} not found`);
  return q.correctIndex;
}

/** Reads the fixed question list off a match, for pool-leak checks. */
async function questionIdsOf(matchId: string): Promise<string[]> {
  const [m] = await db
    .select({ ids: matches.questionIds })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  return m?.ids ?? [];
}

async function poolsOf(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ pool: questions.pool })
    .from(questions)
    .where(inArray(questions.id, ids));
  return rows.map((r) => r.pool);
}

let failures = 0;

function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}`);
    if (detail !== undefined) console.error('        ', JSON.stringify(detail));
  }
}

async function call(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signup(tag: string) {
  const email = `smoke_${tag}_${Date.now()}@example.test`;
  const r = await call('/auth/signup', {
    method: 'POST',
    body: { email, password: 'correct-horse-battery' },
  });
  if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.body)}`);
  return {
    token: r.body.accessToken as string,
    refreshToken: r.body.refreshToken as string,
    user: r.body.user,
  };
}

/** Plays through a match, answering correctly when `correct` is true. */
async function play(
  token: string,
  matchId: string,
  opts: { correct: boolean; stopAfter?: number } = { correct: true },
) {
  let last: any = null;
  for (let i = 0; i < 20; i++) {
    if (opts.stopAfter !== undefined && i >= opts.stopAfter) break;

    const q = await call(`/matches/${matchId}/question`, { method: 'POST', token });
    if (q.status === 409) break; // match complete
    if (q.status !== 200) throw new Error(`serve failed: ${JSON.stringify(q.body)}`);

    if (i === 0) {
      check(
        'served question omits correctIndex',
        !('correctIndex' in q.body),
        Object.keys(q.body),
      );
      check('served question omits explanation', !('explanation' in q.body));
      check('served question has 4 options', q.body.options?.length === 4);

      // Idempotent serve: same question, same deadline.
      const again = await call(`/matches/${matchId}/question`, {
        method: 'POST',
        token,
      });
      check(
        'reserve returns the same question',
        again.body.questionId === q.body.questionId,
      );
      check(
        'reserve preserves the ORIGINAL deadline (no extra time)',
        again.body.deadlineAt === q.body.deadlineAt,
        { first: q.body.deadlineAt, second: again.body.deadlineAt },
      );
    }

    const key = await keyFor(q.body.questionId);
    const a = await call(`/matches/${matchId}/answer`, {
      method: 'POST',
      token,
      body: {
        questionId: q.body.questionId,
        selectedIndex: opts.correct ? key : (key + 1) % 4,
        flags: [],
      },
    });
    if (a.status !== 200) throw new Error(`answer failed: ${JSON.stringify(a.body)}`);
    last = a.body;

    if (i === 0) {
      const dup = await call(`/matches/${matchId}/answer`, {
        method: 'POST',
        token,
        body: { questionId: q.body.questionId, selectedIndex: key, flags: [] },
      });
      check('answering the same question twice is rejected', dup.status === 409, dup.body);
    }

    if (last.isFinalQuestion) break;
  }
  return last;
}

async function main() {
  console.log(`smoke test against ${BASE}\n`);

  const health = await call('/health');
  check('health endpoint is up', health.status === 200 && health.body?.db === 'up', health.body);
  if (health.status !== 200) {
    console.error('\nServer is not reachable. Start it with `npm run dev`.');
    process.exit(1);
  }

  const subjects = await call('/subjects');
  check('subjects are seeded', (subjects.body?.subjects?.length ?? 0) > 0);
  const withBank = (subjects.body?.subjects ?? []).find(
    (s: any) => s.duelQuestions >= 10 && s.practiceQuestions >= 10,
  );
  check('a subject has 10+ questions in BOTH pools', Boolean(withBank), subjects.body);
  if (!withBank) {
    console.error('\nRun `npm run seed` first.');
    process.exit(1);
  }

  console.log('\n-- duel: A creates, B joins by code --');
  const a = await signup('a');
  const b = await signup('b');

  const created = await call('/matches', {
    method: 'POST',
    token: a.token,
    body: { subjectSlug: withBank.slug, mode: 'duel' },
  });
  check('A creates a duel', created.status === 201, created.body);
  const matchId = created.body.matchId as string;
  const code = created.body.inviteCode as string;
  check('duel has an invite code', typeof code === 'string' && code.length > 0);
  check('duel has 10 questions', created.body.totalQuestions === 10);

  console.log('\n-- A plays (all correct) --');
  const aLast = await play(a.token, matchId, { correct: true });
  check('A finished the final question', aLast?.isFinalQuestion === true, aLast);

  // The core fairness rule: finishing a duel tells you NOTHING until it settles.
  // Seeing your own score early would let you judge the run and decide whether
  // it was worth sharing; seeing the keys would leak the bank on every attempt.
  const midResult = await call(`/matches/${matchId}/result`, { token: a.token });
  check('an unsettled duel is not revealed', midResult.body.revealed === false, midResult.body.revealed);
  check(
    'your OWN score is hidden until the duel settles',
    midResult.body.you.score === null,
    midResult.body.you,
  );
  check(
    'no answer keys before the duel settles',
    midResult.body.questions.length === 0,
    { questions: midResult.body.questions.length },
  );
  check(
    'progress IS visible (how far along, not how well)',
    midResult.body.you.answeredCount === 10,
    midResult.body.you.answeredCount,
  );
  check(
    'per-question feedback is withheld during a duel',
    aLast?.revealed === false &&
      aLast?.correctIndex === null &&
      aLast?.explanation === null &&
      aLast?.runningScore === null,
    aLast,
  );

  // The match list must obey the same seal. Otherwise it is a side channel:
  // finish a duel, glance at Home, read your score.
  const listWhileSealed = await call('/matches', { token: a.token });
  const sealedRow = listWhileSealed.body.matches.find((m: any) => m.matchId === matchId);
  check(
    'the match LIST hides scores for an unsettled duel too',
    sealedRow?.yourScore === null &&
      sealedRow?.opponentScore === null &&
      sealedRow?.outcome === null,
    sealedRow,
  );

  console.log('\n-- B joins and plays (all wrong) --');
  const joined = await call('/matches/join', {
    method: 'POST',
    token: b.token,
    body: { inviteCode: code },
  });
  check('B joins by invite code', joined.status === 200, joined.body);
  check('B joined the same match', joined.body.matchId === matchId, joined.body);

  const bLast = await play(b.token, matchId, { correct: false });
  check('B finished', bLast?.isFinalQuestion === true, bLast);

  console.log('\n-- settlement --');
  const result = await call(`/matches/${matchId}/result`, { token: a.token });
  check('match is settled', result.body.status === 'settled', result.body.status);
  check('settling reveals the match', result.body.revealed === true);
  check('A is the winner', result.body.winnerId === a.user.id, {
    winnerId: result.body.winnerId,
    a: a.user.id,
  });
  check('not a draw', result.body.isDraw === false);
  check('A score beats B score', result.body.you.score > result.body.opponent.score, {
    you: result.body.you.score,
    them: result.body.opponent.score,
  });
  check(
    'answer keys are released after finishing',
    result.body.questions.every((q: any) => typeof q.correctIndex === 'number'),
  );
  check(
    "opponent's answers now visible",
    result.body.questions.every((q: any) => q.theirs !== null),
  );

  const listAfter = await call('/matches', { token: a.token });
  const settledRow = listAfter.body.matches.find((m: any) => m.matchId === matchId);
  check(
    'the match list shows the outcome once settled',
    settledRow?.outcome === 'won' &&
      typeof settledRow?.yourScore === 'number' &&
      typeof settledRow?.opponentScore === 'number',
    settledRow,
  );

  const me = await call('/auth/me', { token: a.token });
  check('A stats recorded a win', me.body.stats.wins === 1, me.body.stats);
  check('A streak is 1', me.body.stats.streak === 1, me.body.stats);

  console.log('\n-- late answer scores zero --');
  const c = await signup('c');
  const solo = await call('/matches', {
    method: 'POST',
    token: c.token,
    body: { subjectSlug: withBank.slug, mode: 'solo' },
  });
  const soloId = solo.body.matchId as string;
  const q1 = await call(`/matches/${soloId}/question`, { method: 'POST', token: c.token });

  console.log('     waiting out the 15s deadline + 1.5s grace...');
  await sleep(17_000);

  const late = await call(`/matches/${soloId}/answer`, {
    method: 'POST',
    token: c.token,
    body: { questionId: q1.body.questionId, selectedIndex: 0, flags: [] },
  });
  check('late answer is flagged late', late.body.wasLate === true, late.body);
  check('late answer scores 0', late.body.points === 0, late.body);

  console.log('\n-- strikes force a forfeit --');
  const d = await signup('d');
  const sm = await call('/matches', {
    method: 'POST',
    token: d.token,
    body: { subjectSlug: withBank.slug, mode: 'solo' },
  });
  const smId = sm.body.matchId as string;

  let forfeited = false;
  for (let i = 0; i < 3; i++) {
    const q = await call(`/matches/${smId}/question`, { method: 'POST', token: d.token });
    if (q.status !== 200) break;
    const r = await call(`/matches/${smId}/answer`, {
      method: 'POST',
      token: d.token,
      body: {
        questionId: q.body.questionId,
        selectedIndex: 0,
        flags: [{ kind: 'app_away', msAway: 9000 }],
      },
    });
    check(`strike ${i + 1} recorded`, r.body.strikes === i + 1, r.body);
    check(`strike ${i + 1} scores 0`, r.body.points === 0, r.body);
    if (r.body.forfeited) {
      forfeited = true;
      break;
    }
  }
  check('two strikes forfeit the match', forfeited);

  console.log('\n-- quick match falls back to creating one --');
  const e = await signup('e');
  const quick = await call('/matches/join', {
    method: 'POST',
    token: e.token,
    body: { subjectSlug: withBank.slug },
  });
  check(
    'quick duel always returns a playable match',
    quick.status === 200 || quick.status === 201,
    quick.body,
  );

  console.log('\n-- bot opponent --');
  const f = await signup('f');
  const botDuel = await call('/matches', {
    method: 'POST',
    token: f.token,
    body: { subjectSlug: withBank.slug, mode: 'duel' },
  });
  const botMatchId = botDuel.body.matchId as string;

  const preShare = await call(`/matches/${botMatchId}/result`, { token: f.token });
  check(
    'creator sees the invite code while the duel is open',
    typeof preShare.body.inviteCode === 'string' && preShare.body.inviteCode.length > 0,
    preShare.body.inviteCode,
  );

  await play(f.token, botMatchId, { correct: true });

  const filled = await call(`/matches/${botMatchId}/bot`, {
    method: 'POST',
    token: f.token,
  });
  check('bot can be added to an unclaimed duel', filled.status === 200, filled.body);

  const botResult = await call(`/matches/${botMatchId}/result`, { token: f.token });
  check('match settled against the bot', botResult.body.status === 'settled', botResult.body.status);
  check(
    'opponent is flagged isBot so the UI can label it honestly',
    botResult.body.opponent?.user?.isBot === true,
    botResult.body.opponent?.user,
  );
  check(
    'bot answered every question',
    botResult.body.opponent?.answeredCount === 10,
    botResult.body.opponent?.answeredCount,
  );
  check(
    'bot timings look human (no sub-second answers)',
    botResult.body.questions.every((q: any) => (q.theirs?.msTaken ?? 9999) >= 2000),
    botResult.body.questions.map((q: any) => q.theirs?.msTaken),
  );
  check(
    'invite code is withheld once the duel is no longer open',
    botResult.body.inviteCode === null,
  );

  const secondBot = await call(`/matches/${botMatchId}/bot`, {
    method: 'POST',
    token: f.token,
  });
  check('a duel cannot be given two bots', secondBot.status === 409, secondBot.status);

  console.log('\n-- push token registration --');
  const pushOk = await call('/auth/push-token', {
    method: 'POST',
    token: f.token,
    body: { token: 'ExponentPushToken[smoke-test-placeholder]', platform: 'android' },
  });
  check('push token registers', pushOk.status === 200, pushOk.body);
  const pushBad = await call('/auth/push-token', {
    method: 'POST',
    token: f.token,
    body: { token: 'short', platform: 'android' },
  });
  check('a malformed push token is rejected', pushBad.status === 400, pushBad.status);

  console.log('\n-- the two question pools never leak into each other --');
  {
    const [overlap] = await db
      .select({ n: raw<number>`count(*)::int` })
      .from(questions)
      .where(
        raw`${questions.stem} in (
          select stem from questions where pool = 'duel'
          intersect
          select stem from questions where pool = 'practice'
        )`,
      );
    check(
      'no stem exists in both pools',
      (overlap?.n ?? 0) === 0,
      { sharedStems: overlap?.n },
    );

    // The real test: play a duel and a practice round, then confirm the
    // questions served came only from the matching pool. A leak here would let
    // anyone grind a question in practice, where the answer is revealed on
    // submit, then recognise it in a duel.
    const leakUser = await signup('leak');

    const leakDuel = await call('/matches', {
      method: 'POST',
      token: leakUser.token,
      body: { subjectSlug: withBank.slug, mode: 'duel' },
    });
    const duelIds: string[] = await questionIdsOf(leakDuel.body.matchId);
    const duelPools = await poolsOf(duelIds);
    check(
      'a duel serves ONLY duel-pool questions',
      duelPools.every((p) => p === 'duel'),
      { pools: [...new Set(duelPools)] },
    );

    const leakPractice = await call('/matches', {
      method: 'POST',
      token: leakUser.token,
      body: { subjectSlug: withBank.slug, mode: 'solo' },
    });
    const practiceIds: string[] = await questionIdsOf(leakPractice.body.matchId);
    const practicePools = await poolsOf(practiceIds);
    check(
      'practice serves ONLY practice-pool questions',
      practicePools.every((p) => p === 'practice'),
      { pools: [...new Set(practicePools)] },
    );

    check(
      'a duel and a practice round share no questions',
      duelIds.every((id) => !practiceIds.includes(id)),
    );
  }

  console.log('\n-- practice reveals immediately (a duel does not) --');
  const p = await signup('p');
  const practice = await call('/matches', {
    method: 'POST',
    token: p.token,
    body: { subjectSlug: withBank.slug, mode: 'solo' },
  });
  const practiceId = practice.body.matchId as string;

  const pq = await call(`/matches/${practiceId}/question`, {
    method: 'POST',
    token: p.token,
  });
  const pKey = await keyFor(pq.body.questionId);
  const pa = await call(`/matches/${practiceId}/answer`, {
    method: 'POST',
    token: p.token,
    body: { questionId: pq.body.questionId, selectedIndex: pKey, flags: [] },
  });

  check('practice reveals the answer immediately', pa.body.revealed === true, pa.body);
  check('practice returns the correct index', pa.body.correctIndex === pKey, pa.body);
  check('practice returns a running score', typeof pa.body.runningScore === 'number', pa.body);
  check('practice scores a correct answer above zero', (pa.body.points ?? 0) > 0, pa.body);

  console.log('\n-- reroll guard: one open duel at a time --');
  const g = await signup('g');

  const firstDuel = await call('/matches', {
    method: 'POST',
    token: g.token,
    body: { subjectSlug: withBank.slug, mode: 'duel' },
  });
  check('first duel is created', firstDuel.status === 201, firstDuel.body);

  const secondDuel = await call('/matches', {
    method: 'POST',
    token: g.token,
    body: { subjectSlug: withBank.slug, mode: 'duel' },
  });
  check(
    'a SECOND open duel is refused (blocks score cherry-picking)',
    secondDuel.status === 409 && secondDuel.body?.code === 'duel_already_open',
    secondDuel.body,
  );

  // Playing it out does not release the slot — the duel is still open, so the
  // player still cannot reroll after seeing their score.
  await play(g.token, firstDuel.body.matchId, { correct: false });
  const afterPlaying = await call('/matches', {
    method: 'POST',
    token: g.token,
    body: { subjectSlug: withBank.slug, mode: 'duel' },
  });
  check(
    'still refused AFTER playing and seeing the score',
    afterPlaying.status === 409,
    afterPlaying.body,
  );

  // Quick-duel must not sneak past the guard. Joining SOMEONE ELSE'S open duel
  // is fine and expected — as the responder you are playing against a score
  // already committed, so there is nothing to cherry-pick. What must never
  // happen is ending up with two open duels of your own.
  await call('/matches/join', {
    method: 'POST',
    token: g.token,
    body: { subjectSlug: withBank.slug },
  });

  const myOpen = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.createdBy, g.user.id),
        eq(matches.mode, 'duel'),
        eq(matches.status, 'awaiting_opponent'),
      ),
    );
  check(
    'quick duel never leaves you holding two open duels of your own',
    myOpen.length === 1,
    { openDuelsCreatedByMe: myOpen.length },
  );

  // Resolving it costs a settled match, which is what makes rerolling expensive.
  await call(`/matches/${firstDuel.body.matchId}/bot`, { method: 'POST', token: g.token });
  const afterResolving = await call('/matches', {
    method: 'POST',
    token: g.token,
    body: { subjectSlug: withBank.slug, mode: 'duel' },
  });
  check(
    'a new duel is allowed once the previous one is settled',
    afterResolving.status === 201,
    afterResolving.body,
  );

  // Solo is the free, record-neutral way to see answers, so it is NOT limited.
  const solo1 = await call('/matches', {
    method: 'POST',
    token: g.token,
    body: { subjectSlug: withBank.slug, mode: 'solo' },
  });
  const solo2 = await call('/matches', {
    method: 'POST',
    token: g.token,
    body: { subjectSlug: withBank.slug, mode: 'solo' },
  });
  check(
    'practice mode is NOT limited (it is the pressure valve)',
    solo1.status === 201 && solo2.status === 201,
    { solo1: solo1.status, solo2: solo2.status },
  );

  console.log('\n-- change password while signed in --');
  {
    const cp = await signup('changepw');

    const wrongCurrent = await call('/auth/password/change', {
      method: 'POST',
      token: cp.token,
      body: { currentPassword: 'not-my-password', newPassword: 'a-brand-new-one' },
    });
    check('the wrong current password is rejected', wrongCurrent.status === 400, wrongCurrent.body);

    const missingCurrent = await call('/auth/password/change', {
      method: 'POST',
      token: cp.token,
      body: { newPassword: 'a-brand-new-one' },
    });
    check(
      'omitting the current password is rejected when one is set',
      missingCurrent.status === 400,
      missingCurrent.body,
    );

    const changed = await call('/auth/password/change', {
      method: 'POST',
      token: cp.token,
      body: {
        currentPassword: 'correct-horse-battery',
        newPassword: 'a-brand-new-one',
      },
    });
    check('the password changes', changed.status === 200, changed.body);
    check(
      'a fresh token pair comes back, so this device stays signed in',
      typeof changed.body?.accessToken === 'string' &&
        typeof changed.body?.refreshToken === 'string',
      Object.keys(changed.body ?? {}),
    );

    const withNewToken = await call('/auth/me', { token: changed.body.accessToken });
    check('the returned token works', withNewToken.status === 200, withNewToken.status);

    // The pre-change refresh token must be dead — that is the point of revoking
    // every session when a password changes.
    const oldRefresh = await call('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: cp.refreshToken },
    });
    check(
      'the old refresh token is revoked (other devices signed out)',
      oldRefresh.status === 401,
      oldRefresh.status,
    );
  }

  console.log('\n-- password reset --');
  const resetEmail = `smoke_reset_${Date.now()}@example.test`;
  await call('/auth/signup', {
    method: 'POST',
    body: { email: resetEmail, password: 'first-password-here' },
  });

  const unknown = await call('/auth/password/forgot', {
    method: 'POST',
    body: { email: 'definitely-not-registered@example.test' },
  });
  check(
    'forgot-password says ok for an UNKNOWN email (no account enumeration)',
    unknown.status === 200 && unknown.body?.ok === true,
    unknown.body,
  );

  const known = await call('/auth/password/forgot', {
    method: 'POST',
    body: { email: resetEmail },
  });
  check('forgot-password says ok for a known email', known.status === 200, known.body);

  // The emailed code is not readable from here, so plant a known one directly.
  // This exercises the reset endpoint's rules; the code-generation path is
  // covered by the forgot-password checks above.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, resetEmail))
    .limit(1);

  // Unique per run: token_hash is the primary key, so a fixed code collides
  // with the row a previous run left behind for a different user.
  const planted = String(Date.now()).slice(-8);
  await db.delete(passwordResets).where(eq(passwordResets.userId, target!.id));
  await db.insert(passwordResets).values({
    userId: target!.id,
    tokenHash: createHash('sha256').update(planted).digest('hex'),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  const wrongCode = await call('/auth/password/reset', {
    method: 'POST',
    body: { code: '99999999', password: 'second-password-here' },
  });
  check('reset rejects a wrong code', wrongCode.status === 400, wrongCode.status);

  const goodCode = await call('/auth/password/reset', {
    method: 'POST',
    body: { code: planted, password: 'second-password-here' },
  });
  check('reset accepts the real code', goodCode.status === 200, goodCode.body);

  const replay = await call('/auth/password/reset', {
    method: 'POST',
    body: { code: planted, password: 'third-password-here' },
  });
  check('a reset code is single-use', replay.status === 400, replay.status);

  const oldPw = await call('/auth/login', {
    method: 'POST',
    body: { email: resetEmail, password: 'first-password-here' },
  });
  check('the old password no longer works', oldPw.status === 401, oldPw.status);

  const newPw = await call('/auth/login', {
    method: 'POST',
    body: { email: resetEmail, password: 'second-password-here' },
  });
  check('the new password works', newPw.status === 200, newPw.status);

  // An expired code must fail even though it was never used.
  const expiredCode = String(Date.now() + 1).slice(-8);
  await db.insert(passwordResets).values({
    userId: target!.id,
    tokenHash: createHash('sha256').update(expiredCode).digest('hex'),
    expiresAt: new Date(Date.now() - 1000),
  });
  const expired = await call('/auth/password/reset', {
    method: 'POST',
    body: { code: expiredCode, password: 'fourth-password-here' },
  });
  check('an expired code is rejected', expired.status === 400, expired.status);

  console.log(
    failures === 0
      ? '\nALL CHECKS PASSED — Phase 2 + 4 + 5 backend gates met.\n'
      : `\n${failures} CHECK(S) FAILED\n`,
  );
  await pg.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\nsmoke test crashed:', e);
  await pg.end().catch(() => {});
  process.exit(1);
});
