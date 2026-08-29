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

import { eq } from 'drizzle-orm';
import { db, sql as pg } from '../src/db/index.js';
import { questions } from '../src/db/schema.js';

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
  return { token: r.body.accessToken as string, user: r.body.user };
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
    (s: any) => s.liveQuestions >= 10,
  );
  check('at least one subject has 10+ live questions', Boolean(withBank), subjects.body);
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
  check('A scored above zero', (aLast?.runningScore ?? 0) > 0, aLast);

  const midResult = await call(`/matches/${matchId}/result`, { token: a.token });
  check(
    "opponent's answers hidden while they are unfinished",
    midResult.body.questions.every((q: any) => q.theirs === null),
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

  console.log(
    failures === 0
      ? '\nALL CHECKS PASSED — Phase 2 exit gate met.\n'
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
