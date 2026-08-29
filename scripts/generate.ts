/**
 * AI question generation with an independent self-check (PLAN §5).
 *
 * Generation happens OFFLINE, in batches, never at match time — latency, cost,
 * and above all because an unreviewed hallucinated answer key destroys trust
 * permanently. Everything lands as status='draft'.
 *
 * The self-check is the point of this script. A model asked to produce a
 * question and its answer in one pass will confidently mismark some of them.
 * So a second, independent request gets ONLY the stem and options — never the
 * claimed answer — and is asked to solve it. Disagreements are discarded. That
 * catches most bad keys for a fraction of a cent each.
 *
 * A self-check is not a substitute for human review. It removes the obvious
 * failures so a person's attention goes to the subtle ones.
 *
 *   npm run generate:questions -- --subject english --count 20
 *   npm run generate:questions -- --subject mathematics --count 20 --topic Indices
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, sql } from '../src/db/index.js';
import { questions, subjects } from '../src/db/schema.js';
import { env } from '../src/env.js';

const MODEL = 'claude-opus-5';

const Generated = z.object({
  questions: z.array(
    z.object({
      stem: z.string(),
      options: z.array(z.string()).length(4),
      correctIndex: z.number().int().min(0).max(3),
      explanation: z.string(),
      difficulty: z.number().int().min(1).max(3),
      topic: z.string(),
    }),
  ),
});

const Solved = z.object({
  answerIndex: z.number().int().min(0).max(3),
  confident: z.boolean(),
  /** Why this option, in one line. Surfaces bad reasoning during review. */
  reasoning: z.string(),
});

type Question = z.infer<typeof Generated>['questions'][number];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    subject: get('subject'),
    topic: get('topic'),
    count: Number(get('count') ?? 20),
    live: args.includes('--live'),
  };
}

async function generate(
  client: Anthropic,
  subjectName: string,
  count: number,
  topic: string | undefined,
  avoid: string[],
): Promise<Question[]> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system:
      'You write multiple-choice practice questions for the Nigerian JAMB ' +
      'Unified Tertiary Matriculation Examination. Match the real exam in ' +
      'style, difficulty and syllabus coverage.\n\n' +
      'Rules:\n' +
      '- Exactly four options, exactly one defensibly correct.\n' +
      '- No "all of the above", "none of the above", or "both A and B".\n' +
      '- Distractors must be plausible to someone who half-knows the topic, ' +
      'never absurd.\n' +
      '- PLAIN TEXT ONLY. No LaTeX, no markdown, no images, no tables. ' +
      'Unicode superscripts and x/y fractions are fine.\n' +
      '- The question must be answerable in under 15 seconds by a prepared ' +
      'candidate, since that is the time limit in the app.\n' +
      '- The explanation is one or two sentences saying why the answer is ' +
      'right, and where useful why the tempting wrong option is wrong.\n' +
      '- difficulty: 1 easy, 2 typical, 3 hard.',
    messages: [
      {
        role: 'user',
        content:
          `Write ${count} ${subjectName} questions` +
          (topic ? ` on the topic: ${topic}` : ', spread across the syllabus') +
          '.' +
          (avoid.length > 0
            ? `\n\nDo not duplicate or paraphrase any of these existing stems:\n${avoid
                .slice(0, 60)
                .map((s) => `- ${s}`)
                .join('\n')}`
            : ''),
      },
    ],
    output_config: { format: zodOutputFormat(Generated) },
  });

  return res.parsed_output?.questions ?? [];
}

/**
 * Independently solves a question. Deliberately receives no explanation, no
 * claimed answer, and no hint that the question was generated — anything that
 * leaks the intended answer defeats the whole check.
 */
async function solve(
  client: Anthropic,
  subjectName: string,
  q: Question,
): Promise<z.infer<typeof Solved> | null> {
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system:
        `You are sitting a JAMB ${subjectName} examination. Answer the ` +
        'question. Set confident to false if the question is ambiguous, has ' +
        'more than one defensible answer, or has no correct option.',
      messages: [
        {
          role: 'user',
          content: `${q.stem}\n\n${q.options
            .map((o, i) => `${'ABCD'[i]}. ${o}`)
            .join('\n')}`,
        },
      ],
      output_config: { format: zodOutputFormat(Solved) },
    });
    return res.parsed_output ?? null;
  } catch {
    return null;
  }
}

/** Bounded concurrency — enough to be quick, not enough to trip rate limits. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

async function main() {
  const { subject: slug, topic, count, live } = parseArgs();

  if (!env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY is not set. Add it to .env — see .env.example.',
    );
    process.exit(1);
  }
  if (!slug) {
    console.error(
      'usage: npm run generate:questions -- --subject <slug> [--count 20] [--topic "..."] [--live]',
    );
    process.exit(1);
  }

  const [subject] = await db
    .select()
    .from(subjects)
    .where(eq(subjects.slug, slug))
    .limit(1);

  if (!subject) {
    console.error(`No subject with slug "${slug}". Run npm run seed first.`);
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const existing = await db
    .select({ stem: questions.stem })
    .from(questions)
    .where(eq(questions.subjectId, subject.id));

  console.log(
    `Generating ${count} ${subject.name} questions${topic ? ` on ${topic}` : ''}...`,
  );

  const drafted = await generate(
    client,
    subject.name,
    count,
    topic,
    existing.map((e) => e.stem),
  );
  console.log(`  model returned ${drafted.length}`);

  console.log('Self-checking (independent solve of each question)...');
  const verdicts = await mapLimit(drafted, 4, (q) => solve(client, subject.name, q));

  let kept = 0;
  let disagreed = 0;
  let unsure = 0;
  let duplicate = 0;

  for (const [i, q] of drafted.entries()) {
    const verdict = verdicts[i];

    if (!verdict) {
      unsure++;
      continue;
    }
    if (!verdict.confident) {
      unsure++;
      console.log(`  DROP (ambiguous) ${q.stem.slice(0, 64)}…`);
      continue;
    }
    if (verdict.answerIndex !== q.correctIndex) {
      disagreed++;
      console.log(
        `  DROP (key disagreement: said ${'ABCD'[q.correctIndex]}, solver said ${'ABCD'[verdict.answerIndex]}) ${q.stem.slice(0, 56)}…`,
      );
      continue;
    }

    const [dup] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.stem, q.stem))
      .limit(1);

    if (dup) {
      duplicate++;
      continue;
    }

    await db.insert(questions).values({
      subjectId: subject.id,
      source: 'ai',
      stem: q.stem,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      difficulty: q.difficulty,
      topic: q.topic,
      contentFormat: 'plain',
      status: live ? 'live' : 'draft',
    });
    kept++;
  }

  console.log(
    `\nkept ${kept} as ${live ? 'LIVE' : 'draft'} · dropped ${disagreed} on key disagreement · ` +
      `${unsure} ambiguous · ${duplicate} duplicate`,
  );

  if (!live && kept > 0) {
    console.log(
      '\nReview them in Drizzle Studio (npm run db:studio), then promote:\n' +
        "  update questions set status='live' where status='draft' and source='ai';",
    );
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
