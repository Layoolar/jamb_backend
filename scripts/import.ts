/**
 * Imports past questions from CSV (PLAN §5).
 *
 * Expected header (order does not matter):
 *   subject_slug,year,stem,option_a,option_b,option_c,option_d,correct,explanation,difficulty,topic
 *
 *   correct     — A/B/C/D (case-insensitive) or 0-3
 *   difficulty  — 1..3, defaults to 2
 *   explanation — optional but strongly wanted; it is the learning value
 *
 * Imports land as status='draft'. Nothing reaches players until reviewed and
 * promoted, because a wrong answer key costs trust permanently.
 *
 *   npm run import -- content/english-2019.csv
 *   npm run import -- content/english-2019.csv --live    (skip review, use sparingly)
 */

import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db, sql } from '../src/db/index.js';
import { questions, subjects } from '../src/db/schema.js';

/** Minimal RFC-4180 parser: handles quoted fields, escaped quotes, embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);

  return rows;
}

const LETTERS: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };

function correctIndexOf(value: string, line: number): number {
  const v = value.trim().toLowerCase();
  if (v in LETTERS) return LETTERS[v] as number;
  const n = Number(v);
  if (Number.isInteger(n) && n >= 0 && n <= 3) return n;
  throw new Error(`line ${line}: "correct" must be A-D or 0-3, got "${value}"`);
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const goLive = args.includes('--live');

  if (!file) {
    console.error('usage: npm run import -- <file.csv> [--live]');
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, 'utf8'));
  const header = rows.shift();
  if (!header) throw new Error('empty CSV');

  const col = Object.fromEntries(
    header.map((h, i) => [h.trim().toLowerCase(), i] as const),
  );

  for (const required of [
    'subject_slug',
    'stem',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'correct',
  ]) {
    if (!(required in col)) throw new Error(`CSV is missing a "${required}" column`);
  }

  const get = (r: string[], name: string): string =>
    (r[col[name] as number] ?? '').trim();

  const subjectCache = new Map<string, string>();
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  for (const [idx, r] of rows.entries()) {
    const line = idx + 2;
    try {
      const slug = get(r, 'subject_slug').toLowerCase();

      if (!subjectCache.has(slug)) {
        const [s] = await db
          .select({ id: subjects.id })
          .from(subjects)
          .where(eq(subjects.slug, slug))
          .limit(1);
        if (!s) throw new Error(`line ${line}: unknown subject "${slug}"`);
        subjectCache.set(slug, s.id);
      }

      const stem = get(r, 'stem');
      if (stem.length < 8) throw new Error(`line ${line}: stem looks too short`);

      const options = [
        get(r, 'option_a'),
        get(r, 'option_b'),
        get(r, 'option_c'),
        get(r, 'option_d'),
      ];
      if (options.some((o) => o === '')) {
        throw new Error(`line ${line}: all four options are required`);
      }
      if (new Set(options).size !== 4) {
        throw new Error(`line ${line}: options contain a duplicate`);
      }

      // Duplicate stems are the commonest import problem — the same question
      // circulates across multiple study sources.
      const [dup] = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.stem, stem))
        .limit(1);
      if (dup) {
        skipped++;
        continue;
      }

      const yearRaw = get(r, 'year');
      const difficultyRaw = get(r, 'difficulty');

      await db.insert(questions).values({
        subjectId: subjectCache.get(slug) as string,
        source: 'past',
        year: yearRaw ? Number(yearRaw) : null,
        stem,
        options,
        correctIndex: correctIndexOf(get(r, 'correct'), line),
        explanation: get(r, 'explanation') || null,
        difficulty: difficultyRaw ? Math.min(3, Math.max(1, Number(difficultyRaw))) : 2,
        topic: get(r, 'topic') || null,
        contentFormat: 'plain',
        status: goLive ? 'live' : 'draft',
      });
      inserted++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  console.log(
    `\nimported ${inserted} as ${goLive ? 'LIVE' : 'draft'}, skipped ${skipped} duplicate stem(s)`,
  );

  if (errors.length > 0) {
    console.error(`\n${errors.length} row(s) rejected:`);
    for (const e of errors.slice(0, 30)) console.error(`  ${e}`);
    if (errors.length > 30) console.error(`  ... and ${errors.length - 30} more`);
  }

  if (!goLive && inserted > 0) {
    console.log(
      '\nThese are drafts. Review them, then promote:\n' +
        "  update questions set status='live' where status='draft' and source='past';",
    );
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
