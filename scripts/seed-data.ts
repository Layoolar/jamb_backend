/**
 * Starter question bank.
 *
 * These are ORIGINAL JAMB-style practice items, not reproduced past papers, so
 * they are recorded honestly as source='ai'. Real past questions arrive through
 * scripts/import.ts with their year attached.
 *
 * The two pools are DISJOINT and must stay that way. Practice reveals the
 * answer on submit, so a question in both pools would let anyone grind it in
 * practice and then recognise it in a duel.
 *
 * Duel questions are the larger set: a duel draws 10, and drawing 10 from 12
 * means near-identical matches every time.
 */

export type Seed = {
  stem: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  topic: string;
};

export type Pool = 'duel' | 'practice';

export const SUBJECTS = [
  { slug: 'english', name: 'Use of English', sortOrder: 1 },
  { slug: 'mathematics', name: 'Mathematics', sortOrder: 2 },
  { slug: 'biology', name: 'Biology', sortOrder: 3 },
  { slug: 'government', name: 'Government', sortOrder: 4 },
];

export const BANK: Record<string, Record<Pool, Seed[]>> = {
  // ------------------------------------------------------------------ ENGLISH
  english: {
    duel: [
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
        explanation:
          '"Its" is the possessive; "it\'s" is a contraction of "it is". A committee takes a singular pronoun here.',
        difficulty: 1,
        topic: 'Structure',
      },
      {
        stem: 'Choose the option opposite in meaning to ABUNDANT.',
        options: ['Plentiful', 'Scarce', 'Ample', 'Copious'],
        correctIndex: 1,
        explanation:
          'Plentiful, ample and copious are all synonyms of abundant. Scarce is its opposite.',
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
        explanation:
          'Meticulous means showing great attention to detail — painstaking.',
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
        explanation:
          '"Hardly ... when" is the correct pairing. "No sooner" pairs with "than".',
        difficulty: 2,
        topic: 'Structure',
      },
      {
        stem: 'Choose the option opposite in meaning to TRANSPARENT.',
        options: ['Clear', 'Opaque', 'Obvious', 'Lucid'],
        correctIndex: 1,
        explanation:
          'Opaque means not allowing light through — the opposite of transparent.',
        difficulty: 1,
        topic: 'Lexis',
      },
      {
        stem: 'Neither the teacher nor the students ___ present at the assembly.',
        options: ['is', 'was', 'were', 'has been'],
        correctIndex: 2,
        explanation:
          'With "neither ... nor", the verb agrees with the nearer subject — "students" is plural.',
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
        explanation:
          '"Used to" as a description of habit takes a gerund: used to rising.',
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
      {
        stem: 'The manager, along with his assistants, ___ arrived.',
        options: ['have', 'has', 'were', 'are'],
        correctIndex: 1,
        explanation:
          '"Along with" does not change the number of the subject. The subject is "the manager", so the verb is singular.',
        difficulty: 2,
        topic: 'Concord',
      },
      {
        stem: 'Choose the word nearest in meaning to PROLIFIC.',
        options: ['Unproductive', 'Highly productive', 'Wasteful', 'Reluctant'],
        correctIndex: 1,
        explanation:
          'A prolific writer produces a great deal. It describes abundance of output.',
        difficulty: 2,
        topic: 'Lexis',
      },
      {
        stem: 'If he ___ harder, he would have passed.',
        options: ['studied', 'had studied', 'has studied', 'would study'],
        correctIndex: 1,
        explanation:
          'Third conditional: "if + had + past participle" pairs with "would have passed" for an unreal past.',
        difficulty: 2,
        topic: 'Structure',
      },
      {
        stem: 'Choose the option opposite in meaning to FRUGAL.',
        options: ['Thrifty', 'Extravagant', 'Economical', 'Sparing'],
        correctIndex: 1,
        explanation:
          'Thrifty, economical and sparing all mean careful with money. Extravagant is the opposite.',
        difficulty: 2,
        topic: 'Lexis',
      },
      {
        stem: 'The stress in the word "photography" falls on which syllable?',
        options: ['First', 'Second', 'Third', 'Fourth'],
        correctIndex: 1,
        explanation:
          'pho-TOG-ra-phy — the stress is on the second syllable, unlike "PHO-to-graph".',
        difficulty: 3,
        topic: 'Stress',
      },
      {
        stem: 'He would rather ___ at home than go to the party.',
        options: ['stays', 'stayed', 'stay', 'staying'],
        correctIndex: 2,
        explanation: '"Would rather" is followed by the bare infinitive: would rather stay.',
        difficulty: 2,
        topic: 'Structure',
      },
      {
        stem: 'Choose the word nearest in meaning to TENACIOUS.',
        options: ['Persistent', 'Timid', 'Generous', 'Confused'],
        correctIndex: 0,
        explanation: 'Tenacious means holding on firmly — persistent, not easily giving up.',
        difficulty: 2,
        topic: 'Lexis',
      },
      {
        stem: 'The thief was apprehended ___ the police.',
        options: ['with', 'by', 'from', 'through'],
        correctIndex: 1,
        explanation:
          'In the passive voice the agent takes "by". "With" would introduce an instrument, not a doer.',
        difficulty: 1,
        topic: 'Structure',
      },
    ],
    practice: [
      {
        stem: 'Choose the word nearest in meaning to LUCID.',
        options: ['Confusing', 'Clear', 'Dull', 'Noisy'],
        correctIndex: 1,
        explanation: 'A lucid explanation is clear and easy to follow.',
        difficulty: 1,
        topic: 'Lexis',
      },
      {
        stem: 'Each of the boys ___ a bag.',
        options: ['have', 'has', 'were having', 'are having'],
        correctIndex: 1,
        explanation: '"Each" is singular no matter what follows it, so the verb is "has".',
        difficulty: 1,
        topic: 'Concord',
      },
      {
        stem: 'Choose the option opposite in meaning to HUMBLE.',
        options: ['Modest', 'Arrogant', 'Meek', 'Unassuming'],
        correctIndex: 1,
        explanation:
          'Modest, meek and unassuming are all close to humble. Arrogant is its opposite.',
        difficulty: 1,
        topic: 'Lexis',
      },
      {
        stem: 'She has been living here ___ 2019.',
        options: ['for', 'since', 'from', 'during'],
        correctIndex: 1,
        explanation:
          '"Since" marks a point in time; "for" marks a length of time (for three years).',
        difficulty: 1,
        topic: 'Structure',
      },
      {
        stem: 'Choose the word nearest in meaning to OBSOLETE.',
        options: ['Modern', 'Out of date', 'Expensive', 'Fragile'],
        correctIndex: 1,
        explanation: 'Something obsolete has fallen out of use — out of date.',
        difficulty: 1,
        topic: 'Lexis',
      },
      {
        stem: 'The plural of "analysis" is',
        options: ['analysises', 'analysis', 'analyses', "analysis's"],
        correctIndex: 2,
        explanation:
          'Words ending in -is from Greek take -es in the plural: analysis → analyses.',
        difficulty: 2,
        topic: 'Lexis',
      },
      {
        stem: 'No sooner had she sat down ___ the phone rang.',
        options: ['when', 'than', 'then', 'that'],
        correctIndex: 1,
        explanation: '"No sooner" pairs with "than". It is "hardly" that pairs with "when".',
        difficulty: 2,
        topic: 'Structure',
      },
      {
        stem: 'Choose the option opposite in meaning to ASCEND.',
        options: ['Climb', 'Descend', 'Rise', 'Mount'],
        correctIndex: 1,
        explanation: 'Climb, rise and mount all mean to go up. Descend means to go down.',
        difficulty: 1,
        topic: 'Lexis',
      },
      {
        stem: 'The book, together with the pens, ___ on the table.',
        options: ['are', 'is', 'were', 'have been'],
        correctIndex: 1,
        explanation:
          '"Together with" does not add to the subject. "The book" is singular, so the verb is "is".',
        difficulty: 2,
        topic: 'Concord',
      },
      {
        stem: 'Choose the word nearest in meaning to AMBIGUOUS.',
        options: ['Certain', 'Open to more than one meaning', 'Loud', 'Brief'],
        correctIndex: 1,
        explanation: 'An ambiguous sentence can be understood in more than one way.',
        difficulty: 2,
        topic: 'Lexis',
      },
      {
        stem: 'I look forward to ___ from you.',
        options: ['hear', 'hearing', 'heard', 'be hearing'],
        correctIndex: 1,
        explanation:
          'In "look forward to", "to" is a preposition, so it takes a gerund: hearing.',
        difficulty: 2,
        topic: 'Structure',
      },
      {
        stem: 'Choose the option opposite in meaning to DILIGENT.',
        options: ['Hardworking', 'Indolent', 'Careful', 'Industrious'],
        correctIndex: 1,
        explanation:
          'Hardworking, careful and industrious are near-synonyms of diligent. Indolent means lazy.',
        difficulty: 2,
        topic: 'Lexis',
      },
    ],
  },

  // -------------------------------------------------------------- MATHEMATICS
  mathematics: {
    duel: [
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
      {
        stem: 'Find the HCF of 18 and 24.',
        options: ['3', '6', '9', '12'],
        correctIndex: 1,
        explanation:
          '18 = 2 × 3², 24 = 2³ × 3. The common factors give 2 × 3 = 6.',
        difficulty: 2,
        topic: 'Number theory',
      },
      {
        stem: 'What is the value of 5! (five factorial)?',
        options: ['25', '60', '120', '720'],
        correctIndex: 2,
        explanation: '5! = 5 × 4 × 3 × 2 × 1 = 120.',
        difficulty: 2,
        topic: 'Permutations',
      },
      {
        stem: 'The angles of a quadrilateral sum to',
        options: ['180°', '270°', '360°', '540°'],
        correctIndex: 2,
        explanation:
          'A quadrilateral splits into two triangles, so 2 × 180° = 360°.',
        difficulty: 1,
        topic: 'Geometry',
      },
      {
        stem: 'Simplify 3(x + 2) − 2x.',
        options: ['x + 6', 'x + 2', '5x + 6', 'x − 6'],
        correctIndex: 0,
        explanation: '3x + 6 − 2x = x + 6.',
        difficulty: 1,
        topic: 'Algebra',
      },
      {
        stem: 'A die is rolled once. What is the probability of getting an even number?',
        options: ['1/6', '1/3', '1/2', '2/3'],
        correctIndex: 2,
        explanation: 'Three of the six faces (2, 4, 6) are even, so 3/6 = 1/2.',
        difficulty: 2,
        topic: 'Probability',
      },
      {
        stem: 'Convert 3/5 to a percentage.',
        options: ['35%', '53%', '60%', '65%'],
        correctIndex: 2,
        explanation: '3 ÷ 5 = 0.6, and 0.6 × 100 = 60%.',
        difficulty: 1,
        topic: 'Percentages',
      },
      {
        stem: 'Find the median of 3, 9, 4, 7, 5.',
        options: ['4', '5', '7', '9'],
        correctIndex: 1,
        explanation: 'Ordered: 3, 4, 5, 7, 9. The middle value is 5.',
        difficulty: 2,
        topic: 'Statistics',
      },
      {
        stem: 'The perimeter of a square of side 6 cm is',
        options: ['12 cm', '24 cm', '36 cm', '18 cm'],
        correctIndex: 1,
        explanation: 'Perimeter = 4 × side = 4 × 6 = 24 cm. 36 cm² would be the area.',
        difficulty: 1,
        topic: 'Mensuration',
      },
    ],
    practice: [
      {
        stem: 'Simplify 10² ÷ 10.',
        options: ['1', '10', '100', '1000'],
        correctIndex: 1,
        explanation: '10² = 100, and 100 ÷ 10 = 10. Or subtract indices: 10²⁻¹ = 10¹.',
        difficulty: 1,
        topic: 'Indices',
      },
      {
        stem: 'If 2x − 7 = 9, find x.',
        options: ['1', '6', '8', '16'],
        correctIndex: 2,
        explanation: '2x = 16, so x = 8.',
        difficulty: 1,
        topic: 'Algebra',
      },
      {
        stem: 'What is 20% of 150?',
        options: ['20', '30', '35', '50'],
        correctIndex: 1,
        explanation: '0.20 × 150 = 30.',
        difficulty: 1,
        topic: 'Percentages',
      },
      {
        stem: 'Find the mode of 2, 3, 3, 5, 7, 3.',
        options: ['2', '3', '5', '7'],
        correctIndex: 1,
        explanation: 'The mode is the most frequent value; 3 appears three times.',
        difficulty: 1,
        topic: 'Statistics',
      },
      {
        stem: 'Simplify √144.',
        options: ['11', '12', '14', '24'],
        correctIndex: 1,
        explanation: '12 × 12 = 144.',
        difficulty: 1,
        topic: 'Surds',
      },
      {
        stem: 'The area of a triangle with base 10 cm and height 6 cm is',
        options: ['16 cm²', '30 cm²', '60 cm²', '32 cm²'],
        correctIndex: 1,
        explanation: 'Area = ½ × base × height = ½ × 10 × 6 = 30 cm².',
        difficulty: 1,
        topic: 'Mensuration',
      },
      {
        stem: 'Express 0.75 as a fraction in its lowest terms.',
        options: ['3/4', '7/10', '2/3', '4/5'],
        correctIndex: 0,
        explanation: '0.75 = 75/100 = 3/4.',
        difficulty: 1,
        topic: 'Fractions',
      },
      {
        stem: 'Find the LCM of 4 and 10.',
        options: ['14', '20', '40', '2'],
        correctIndex: 1,
        explanation: 'Multiples of 10 are 10, 20; 20 is the first also divisible by 4.',
        difficulty: 2,
        topic: 'Number theory',
      },
      {
        stem: 'Solve x² = 36.',
        options: ['x = 6 only', 'x = ±6', 'x = ±18', 'x = 18'],
        correctIndex: 1,
        explanation: 'Both 6 and −6 square to 36.',
        difficulty: 2,
        topic: 'Quadratics',
      },
      {
        stem: 'A bag has 3 red and 5 blue balls. What is the probability of drawing a red one?',
        options: ['3/5', '3/8', '5/8', '1/3'],
        correctIndex: 1,
        explanation: 'There are 8 balls in total and 3 are red, so 3/8.',
        difficulty: 2,
        topic: 'Probability',
      },
      {
        stem: 'Simplify 4(y − 3) + 12.',
        options: ['4y', '4y − 12', '4y + 9', '16y'],
        correctIndex: 0,
        explanation: '4y − 12 + 12 = 4y.',
        difficulty: 2,
        topic: 'Algebra',
      },
      {
        stem: 'The sum of interior angles of a pentagon is',
        options: ['360°', '450°', '540°', '720°'],
        correctIndex: 2,
        explanation: '(n − 2) × 180° with n = 5 gives 3 × 180° = 540°.',
        difficulty: 2,
        topic: 'Geometry',
      },
    ],
  },

  // ------------------------------------------------------------------ BIOLOGY
  biology: {
    duel: [
      {
        stem: 'What is the basic structural and functional unit of all living organisms?',
        options: ['Tissue', 'Cell', 'Organ', 'Nucleus'],
        correctIndex: 1,
        explanation:
          'The cell is the smallest unit capable of carrying out all life processes.',
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
        explanation:
          'Transpiration is water loss as vapour, mainly through the stomata.',
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
        options: [
          'Red blood cells',
          'White blood cells',
          'Platelets',
          'Plasma cells only',
        ],
        correctIndex: 1,
        explanation:
          'White blood cells (leucocytes) defend the body against pathogens.',
        difficulty: 1,
        topic: 'Transport',
      },
      {
        stem: 'Which part of the eye controls the amount of light entering it?',
        options: ['Cornea', 'Lens', 'Iris', 'Retina'],
        correctIndex: 2,
        explanation:
          'The iris adjusts the size of the pupil, regulating incoming light.',
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
        explanation:
          'Meiosis halves the chromosome number, producing haploid gametes.',
        difficulty: 2,
        topic: 'Genetics',
      },
      {
        stem: 'The green pigment in plants that traps light energy is',
        options: ['Haemoglobin', 'Chlorophyll', 'Carotene', 'Melanin'],
        correctIndex: 1,
        explanation: 'Chlorophyll absorbs light, mainly in the red and blue regions.',
        difficulty: 1,
        topic: 'Nutrition',
      },
      {
        stem: 'Which organ is the main site of water reabsorption in humans?',
        options: ['Liver', 'Kidney', 'Lung', 'Spleen'],
        correctIndex: 1,
        explanation:
          'The kidney nephrons reabsorb water, regulating the volume of urine.',
        difficulty: 2,
        topic: 'Excretion',
      },
      {
        stem: 'A structure that moves a bone at a joint is the',
        options: ['Ligament', 'Tendon', 'Muscle', 'Cartilage'],
        correctIndex: 2,
        explanation:
          'Muscles contract to move bones. Tendons attach muscle to bone; ligaments join bone to bone.',
        difficulty: 2,
        topic: 'Support and movement',
      },
      {
        stem: 'Which of these is a vector of malaria?',
        options: ['Tsetse fly', 'Female Anopheles mosquito', 'Housefly', 'Blackfly'],
        correctIndex: 1,
        explanation:
          'The female Anopheles mosquito transmits Plasmodium. The tsetse fly carries sleeping sickness.',
        difficulty: 1,
        topic: 'Disease',
      },
      {
        stem: 'The process by which organisms maintain a constant internal environment is',
        options: ['Homeostasis', 'Metabolism', 'Osmosis', 'Excretion'],
        correctIndex: 0,
        explanation:
          'Homeostasis keeps temperature, pH and solute levels within narrow limits.',
        difficulty: 2,
        topic: 'Homeostasis',
      },
      {
        stem: 'Which food class is the body’s quickest source of energy?',
        options: ['Protein', 'Carbohydrate', 'Fat', 'Vitamin'],
        correctIndex: 1,
        explanation:
          'Carbohydrates are broken down to glucose fastest. Fats hold more energy but release it more slowly.',
        difficulty: 1,
        topic: 'Nutrition',
      },
      {
        stem: 'In a food chain, green plants are described as',
        options: ['Producers', 'Primary consumers', 'Decomposers', 'Predators'],
        correctIndex: 0,
        explanation: 'Producers make their own food by photosynthesis.',
        difficulty: 1,
        topic: 'Ecology',
      },
      {
        stem: 'The exchange of gases in the lungs takes place in the',
        options: ['Bronchi', 'Trachea', 'Alveoli', 'Diaphragm'],
        correctIndex: 2,
        explanation:
          'Alveoli are thin-walled and richly supplied with capillaries, giving a large surface for diffusion.',
        difficulty: 1,
        topic: 'Respiration',
      },
    ],
    practice: [
      {
        stem: 'Which organelle controls the activities of the cell?',
        options: ['Nucleus', 'Vacuole', 'Cell wall', 'Ribosome'],
        correctIndex: 0,
        explanation: 'The nucleus holds the DNA and directs cell activity.',
        difficulty: 1,
        topic: 'Cell biology',
      },
      {
        stem: 'Which vessel carries blood back towards the heart?',
        options: ['Artery', 'Vein', 'Arteriole', 'Aorta'],
        correctIndex: 1,
        explanation: 'Veins return blood to the heart and have valves to prevent backflow.',
        difficulty: 1,
        topic: 'Transport',
      },
      {
        stem: 'The movement of water across a semi-permeable membrane is called',
        options: ['Diffusion', 'Osmosis', 'Active transport', 'Transpiration'],
        correctIndex: 1,
        explanation:
          'Osmosis is specifically the movement of water from a dilute to a more concentrated solution across a semi-permeable membrane.',
        difficulty: 2,
        topic: 'Transport',
      },
      {
        stem: 'Which gas do animals release during respiration?',
        options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'],
        correctIndex: 1,
        explanation:
          'Aerobic respiration uses oxygen and releases carbon dioxide and water.',
        difficulty: 1,
        topic: 'Respiration',
      },
      {
        stem: 'How many chromosomes does a normal human gamete contain?',
        options: ['23', '46', '44', '48'],
        correctIndex: 0,
        explanation:
          'Gametes are haploid, carrying half the somatic number: 23.',
        difficulty: 2,
        topic: 'Genetics',
      },
      {
        stem: 'Which hormone raises the level of glucose in the blood?',
        options: ['Insulin', 'Glucagon', 'Oestrogen', 'Testosterone'],
        correctIndex: 1,
        explanation:
          'Glucagon promotes the breakdown of glycogen to glucose. It opposes insulin.',
        difficulty: 2,
        topic: 'Hormones',
      },
      {
        stem: 'Which type of cell division produces two identical daughter cells?',
        options: ['Meiosis', 'Mitosis', 'Fertilisation', 'Fission of gametes'],
        correctIndex: 1,
        explanation:
          'Mitosis maintains the chromosome number and produces genetically identical cells.',
        difficulty: 2,
        topic: 'Genetics',
      },
      {
        stem: 'Organisms that break down dead organic matter are called',
        options: ['Producers', 'Herbivores', 'Decomposers', 'Carnivores'],
        correctIndex: 2,
        explanation:
          'Decomposers such as bacteria and fungi return nutrients to the soil.',
        difficulty: 1,
        topic: 'Ecology',
      },
      {
        stem: 'Deficiency of vitamin C causes',
        options: ['Rickets', 'Scurvy', 'Night blindness', 'Beri-beri'],
        correctIndex: 1,
        explanation:
          'Scurvy comes from lack of vitamin C. Rickets is vitamin D, night blindness vitamin A, beri-beri vitamin B1.',
        difficulty: 2,
        topic: 'Nutrition',
      },
      {
        stem: 'The part of the plant where most photosynthesis occurs is the',
        options: ['Root', 'Stem', 'Leaf', 'Flower'],
        correctIndex: 2,
        explanation:
          'Leaves are broad and thin with many chloroplasts, maximising light capture.',
        difficulty: 1,
        topic: 'Nutrition',
      },
      {
        stem: 'Which structure prevents food from entering the windpipe?',
        options: ['Epiglottis', 'Larynx', 'Uvula', 'Diaphragm'],
        correctIndex: 0,
        explanation: 'The epiglottis covers the trachea during swallowing.',
        difficulty: 2,
        topic: 'Nutrition',
      },
      {
        stem: 'A tadpole developing into a frog is an example of',
        options: ['Metamorphosis', 'Regeneration', 'Fertilisation', 'Germination'],
        correctIndex: 0,
        explanation:
          'Metamorphosis is a marked change in body form between larva and adult.',
        difficulty: 1,
        topic: 'Reproduction',
      },
    ],
  },

  // --------------------------------------------------------------- GOVERNMENT
  government: {
    duel: [
      {
        stem: 'The doctrine that legislative, executive and judicial powers should be held by different bodies is called',
        options: [
          'Rule of law',
          'Separation of powers',
          'Federalism',
          'Checks and balances',
        ],
        correctIndex: 1,
        explanation:
          'Separation of powers, associated with Montesquieu, divides the three arms.',
        difficulty: 1,
        topic: 'Principles',
      },
      {
        stem: 'In which year did Nigeria become a republic?',
        options: ['1960', '1963', '1966', '1979'],
        correctIndex: 1,
        explanation:
          'Nigeria became a republic on 1 October 1963, replacing the Queen as head of state.',
        difficulty: 2,
        topic: 'Nigerian government',
      },
      {
        stem: "Which is the upper chamber of Nigeria's National Assembly?",
        options: [
          'House of Representatives',
          'Senate',
          'Council of State',
          'Federal Executive Council',
        ],
        correctIndex: 1,
        explanation:
          'The Senate is the upper chamber; the House of Representatives is the lower.',
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
        explanation:
          'A constitution sets out the fundamental principles and structures of a state.',
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
        explanation:
          '36 states plus the Federal Capital Territory. 774 is the number of local governments.',
        difficulty: 1,
        topic: 'Nigerian government',
      },
      {
        stem: 'Which body conducts federal elections in Nigeria?',
        options: ['NJC', 'INEC', 'NPC', 'EFCC'],
        correctIndex: 1,
        explanation:
          'The Independent National Electoral Commission conducts federal and state elections.',
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
        explanation:
          'In a confederation the component units keep sovereignty and may secede.',
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
        explanation:
          'Universal adult suffrage extends the vote to all adults who meet the age qualification, without property or gender restriction.',
        difficulty: 1,
        topic: 'Elections',
      },
      {
        stem: 'The arm of government that interprets the law is the',
        options: ['Legislature', 'Executive', 'Judiciary', 'Civil service'],
        correctIndex: 2,
        explanation:
          'The judiciary interprets and applies the law; the legislature makes it and the executive enforces it.',
        difficulty: 1,
        topic: 'Principles',
      },
      {
        stem: 'Supreme power residing in the state and not subject to any external control is',
        options: ['Authority', 'Sovereignty', 'Legitimacy', 'Autonomy'],
        correctIndex: 1,
        explanation:
          'Sovereignty is supreme, absolute authority within a territory.',
        difficulty: 2,
        topic: 'Principles',
      },
      {
        stem: 'A one-party state is one in which',
        options: [
          'Only one political party is legally permitted',
          'One party wins every election',
          'Parties are banned entirely',
          'Two parties alternate in power',
        ],
        correctIndex: 0,
        explanation:
          'In a one-party state the law recognises a single party. A dominant party winning repeatedly is different.',
        difficulty: 2,
        topic: 'Political parties',
      },
      {
        stem: 'Delegated legislation refers to laws made by',
        options: [
          'The legislature only',
          'Bodies acting under powers granted by the legislature',
          'The courts',
          'Traditional rulers',
        ],
        correctIndex: 1,
        explanation:
          'The legislature delegates rule-making power to ministers and agencies, who issue regulations under it.',
        difficulty: 3,
        topic: 'Legislature',
      },
      {
        stem: 'The head of government in a parliamentary system is usually the',
        options: ['President', 'Prime Minister', 'Chief Justice', 'Speaker'],
        correctIndex: 1,
        explanation:
          'In a parliamentary system the Prime Minister leads the government while a monarch or president is head of state.',
        difficulty: 2,
        topic: 'Forms of government',
      },
      {
        stem: 'Which document introduced the first federal constitution in Nigeria?',
        options: [
          'Clifford Constitution 1922',
          'Richards Constitution 1946',
          'Macpherson Constitution 1951',
          'Lyttleton Constitution 1954',
        ],
        correctIndex: 3,
        explanation:
          'The Lyttleton Constitution of 1954 established a federal structure. Richards 1946 introduced regionalism but not full federalism.',
        difficulty: 3,
        topic: 'Nigerian government',
      },
      {
        stem: 'Public opinion is best described as',
        options: [
          'The view of the ruling party',
          'The prevailing view of a significant part of the population',
          'A decision of the courts',
          'The verdict of an election tribunal',
        ],
        correctIndex: 1,
        explanation:
          'Public opinion is the aggregate view held by a substantial section of the public on an issue.',
        difficulty: 2,
        topic: 'Political processes',
      },
      {
        stem: 'The franchise means',
        options: [
          'The right to vote',
          'The right to stand for office',
          'The right to protest',
          'The right to form a party',
        ],
        correctIndex: 0,
        explanation: 'Franchise (or suffrage) is the right to vote in elections.',
        difficulty: 1,
        topic: 'Elections',
      },
    ],
    practice: [
      {
        stem: 'The arm of government that makes laws is the',
        options: ['Executive', 'Legislature', 'Judiciary', 'Electorate'],
        correctIndex: 1,
        explanation: 'The legislature enacts laws; the executive implements them.',
        difficulty: 1,
        topic: 'Principles',
      },
      {
        stem: 'Government by the people, usually through elected representatives, is',
        options: ['Autocracy', 'Democracy', 'Oligarchy', 'Anarchy'],
        correctIndex: 1,
        explanation:
          'Democracy vests political authority in the people, exercised directly or through representatives.',
        difficulty: 1,
        topic: 'Forms of government',
      },
      {
        stem: 'A constitution that is contained in a single formal document is described as',
        options: ['Unwritten', 'Written', 'Flexible', 'Customary'],
        correctIndex: 1,
        explanation:
          'A written constitution is codified in one document. Britain’s is unwritten in this sense.',
        difficulty: 2,
        topic: 'Constitution',
      },
      {
        stem: 'The Federal Capital Territory of Nigeria is',
        options: ['Lagos', 'Kaduna', 'Abuja', 'Enugu'],
        correctIndex: 2,
        explanation:
          'Abuja became the Federal Capital Territory in 1991, replacing Lagos.',
        difficulty: 1,
        topic: 'Nigerian government',
      },
      {
        stem: 'A system of government in which power is shared between central and regional units is',
        options: ['Unitary', 'Federal', 'Confederal', 'Totalitarian'],
        correctIndex: 1,
        explanation:
          'Federalism divides power constitutionally between a central government and component units.',
        difficulty: 1,
        topic: 'Forms of government',
      },
      {
        stem: 'The lower chamber of the Nigerian National Assembly is the',
        options: ['Senate', 'House of Representatives', 'State Assembly', 'Council of State'],
        correctIndex: 1,
        explanation:
          'The House of Representatives is the lower chamber, with members elected from federal constituencies.',
        difficulty: 1,
        topic: 'Nigerian government',
      },
      {
        stem: 'A pressure group differs from a political party because it',
        options: [
          'Does not seek to control government',
          'Has no members',
          'Cannot influence policy',
          'Is always illegal',
        ],
        correctIndex: 0,
        explanation:
          'Pressure groups seek to influence policy without contesting elections to form a government.',
        difficulty: 2,
        topic: 'Political parties',
      },
      {
        stem: 'The right of a citizen to seek redress in court is part of',
        options: [
          'Fundamental human rights',
          'Delegated legislation',
          'Collective responsibility',
          'Ministerial authority',
        ],
        correctIndex: 0,
        explanation:
          'Access to the courts is among the fundamental rights guaranteed by the constitution.',
        difficulty: 2,
        topic: 'Rights',
      },
      {
        stem: 'Bicameral legislature means a legislature with',
        options: ['One chamber', 'Two chambers', 'Three chambers', 'No fixed chambers'],
        correctIndex: 1,
        explanation: 'Bi- means two: an upper and a lower chamber.',
        difficulty: 1,
        topic: 'Legislature',
      },
      {
        stem: 'The civil service is best described as',
        options: [
          'The permanent body of officials who implement government policy',
          'Elected members of parliament',
          'The judiciary',
          'Members of the ruling party',
        ],
        correctIndex: 0,
        explanation:
          'Civil servants are permanent, politically neutral officials who remain in post as governments change.',
        difficulty: 2,
        topic: 'Public administration',
      },
      {
        stem: 'A referendum is',
        options: [
          'A direct vote by the electorate on a specific issue',
          'An election of representatives',
          'A court judgement',
          'A parliamentary debate',
        ],
        correctIndex: 0,
        explanation:
          'A referendum puts a single question directly to voters rather than electing a representative.',
        difficulty: 2,
        topic: 'Elections',
      },
      {
        stem: 'Political socialisation refers to',
        options: [
          'The process by which people acquire political values',
          'Joining a political party',
          'Campaigning during elections',
          'The counting of votes',
        ],
        correctIndex: 0,
        explanation:
          'It is the lifelong process — through family, school and media — by which political attitudes are formed.',
        difficulty: 3,
        topic: 'Political processes',
      },
    ],
  },
};
