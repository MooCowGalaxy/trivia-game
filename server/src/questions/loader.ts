import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { GameConfig } from '../game/types.js';

const QuestionDisplaySchema = z.object({
  type: z.enum(['image', 'generated']),
  src: z.string().optional(),
});

const QuestionConfigSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  display: QuestionDisplaySchema,
  answerType: z.enum(['exact_number', 'multiple_choice', 'fermi', 'text']),
  options: z.array(z.string()).optional(),
  correctAnswer: z.union([z.string(), z.number()]),
  tolerance: z.number().optional(),
  scoringMode: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

const CategorySourceSchema = z.object({
  categories: z.array(z.string().min(1, 'Category name cannot be empty')).min(1, 'Must specify at least one category'),
  questionCount: z.number().int().positive(),
  requireExactChoices: z.number().int().positive().optional(),
});

const SpeedMathGeneratorParamsSchema = z.object({
  questionCount: z.number().int().positive(),
  operations: z.array(z.string()),
  maxOperandAddSub: z.number().positive(),
  maxOperandMulDiv: z.number().positive(),
  maxAnswer: z.number().positive(),
  allowNegativeResults: z.boolean(),
});

const RoundConfigSchema = z
  .object({
    roundNumber: z.number().int().positive(),
    type: z.enum(['speed_math', 'pattern', 'visual_spatial', 'mixed_logic_fermi']),
    title: z.string(),
    description: z.string().optional(),
    typeLabel: z.string().optional(),
    timerSeconds: z.number().positive(),
    basePoints: z.number().nonnegative(),
    speedBonusMax: z.number().nonnegative(),
    questions: z.array(QuestionConfigSchema).optional(),
    generatorParams: SpeedMathGeneratorParamsSchema.optional(),
    categorySource: CategorySourceSchema.optional(),
  })
  .superRefine((round, ctx) => {
    if (round.type === 'speed_math') {
      if (!round.generatorParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (speed_math) requires generatorParams`,
          path: ['generatorParams'],
        });
      }
    } else {
      // Non-speed_math rounds need either questions or categorySource
      if ((!round.questions || round.questions.length === 0) && !round.categorySource) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (${round.type}) requires a non-empty questions array or a categorySource`,
          path: ['questions'],
        });
      }
    }
  });

const FinaleConfigSchema = z
  .object({
    title: z.string(),
    timerSeconds: z.number().positive(),
    winCondition: z.number(),
    questions: z.array(QuestionConfigSchema).optional(),
    categorySource: CategorySourceSchema.optional(),
  })
  .superRefine((finale, ctx) => {
    if ((!finale.questions || finale.questions.length === 0) && !finale.categorySource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Finale requires a non-empty questions array or a categorySource',
        path: ['questions'],
      });
    }
  });

const GameSettingsSchema = z.object({
  hostDiscordId: z.string(),
  finaleTopN: z.number().int().positive(),
  finaleWinCondition: z.number(),
});

const GameConfigSchema = z.object({
  gameId: z.string(),
  settings: GameSettingsSchema,
  rounds: z.array(RoundConfigSchema).min(1),
  finale: FinaleConfigSchema.optional(),
});

/**
 * Load and validate a game config JSON file.
 * Throws if the file cannot be read or fails schema validation.
 */
export function loadGameConfig(configPath: string): GameConfig {
  const resolvedPath = path.resolve(configPath);

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read game config at "${resolvedPath}": ${message}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON in game config at "${resolvedPath}": ${message}`);
  }

  const result = GameConfigSchema.safeParse(json);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Game config validation failed for "${resolvedPath}":\n${formatted}`);
    throw new Error(
      `Game config validation failed for "${resolvedPath}":\n${formatted}`,
    );
  }

  return result.data as GameConfig;
}
