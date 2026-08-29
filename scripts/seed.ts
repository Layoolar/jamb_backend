/**
 * Seeds subjects and a starter question bank so the duel loop is playable
 * immediately. Idempotent — safe to re-run.
 *
 * These questions are original JAMB-style practice items, NOT reproduced past
 * papers, so they are recorded honestly as source='ai'. Real past questions
 * arrive through scripts/import.ts with their year attached.
 *
 *   npm run seed
 */

import { eq } from 'drizzle-orm';
import { db, sql } from '../src/db/index.js';
import { questions, subjects } from '../src/db/schema.js';

type Seed = {
  stem: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  topic: string;
};

const SUBJECTS = [
  { slug: 'english', name: 'Use of English', sortOrder: 1 },
  { slug: 'mathematics', name: 'Mathematics', sortOrder: 2 },
  { slug: 'biology', name: 'Biology', sortOrder: 3 },
  { slug: 'government', name: 'Government', sortOrder: 4 },
];

const BANK: Record<string, Seed[]> = {
  english: [
    {
      stem: 'Choose the word nearest in meaning to CANDID.',
      options: ['Hidden', 'Frank', 'Hostile', 'Careless'],
      correctIndex: 1,
      explanation: 'Candid means open and honest in speech — frank.',
      difficulty: 1,
      topic: 'Lexis',
    },
    {
      stem: 'The committee has not yet reached ___ decision.',
      options: ["it's", 'its', "its'", 'their'],
      correctIndex: 1,
      explanation: '"Its" is the possessive; "it\'s" is a contraction of "it is". A committee takes a singular pronoun here.',
      difficulty: 1,
      topic: 'Structure',
    },
    {
      stem: 'Choose the option opposite in meaning to ABUNDANT.',
      options: ['Plentiful', 'Scarce', 'Ample', 'Copious'],
      correctIndex: 1,
      explanation: 'Plentiful, ample and copious are all synonyms of abundant. Scarce is its opposite.',
      difficulty: 1,
      topic: 'Lexis',
    },
    {
      stem: 'He was accused ___ stealing the money.',
      options: ['for', 'with', 'of', 'about'],
      correctIndex: 2,
      explanation: 'The fixed collocation is "accused of".',
      difficulty: 1,
      topic: 'Structure',
    },
    {
      stem: 'Choose the word nearest in meaning to METICULOUS.',
      options: ['Careless', 'Painstaking', 'Hurried', 'Doubtful'],
      correctIndex: 1,
      explanation: 'Meticulous means showing great attention to detail — painstaking.',
      difficulty: 2,
      topic: 'Lexis',
    },
    {
      stem: 'What is the plural of CRITERION?',
      options: ['Criterias', 'Criterions', 'Criteria', "Criterion's"],
      correctIndex: 2,
      explanation: 'Criterion is Greek in origin and pluralises to criteria.',
      difficulty: 2,
      topic: 'Lexis',
    },
    {
      stem: 'Hardly had he arrived ___ the meeting began.',
      options: ['than', 'when', 'then', 'that'],
      correctIndex: 1,
      explanation: '"Hardly ... when" is the correct pairing. "No sooner" pairs with "than".',
      difficulty: 2,
      topic: 'Structure',
    },
    {
      stem: 'Choose the option opposite in meaning to TRANSPARENT.',
      options: ['Clear', 'Opaque', 'Obvious', 'Lucid'],
      correctIndex: 1,
      explanation: 'Opaque means not allowing light through — the opposite of transparent.',
      difficulty: 1,
      topic: 'Lexis',
    },
    {
      stem: 'Neither the teacher nor the students ___ present at the assembly.',
      options: ['is', 'was', 'were', 'has been'],
      correctIndex: 2,
      explanation: 'With "neither ... nor", the verb agrees with the nearer subject — "students" is plural.',
      difficulty: 2,
      topic: 'Concord',
    },
    {
      stem: 'Choose the word nearest in meaning to UBIQUITOUS.',
      options: ['Rare', 'Present everywhere', 'Unique', 'Obsolete'],
      correctIndex: 1,
      explanation: 'Ubiquitous means found everywhere at once.',
      difficulty: 3,
      topic: 'Lexis',
    },
    {
      stem: 'She is used to ___ early every morning.',
      options: ['rise', 'rising', 'rose', 'risen'],
      correctIndex: 1,
      explanation: '"Used to" as a description of habit takes a gerund: used to rising.',
      difficulty: 2,
      topic: 'Structure',
    },
    {
      stem: 'Choose the option opposite in meaning to BENEVOLENT.',
      options: ['Kind', 'Generous', 'Malevolent', 'Charitable'],
      correctIndex: 2,
      explanation: 'Benevolent means well-meaning; malevolent means wishing harm.',
      difficulty: 2,
      topic: 'Lexis',
    },
  ],

  mathematics: [
    {
      stem: 'Simplify 2³ × 2⁴.',
      options: ['64', '128', '256', '32'],
      correctIndex: 1,
      explanation: 'Add the indices: 2³ × 2⁴ = 2⁷ = 128.',
      difficulty: 1,
      topic: 'Indices',
    },
    {
      stem: 'If 3x + 5 = 20, find x.',
      options: ['3', '5', '7', '15'],
      correctIndex: 1,
      explanation: '3x = 15, so x = 5.',
      difficulty: 1,
      topic: 'Algebra',
    },
    {
      stem: 'Find the mean of 4, 8, 10 and 14.',
      options: ['8', '9', '10', '12'],
      correctIndex: 1,
      explanation: 'Sum is 36; 36 ÷ 4 = 9.',
      difficulty: 1,
      topic: 'Statistics',
    },
    {
      stem: 'What is 15% of 200?',
      options: ['15', '25', '30', '35'],
      correctIndex: 2,
      explanation: '0.15 × 200 = 30.',
      difficulty: 1,
      topic: 'Percentages',
    },
    {
      stem: 'Solve x² = 49.',
      options: ['x = 7 only', 'x = −7 only', 'x = ±7', 'x = ±49'],
      correctIndex: 2,
      explanation: 'Both 7 and −7 square to 49, so x = ±7.',
      difficulty: 2,
      topic: 'Quadratics',
    },
    {
      stem: 'What is the sum of the interior angles of a triangle?',
      options: ['90°', '180°', '270°', '360°'],
      correctIndex: 1,
      explanation: 'The interior angles of any triangle sum to 180°.',
      difficulty: 1,
      topic: 'Geometry',
    },
    {
      stem: 'Simplify a⁵ ÷ a².',
      options: ['a²', 'a³', 'a⁷', 'a¹⁰'],
      correctIndex: 1,
      explanation: 'Subtract the indices: 5 − 2 = 3, giving a³.',
      difficulty: 1,
      topic: 'Indices',
    },
    {
      stem: 'If y = 2x + 1 and x = 3, find y.',
      options: ['5', '6', '7', '9'],
      correctIndex: 2,
      explanation: 'y = 2(3) + 1 = 7.',
      difficulty: 1,
      topic: 'Algebra',
    },
    {
      stem: 'Find the area of a rectangle 7 cm long and 4 cm wide.',
      options: ['11 cm²', '22 cm²', '28 cm²', '14 cm²'],
      correctIndex: 2,
      explanation: 'Area = length × width = 7 × 4 = 28 cm².',
      difficulty: 1,
      topic: 'Mensuration',
    },
    {
      stem: 'Express 0.25 as a fraction in its lowest terms.',
      options: ['1/2', '1/4', '2/5', '1/5'],
      correctIndex: 1,
      explanation: '0.25 = 25/100 = 1/4.',
      difficulty: 1,
      topic: 'Fractions',
    },
    {
      stem: 'Find the LCM of 6 and 8.',
      options: ['12', '24', '48', '14'],
      correctIndex: 1,
      explanation: 'Multiples of 8 are 8, 16, 24; 24 is the first also divisible by 6.',
      difficulty: 2,
      topic: 'Number theory',
    },
    {
      stem: 'Simplify √81.',
      options: ['3', '9', '18', '81'],
      correctIndex: 1,
      explanation: '9 × 9 = 81, so √81 = 9.',
      difficulty: 1,
      topic: 'Surds',
    },
  ],

  biology: [
    {
      stem: 'What is the basic structural and functional unit of all living organisms?',
      options: ['Tissue', 'Cell', 'Organ', 'Nucleus'],
      correctIndex: 1,
      explanation: 'The cell is the smallest unit capable of carrying out all life processes.',
      difficulty: 1,
      topic: 'Cell biology',
    },
    {
      stem: 'Which organelle carries out photosynthesis?',
      options: ['Mitochondrion', 'Ribosome', 'Chloroplast', 'Lysosome'],
      correctIndex: 2,
      explanation: 'Chloroplasts contain chlorophyll, which traps light energy.',
      difficulty: 1,
      topic: 'Cell biology',
    },
    {
      stem: 'Which type of blood vessel carries blood away from the heart?',
      options: ['Vein', 'Artery', 'Capillary', 'Venule'],
      correctIndex: 1,
      explanation: 'Arteries carry blood away from the heart; veins return it.',
      difficulty: 1,
      topic: 'Transport',
    },
    {
      stem: 'The loss of water vapour from the aerial parts of a plant is called',
      options: ['Respiration', 'Transpiration', 'Translocation', 'Guttation'],
      correctIndex: 1,
      explanation: 'Transpiration is water loss as vapour, mainly through the stomata.',
      difficulty: 1,
      topic: 'Transport',
    },
    {
      stem: 'How many chromosomes are in a normal human somatic cell?',
      options: ['23', '44', '46', '48'],
      correctIndex: 2,
      explanation: '23 homologous pairs, giving 46 in total. Gametes carry 23.',
      difficulty: 2,
      topic: 'Genetics',
    },
    {
      stem: 'Which organ produces bile?',
      options: ['Pancreas', 'Liver', 'Gall bladder', 'Duodenum'],
      correctIndex: 1,
      explanation: 'The liver produces bile; the gall bladder only stores it.',
      difficulty: 2,
      topic: 'Nutrition',
    },
    {
      stem: 'Which gas is taken in by green plants during photosynthesis?',
      options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'],
      correctIndex: 2,
      explanation: 'Carbon dioxide is fixed into carbohydrate; oxygen is released.',
      difficulty: 1,
      topic: 'Nutrition',
    },
    {
      stem: 'Which organelle is described as the powerhouse of the cell?',
      options: ['Nucleus', 'Mitochondrion', 'Golgi body', 'Vacuole'],
      correctIndex: 1,
      explanation: 'Mitochondria carry out aerobic respiration, releasing ATP.',
      difficulty: 1,
      topic: 'Cell biology',
    },
    {
      stem: 'Which blood cells are chiefly responsible for defence against infection?',
      options: ['Red blood cells', 'White blood cells', 'Platelets', 'Plasma cells only'],
      correctIndex: 1,
      explanation: 'White blood cells (leucocytes) defend the body against pathogens.',
      difficulty: 1,
      topic: 'Transport',
    },
    {
      stem: 'Which part of the eye controls the amount of light entering it?',
      options: ['Cornea', 'Lens', 'Iris', 'Retina'],
      correctIndex: 2,
      explanation: 'The iris adjusts the size of the pupil, regulating incoming light.',
      difficulty: 2,
      topic: 'Sense organs',
    },
    {
      stem: 'Which hormone lowers the level of glucose in the blood?',
      options: ['Glucagon', 'Insulin', 'Adrenaline', 'Thyroxine'],
      correctIndex: 1,
      explanation: 'Insulin from the pancreatic beta cells promotes glucose uptake.',
      difficulty: 2,
      topic: 'Hormones',
    },
    {
      stem: 'Which type of cell division produces gametes?',
      options: ['Mitosis', 'Meiosis', 'Binary fission', 'Budding'],
      correctIndex: 1,
      explanation: 'Meiosis halves the chromosome number, producing haploid gametes.',
      difficulty: 2,
      topic: 'Genetics',
    },
  ],

  government: [
    {
      stem: 'The doctrine that legislative, executive and judicial powers should be held by different bodies is called',
      options: ['Rule of law', 'Separation of powers', 'Federalism', 'Checks and balances'],
      correctIndex: 1,
      explanation: 'Separation of powers, associated with Montesquieu, divides the three arms.',
      difficulty: 1,
      topic: 'Principles',
    },
    {
      stem: 'In which year did Nigeria become a republic?',
      options: ['1960', '1963', '1966', '1979'],
      correctIndex: 1,
      explanation: 'Nigeria became a republic on 1 October 1963, replacing the Queen as head of state.',
      difficulty: 2,
      topic: 'Nigerian government',
    },
    {
      stem: 'Which is the upper chamber of Nigeria\'s National Assembly?',
      options: ['House of Representatives', 'Senate', 'Council of State', 'Federal Executive Council'],
      correctIndex: 1,
      explanation: 'The Senate is the upper chamber; the House of Representatives is the lower.',
      difficulty: 1,
      topic: 'Nigerian government',
    },
    {
      stem: 'Government by a small privileged group is called',
      options: ['Democracy', 'Oligarchy', 'Monarchy', 'Theocracy'],
      correctIndex: 1,
      explanation: 'Oligarchy is rule by a few.',
      difficulty: 1,
      topic: 'Forms of government',
    },
    {
      stem: 'The body of fundamental rules by which a state is governed is called a',
      options: ['Statute', 'Constitution', 'Decree', 'Convention'],
      correctIndex: 1,
      explanation: 'A constitution sets out the fundamental principles and structures of a state.',
      difficulty: 1,
      topic: 'Constitution',
    },
    {
      stem: 'Nigeria gained independence on',
      options: ['1 October 1960', '1 October 1963', '29 May 1999', '15 January 1966'],
      correctIndex: 0,
      explanation: 'Independence from Britain came on 1 October 1960.',
      difficulty: 1,
      topic: 'Nigerian government',
    },
    {
      stem: 'A system in which the head of state inherits the position is called',
      options: ['Republic', 'Monarchy', 'Aristocracy', 'Plutocracy'],
      correctIndex: 1,
      explanation: 'In a monarchy the office of head of state is hereditary.',
      difficulty: 1,
      topic: 'Forms of government',
    },
    {
      stem: 'How many states make up the Federal Republic of Nigeria?',
      options: ['30', '36', '37', '774'],
      correctIndex: 1,
      explanation: '36 states plus the Federal Capital Territory. 774 is the number of local governments.',
      difficulty: 1,
      topic: 'Nigerian government',
    },
    {
      stem: 'Which body conducts federal elections in Nigeria?',
      options: ['NJC', 'INEC', 'NPC', 'EFCC'],
      correctIndex: 1,
      explanation: 'The Independent National Electoral Commission conducts federal and state elections.',
      difficulty: 1,
      topic: 'Nigerian government',
    },
    {
      stem: 'The principle that everyone, including those who govern, is subject to the law is',
      options: ['Separation of powers', 'Rule of law', 'Federalism', 'Sovereignty'],
      correctIndex: 1,
      explanation: 'The rule of law holds that no one is above the law.',
      difficulty: 1,
      topic: 'Principles',
    },
    {
      stem: 'A confederation is best described as',
      options: [
        'A strong central government with weak units',
        'A loose union in which component states retain sovereignty',
        'A union with no written constitution',
        'Government by religious leaders',
      ],
      correctIndex: 1,
      explanation: 'In a confederation the component units keep sovereignty and may secede.',
      difficulty: 2,
      topic: 'Forms of government',
    },
    {
      stem: 'Universal adult suffrage means',
      options: [
        'Only taxpayers may vote',
        'The right of all qualified adults to vote',
        'Voting is restricted to men',
        'Voting is compulsory for all',
      ],
      correctIndex: 1,
      explanation: 'Universal adult suffrage extends the vote to all adults who meet the age qualification, without property or gender restriction.',
      difficulty: 1,
      topic: 'Elections',
    },
  ],
};

async function main() {
  let inserted = 0;

  for (const s of SUBJECTS) {
    await db
      .insert(subjects)
      .values(s)
      .onConflictDoUpdate({
        target: subjects.slug,
        set: { name: s.name, sortOrder: s.sortOrder, isActive: true },
      });
  }

  for (const [slug, items] of Object.entries(BANK)) {
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.slug, slug))
      .limit(1);

    if (!subject) throw new Error(`subject ${slug} missing after upsert`);

    for (const q of items) {
      // Idempotency: skip if this exact stem already exists for the subject.
      const existing = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.stem, q.stem))
        .limit(1);

      if (existing.length > 0) continue;

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
        status: 'live',
      });
      inserted++;
    }
  }

  console.log(
    `seeded ${SUBJECTS.length} subjects, inserted ${inserted} new questions`,
  );
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
