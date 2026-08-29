/**
 * Seeds subjects and the starter question bank. Idempotent — safe to re-run.
 *
 * Question data lives in scripts/seed-data.ts.
 *
 *   npm run seed
 *   npm run seed -- --reset-pools   (re-assign pools on existing rows)
 */

import { eq, sql as raw } from 'drizzle-orm';
import { db, sql } from '../src/db/index.js';
import { questions, subjects } from '../src/db/schema.js';
import { BANK, SUBJECTS, type Pool, type Seed } from './seed-data.js';

const QUESTIONS_PER_MATCH = 10;

/**
 * Refuses to seed a bank that would break the disjoint-pool rule.
 *
 * A stem appearing in both pools would let anyone grind it in practice, where
 * the answer is revealed on submit, then recognise it in a duel. Catching it
 * here is far cheaper than noticing it in production.
 */
function assertPoolsDisjoint(): void {
  const problems: string[] = [];

  for (const [slug, pools] of Object.entries(BANK)) {
    const duel = new Set(pools.duel.map((q) => q.stem));
    for (const q of pools.practice) {
      if (duel.has(q.stem)) {
        problems.push(`  ${slug}: "${q.stem.slice(0, 60)}…" is in BOTH pools`);
      }
    }

    for (const pool of ['duel', 'practice'] as Pool[]) {
      const seen = new Set<string>();
      for (const q of pools[pool]) {
        if (seen.has(q.stem)) {
          problems.push(`  ${slug}/${pool}: duplicate stem "${q.stem.slice(0, 50)}…"`);
        }
        seen.add(q.stem);
      }
    }
  }

  if (problems.length > 0) {
    console.error('Seed data violates the disjoint-pool rule:\n' + problems.join('\n'));
    process.exit(1);
  }
}

/** Cheap sanity checks that catch the mistakes that actually happen. */
function assertWellFormed(): void {
  const problems: string[] = [];

  for (const [slug, pools] of Object.entries(BANK)) {
    for (const pool of ['duel', 'practice'] as Pool[]) {
      for (const q of pools[pool]) {
        const where = `${slug}/${pool}: "${q.stem.slice(0, 40)}…"`;
        if (q.options.length !== 4) problems.push(`${where} needs exactly 4 options`);
        if (new Set(q.options).size !== 4) problems.push(`${where} has a duplicate option`);
        if (q.correctIndex < 0 || q.correctIndex > 3) {
          problems.push(`${where} has correctIndex out of range`);
        }
        if (!q.explanation.trim()) problems.push(`${where} has no explanation`);
      }

      if (pool === 'duel' && pools.duel.length < QUESTIONS_PER_MATCH) {
        problems.push(
          `${slug}: only ${pools.duel.length} duel questions — a duel needs ${QUESTIONS_PER_MATCH}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    console.error('Seed data is malformed:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
}

async function main() {
  const resetPools = process.argv.includes('--reset-pools');

  assertPoolsDisjoint();
  assertWellFormed();

  for (const s of SUBJECTS) {
    await db
      .insert(subjects)
      .values(s)
      .onConflictDoUpdate({
        target: subjects.slug,
        set: { name: s.name, sortOrder: s.sortOrder, isActive: true },
      });
  }

  let inserted = 0;
  let repooled = 0;

  const insert = async (subjectId: string, q: Seed, pool: Pool) => {
    const [existing] = await db
      .select({ id: questions.id, pool: questions.pool })
      .from(questions)
      .where(eq(questions.stem, q.stem))
      .limit(1);

    if (existing) {
      // Rows seeded before pools existed default to 'practice'. --reset-pools
      // moves them to where the bank now says they belong.
      if (resetPools && existing.pool !== pool) {
        await db.update(questions).set({ pool }).where(eq(questions.id, existing.id));
        repooled++;
      }
      return;
    }

    await db.insert(questions).values({
      subjectId,
      source: 'ai',
      stem: q.stem,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      difficulty: q.difficulty,
      topic: q.topic,
      contentFormat: 'plain',
      status: 'live',
      pool,
    });
    inserted++;
  };

  for (const [slug, pools] of Object.entries(BANK)) {
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.slug, slug))
      .limit(1);

    if (!subject) throw new Error(`subject ${slug} missing after upsert`);

    for (const q of pools.duel) await insert(subject.id, q, 'duel');
    for (const q of pools.practice) await insert(subject.id, q, 'practice');
  }

  const counts = await db
    .select({
      slug: subjects.slug,
      pool: questions.pool,
      n: raw<number>`count(*)::int`,
    })
    .from(subjects)
    .innerJoin(questions, eq(questions.subjectId, subjects.id))
    .where(eq(questions.status, 'live'))
    .groupBy(subjects.slug, questions.pool, subjects.sortOrder)
    .orderBy(subjects.sortOrder);

  console.log(
    `\nseeded ${SUBJECTS.length} subjects · inserted ${inserted} new question(s)` +
      (repooled > 0 ? ` · re-pooled ${repooled}` : ''),
  );
  console.log('\nlive questions by pool:');
  for (const slug of SUBJECTS.map((s) => s.slug)) {
    const duel = counts.find((c) => c.slug === slug && c.pool === 'duel')?.n ?? 0;
    const practice = counts.find((c) => c.slug === slug && c.pool === 'practice')?.n ?? 0;
    const flag = duel < QUESTIONS_PER_MATCH ? '  <-- too few to duel' : '';
    console.log(
      `  ${slug.padEnd(12)} duel ${String(duel).padStart(3)} · practice ${String(practice).padStart(3)}${flag}`,
    );
  }

  if (!resetPools) {
    console.log(
      '\nRows created before pools existed default to practice. Run with --reset-pools to move them.',
    );
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
