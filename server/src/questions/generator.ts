import type { SpeedMathGeneratorParams } from '../game/types.js';

export interface GeneratedExpression {
  id: string;
  expression: string;
  correctAnswer: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateOne(
  operations: string[],
  maxOperandAddSub: number,
  maxOperandMulDiv: number,
  maxAnswer: number,
  allowNegativeResults: boolean,
): { expression: string; correctAnswer: number } | null {
  const op = operations[randomInt(0, operations.length - 1)]!;

  let a: number;
  let b: number;
  let answer: number;

  switch (op) {
    case '+': {
      a = randomInt(10, maxOperandAddSub - 1);
      b = randomInt(10, maxOperandAddSub - 1);
      answer = a + b;
      break;
    }
    case '-': {
      // Generate as addition, then reverse: sum - b = a
      const x = randomInt(3, maxOperandAddSub - 1);
      const y = randomInt(3, maxOperandAddSub - 1);
      a = x + y; // displayed as the larger number
      b = allowNegativeResults ? (Math.random() < 0.5 ? x : y) : Math.max(x, y);
      answer = a - b;
      break;
    }
    case '*': {
      a = randomInt(2, maxOperandMulDiv - 1);
      b = randomInt(2, maxOperandMulDiv - 1);
      answer = a * b;
      break;
    }
    case '/': {
      // Generate as multiplication, then reverse: (a*b) / a = b
      const x = randomInt(2, maxOperandMulDiv - 1);
      const y = randomInt(2, maxOperandMulDiv - 1);
      a = x * y; // dividend
      b = x;     // divisor
      answer = y;
      break;
    }
    default:
      return null;
  }

  // Validate answer constraints
  if (answer >= maxAnswer) return null;
  if (!allowNegativeResults && answer < 0) return null;

  return { expression: `${a} ${op} ${b}`, correctAnswer: answer };
}

export function generateSpeedMathQuestions(
  params: SpeedMathGeneratorParams,
): GeneratedExpression[] {
  const {
    questionCount,
    operations,
    maxOperandAddSub,
    maxOperandMulDiv,
    maxAnswer,
    allowNegativeResults,
  } = params;

  const results: GeneratedExpression[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = questionCount * 100;

  while (results.length < questionCount && attempts < maxAttempts) {
    attempts++;
    const generated = generateOne(
      operations,
      maxOperandAddSub,
      maxOperandMulDiv,
      maxAnswer,
      allowNegativeResults,
    );

    if (generated === null) continue;

    // Avoid duplicate expressions
    if (seen.has(generated.expression)) continue;
    seen.add(generated.expression);

    results.push({
      id: `speed_math_${results.length + 1}`,
      expression: generated.expression,
      correctAnswer: generated.correctAnswer,
    });
  }

  if (results.length < questionCount) {
    console.warn(
      `Could only generate ${results.length}/${questionCount} unique questions within constraints.`,
    );
  }

  return results;
}
