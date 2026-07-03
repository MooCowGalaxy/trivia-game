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
  display: QuestionDisplaySchema.optional(),
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

const FifteenParamsSchema = z.object({
  winnerCount: z.number().int(),
  scrambleMoves: z.number().int().positive().optional(),
});

const FlowConnectParamsSchema = z.object({
  boardSize: z.number().int().min(3),
  colorCount: z.number().int().min(2),
  winnerCount: z.number().int(),
});

const PipeRotationParamsSchema = z.object({
  rows: z.number().int().min(3),
  cols: z.number().int().min(3),
  terminalCount: z.number().int().min(1),
  winnerCount: z.number().int(),
  minDeadEnds: z.number().int().min(0).optional(),
  minBranches: z.number().int().min(0).optional(),
  minMisrotatedTiles: z.number().int().min(0).optional(),
  minRotationDistance: z.number().int().min(0).optional(),
});

const RushHourParamsSchema = z.object({
  size: z.number().int().min(5),
  vehicleCount: z.number().int().min(4),
  truckCount: z.number().int().min(0),
  winnerCount: z.number().int(),
  scrambleMoves: z.number().int().positive().optional(),
  minOneCellMoves: z.number().int().positive().optional(),
  maxOneCellMoves: z.number().int().positive().optional(),
  minVehicleMoves: z.number().int().positive().optional(),
  maxVehicleMoves: z.number().int().positive().optional(),
  minExploredStates: z.number().int().min(0).optional(),
  minTargetRowBlockers: z.number().int().min(0).optional(),
});

const NurikabeParamsSchema = z.object({
  rows: z.number().int().min(2),
  cols: z.number().int().min(2),
  winnerCount: z.number().int(),
  minWhiteRegions: z.number().int().min(1).optional(),
  maxWhiteRegions: z.number().int().min(1).optional(),
  minRegionSize: z.number().int().min(1).optional(),
  maxRegionSize: z.number().int().min(1).optional(),
  lockRatio: z.number().min(0).max(1).optional(),
  minLockedCells: z.number().int().min(0).optional(),
  maxLockedCells: z.number().int().min(0).optional(),
});

const RoundConfigSchema = z
  .object({
    roundNumber: z.number().int().positive(),
    type: z.enum(['speed_math', 'fifteen', 'flow_connect', 'pipe_rotation', 'rush_hour', 'nurikabe', 'pattern', 'visual_spatial', 'mixed_logic_fermi']),
    title: z.string(),
    description: z.string().optional(),
    typeLabel: z.string().optional(),
    timerSeconds: z.number().positive(),
    basePoints: z.number().nonnegative(),
    speedBonusMax: z.number().nonnegative(),
    questions: z.array(QuestionConfigSchema).optional(),
    generatorParams: SpeedMathGeneratorParamsSchema.optional(),
    fifteenParams: FifteenParamsSchema.optional(),
    flowConnectParams: FlowConnectParamsSchema.optional(),
    pipeRotationParams: PipeRotationParamsSchema.optional(),
    rushHourParams: RushHourParamsSchema.optional(),
    nurikabeParams: NurikabeParamsSchema.optional(),
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
    } else if (round.type === 'fifteen') {
      if (!round.fifteenParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (fifteen) requires fifteenParams`,
          path: ['fifteenParams'],
        });
      }
    } else if (round.type === 'flow_connect') {
      if (!round.flowConnectParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (flow_connect) requires flowConnectParams`,
          path: ['flowConnectParams'],
        });
      } else if (round.flowConnectParams.boardSize * round.flowConnectParams.boardSize < round.flowConnectParams.colorCount * 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (flow_connect) needs at least two cells per color`,
          path: ['flowConnectParams'],
        });
      }
    } else if (round.type === 'pipe_rotation') {
      if (!round.pipeRotationParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (pipe_rotation) requires pipeRotationParams`,
          path: ['pipeRotationParams'],
        });
      } else if (round.pipeRotationParams.terminalCount + 1 > round.pipeRotationParams.rows * round.pipeRotationParams.cols) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (pipe_rotation) has too many terminals`,
          path: ['pipeRotationParams'],
        });
      }
    } else if (round.type === 'rush_hour') {
      if (!round.rushHourParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (rush_hour) requires rushHourParams`,
          path: ['rushHourParams'],
        });
      } else if (round.rushHourParams.truckCount >= round.rushHourParams.vehicleCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (rush_hour) truckCount must be less than vehicleCount`,
          path: ['rushHourParams'],
        });
      } else if (
        round.rushHourParams.minOneCellMoves &&
        round.rushHourParams.maxOneCellMoves &&
        round.rushHourParams.maxOneCellMoves < round.rushHourParams.minOneCellMoves
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (rush_hour) has invalid one-cell move bounds`,
          path: ['rushHourParams'],
        });
      } else if (
        round.rushHourParams.minVehicleMoves &&
        round.rushHourParams.maxVehicleMoves &&
        round.rushHourParams.maxVehicleMoves < round.rushHourParams.minVehicleMoves
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (rush_hour) has invalid vehicle move bounds`,
          path: ['rushHourParams'],
        });
      }
    } else if (round.type === 'nurikabe') {
      if (!round.nurikabeParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (nurikabe) requires nurikabeParams`,
          path: ['nurikabeParams'],
        });
      } else if (
        round.nurikabeParams.minWhiteRegions &&
        round.nurikabeParams.maxWhiteRegions &&
        round.nurikabeParams.maxWhiteRegions < round.nurikabeParams.minWhiteRegions
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (nurikabe) has invalid white region bounds`,
          path: ['nurikabeParams'],
        });
      } else if (
        round.nurikabeParams.minRegionSize &&
        round.nurikabeParams.maxRegionSize &&
        round.nurikabeParams.maxRegionSize < round.nurikabeParams.minRegionSize
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (nurikabe) has invalid region size bounds`,
          path: ['nurikabeParams'],
        });
      } else if (
        round.nurikabeParams.minLockedCells !== undefined &&
        round.nurikabeParams.maxLockedCells !== undefined &&
        round.nurikabeParams.maxLockedCells < round.nurikabeParams.minLockedCells
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Round ${round.roundNumber} (nurikabe) has invalid locked cell bounds`,
          path: ['nurikabeParams'],
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
