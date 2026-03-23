import type { AnswerType } from '../game/types.js';

export interface ValidateOptions {
  tolerance?: number;
  aliases?: string[];
}

/**
 * Validate a submitted answer against the correct answer based on answer type.
 *
 * - exact_number: |submitted - correct| <= tolerance (default 0)
 * - multiple_choice: case-insensitive exact match
 * - fermi: any numeric answer is valid (scoring is proximity-based)
 * - text: case-insensitive trimmed match, also checks aliases
 */
export function validateAnswer(
  submitted: string | number,
  correct: string | number,
  answerType: AnswerType,
  options?: ValidateOptions,
): boolean {
  switch (answerType) {
    case 'exact_number': {
      const submittedNum =
        typeof submitted === 'number' ? submitted : parseFloat(String(submitted));
      const correctNum =
        typeof correct === 'number' ? correct : parseFloat(String(correct));

      if (isNaN(submittedNum) || isNaN(correctNum)) return false;

      const tolerance = options?.tolerance ?? 0;
      return Math.abs(submittedNum - correctNum) <= tolerance;
    }

    case 'multiple_choice': {
      const submittedStr = String(submitted).trim().toLowerCase();
      const correctStr = String(correct).trim().toLowerCase();
      return submittedStr === correctStr;
    }

    case 'fermi': {
      const num =
        typeof submitted === 'number' ? submitted : parseFloat(String(submitted));
      return !isNaN(num);
    }

    case 'text': {
      const submittedText = String(submitted).trim().toLowerCase();
      const correctText = String(correct).trim().toLowerCase();

      if (submittedText === correctText) return true;

      // Check aliases
      if (options?.aliases) {
        return options.aliases.some(
          (alias) => alias.trim().toLowerCase() === submittedText,
        );
      }

      return false;
    }

    default: {
      // Exhaustive check
      const _exhaustive: never = answerType;
      return _exhaustive;
    }
  }
}
