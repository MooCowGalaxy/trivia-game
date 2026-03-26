import * as fs from 'node:fs';
import * as path from 'node:path';
import type { QuestionConfig } from '../game/types.js';

export interface ParsedCategoryQuestion {
  questionText: string;
  correctAnswer: string;
  options: string[]; // includes the correct answer
}

/**
 * Parse a single category file into structured questions.
 * Format:
 *   #Q Question text (may span multiple lines)
 *   ^ Correct answer
 *   A Option A
 *   B Option B
 *   C Option C
 *   D Option D
 */
export function parseCategoryFile(filePath: string): ParsedCategoryQuestion[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const questions: ParsedCategoryQuestion[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();

    if (line.startsWith('#Q')) {
      // Start of a new question — collect text (may be multi-line)
      let questionText = line.slice(2).trim();
      i++;

      // Accumulate continuation lines (not starting with ^, A-Z option, or #Q)
      while (i < lines.length) {
        const next = lines[i]!.trim();
        if (
          next.startsWith('^') ||
          next.startsWith('#Q') ||
          /^[A-Z]\s/.test(next) ||
          next === ''
        ) {
          break;
        }
        questionText += ' ' + next;
        i++;
      }

      // Skip blank lines between question text and answer
      while (i < lines.length && lines[i]!.trim() === '') i++;

      // Parse correct answer line (^ ...)
      let correctAnswer = '';
      if (i < lines.length && lines[i]!.trim().startsWith('^')) {
        correctAnswer = lines[i]!.trim().slice(1).trim();
        i++;
      } else {
        // Malformed question, skip
        continue;
      }

      // Parse option lines (A ..., B ..., C ..., D ..., etc.)
      const options: string[] = [];
      while (i < lines.length) {
        const optLine = lines[i]!.trim();
        if (/^[A-Z]\s/.test(optLine)) {
          options.push(optLine.slice(1).trim());
          i++;
        } else {
          break;
        }
      }

      if (questionText && correctAnswer && options.length > 0) {
        questions.push({ questionText, correctAnswer, options });
      }
    } else {
      i++;
    }
  }

  return questions;
}

/**
 * Load questions from one or more category files, optionally filtering
 * by exact number of choices, then pick `count` random questions.
 *
 * Returns fully-formed QuestionConfig[] ready to be used in a round.
 */
export function loadCategoryQuestions(opts: {
  categories: string[];
  questionCount: number;
  requireExactChoices?: number;
  idPrefix: string;
}): QuestionConfig[] {
  const categoriesDir = path.resolve(__dirname, '..', '..', 'assets', 'categories');

  // Parse all requested category files
  const categories = opts.categories.filter((c) => c.trim() !== '');
  let allQuestions: ParsedCategoryQuestion[] = [];
  for (const category of categories) {
    const filePath = path.join(categoriesDir, category);
    const stat = fs.statSync(filePath, { throwIfNoEntry: false });
    if (!stat) {
      throw new Error(`Category file not found: "${category}" (looked at ${filePath})`);
    }
    if (stat.isDirectory()) {
      throw new Error(`Category "${category}" is a directory, not a file (at ${filePath})`);
    }
    const parsed = parseCategoryFile(filePath);
    allQuestions.push(...parsed);
  }

  // Filter by exact number of choices if requested
  if (opts.requireExactChoices !== undefined) {
    allQuestions = allQuestions.filter(
      (q) => q.options.length === opts.requireExactChoices,
    );
  }

  if (allQuestions.length === 0) {
    throw new Error(
      `No questions available from categories [${opts.categories.join(', ')}]` +
        (opts.requireExactChoices !== undefined
          ? ` with exactly ${opts.requireExactChoices} choices`
          : ''),
    );
  }

  // Shuffle and pick n
  const shuffled = shuffleArray(allQuestions);
  const picked = shuffled.slice(0, opts.questionCount);

  // Convert to QuestionConfig[]
  return picked.map((q, idx): QuestionConfig => ({
    id: `${opts.idPrefix}q${idx + 1}`,
    text: q.questionText,
    display: { type: 'generated' },
    answerType: 'multiple_choice',
    options: q.options,
    correctAnswer: q.correctAnswer,
  }));
}

/** Fisher-Yates shuffle (returns a new array). */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
