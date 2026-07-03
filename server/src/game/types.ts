// ─── Game State Machine ───────────────────────────────────────────────────────

export enum GameState {
  LOBBY = 'LOBBY',
  ROUND_INTRO = 'ROUND_INTRO',
  QUESTION_COUNTDOWN = 'QUESTION_COUNTDOWN',
  QUESTION_ACTIVE = 'QUESTION_ACTIVE',
  QUESTION_REVEAL = 'QUESTION_REVEAL',
  ROUND_RESULTS = 'ROUND_RESULTS',
  SPEED_MATH_ACTIVE = 'SPEED_MATH_ACTIVE',
  FIFTEEN_ACTIVE = 'FIFTEEN_ACTIVE',
  FLOW_CONNECT_ACTIVE = 'FLOW_CONNECT_ACTIVE',
  PIPE_ROTATION_ACTIVE = 'PIPE_ROTATION_ACTIVE',
  RUSH_HOUR_ACTIVE = 'RUSH_HOUR_ACTIVE',
  NURIKABE_ACTIVE = 'NURIKABE_ACTIVE',
  FINALE_INTRO = 'FINALE_INTRO',
  FINALE_QUESTION = 'FINALE_QUESTION',
  FINALE_REVEAL = 'FINALE_REVEAL',
  GAME_OVER = 'GAME_OVER',
}

// ─── Round & Answer Types ─────────────────────────────────────────────────────

export type RoundType =
  | 'speed_math'
  | 'fifteen'
  | 'flow_connect'
  | 'pipe_rotation'
  | 'rush_hour'
  | 'nurikabe'
  | 'pattern'
  | 'visual_spatial'
  | 'mixed_logic_fermi';
export type AnswerType = 'exact_number' | 'multiple_choice' | 'fermi' | 'text';
export type DisplayType = 'image' | 'generated';

// ─── Player ───────────────────────────────────────────────────────────────────

export interface Player {
  id: string;            // discord_id
  username: string;
  avatarUrl: string;
  score: number;
  connected: boolean;
  socketId: string | null;
}

// ─── Question & Round Configuration ──────────────────────────────────────────

export interface SpeedMathGeneratorParams {
  questionCount: number;
  operations: string[];
  maxOperandAddSub: number;
  maxOperandMulDiv: number;
  maxAnswer: number;
  allowNegativeResults: boolean;
}

export interface FifteenParams {
  winnerCount: number;
  scrambleMoves?: number;
}

export interface FlowConnectParams {
  boardSize: number;
  colorCount: number;
  winnerCount: number;
}

export interface PipeRotationParams {
  rows: number;
  cols: number;
  terminalCount: number;
  winnerCount: number;
  minDeadEnds?: number;
  minBranches?: number;
  minMisrotatedTiles?: number;
  minRotationDistance?: number;
}

export interface RushHourParams {
  size: number;
  vehicleCount: number;
  truckCount: number;
  winnerCount: number;
  scrambleMoves?: number;
  minOneCellMoves?: number;
  maxOneCellMoves?: number;
  minVehicleMoves?: number;
  maxVehicleMoves?: number;
  minExploredStates?: number;
  minTargetRowBlockers?: number;
}

export interface NurikabeParams {
  rows: number;
  cols: number;
  winnerCount: number;
  minWhiteRegions?: number;
  maxWhiteRegions?: number;
  minRegionSize?: number;
  maxRegionSize?: number;
  lockRatio?: number;
  minLockedCells?: number;
  maxLockedCells?: number;
}

export interface QuestionDisplay {
  type: DisplayType;
  src?: string;          // URL or path for image type
}

export interface QuestionConfig {
  id: string;
  text?: string;            // Optional question text displayed alongside the image
  display?: QuestionDisplay;
  answerType: AnswerType;
  options?: string[];
  correctAnswer: string | number;
  tolerance?: number;
  scoringMode?: string;
  aliases?: string[];
}

export interface CategorySource {
  categories: string[];
  questionCount: number;
  requireExactChoices?: number;
}

export interface RoundConfig {
  roundNumber: number;
  type: RoundType;
  title: string;
  description?: string;
  typeLabel?: string;
  timerSeconds: number;
  basePoints: number;
  speedBonusMax: number;
  questions?: QuestionConfig[];
  generatorParams?: SpeedMathGeneratorParams;
  fifteenParams?: FifteenParams;
  flowConnectParams?: FlowConnectParams;
  pipeRotationParams?: PipeRotationParams;
  rushHourParams?: RushHourParams;
  nurikabeParams?: NurikabeParams;
  categorySource?: CategorySource;
}

export interface FinaleConfig {
  title: string;
  timerSeconds: number;
  winCondition: number;  // first to N correct
  questions?: QuestionConfig[];
  categorySource?: CategorySource;
}

export interface GameSettings {
  hostDiscordId: string;
  finaleTopN: number;
  finaleWinCondition: number;
}

export interface GameConfig {
  gameId: string;
  settings: GameSettings;
  rounds: RoundConfig[];
  finale?: FinaleConfig;
}

// ─── Generated Questions (Speed Math) ────────────────────────────────────────

export interface GeneratedQuestion {
  id: string;
  imageDataUrl: string;  // base64 PNG
  correctAnswer: number;
}

// ─── Submissions ──────────────────────────────────────────────────────────────

export interface PlayerSubmission {
  playerId: string;
  answer: string | number;
  timestamp: number;
  questionId: string;
}

// ─── Speed Math Player State ─────────────────────────────────────────────────

export interface SpeedMathPlayerState {
  currentQuestionIndex: number;
  correctCount: number;
  completedAt: number | null;
  attempts: Map<number, number>; // questionIndex → number of attempts
}

// ─── Fifteen Player State ───────────────────────────────────────────────────

export interface FifteenPlayerState {
  completedAt: number | null;
  moveCount: number | null;
  rank: number | null;
}

// ─── Flow Connect State ─────────────────────────────────────────────────────

export interface FlowCoordinate {
  row: number;
  col: number;
}

export interface FlowEndpoint {
  color: number;
  start: FlowCoordinate;
  end: FlowCoordinate;
}

export interface FlowConnectPlayerState {
  completedAt: number | null;
  rank: number | null;
}

export interface FlowConnectRoundState {
  size: number;
  colorCount: number;
  solvedGrid: number[][];
  endpoints: FlowEndpoint[];
}

// ─── Pipe Rotation State ───────────────────────────────────────────────────

export interface PipeCoordinate {
  row: number;
  col: number;
}

export interface PipeTile {
  row: number;
  col: number;
  solvedMask: number;
  initialMask: number;
  initialRotation: number;
}

export interface PipeRotationPlayerState {
  completedAt: number | null;
  rank: number | null;
}

export interface PipeRotationRoundState {
  rows: number;
  cols: number;
  source: PipeCoordinate;
  terminals: PipeCoordinate[];
  tiles: PipeTile[];
}

// ─── Rush Hour State ────────────────────────────────────────────────────────

export type RushHourOrientation = 'H' | 'V';

export interface RushHourVehicle {
  id: string;
  row: number;
  col: number;
  length: number;
  orientation: RushHourOrientation;
  isTarget?: boolean;
}

export interface RushHourMove {
  vehicleId: string;
  delta: number;
}

export interface RushHourPlayerState {
  completedAt: number | null;
  moveCount: number | null;
  rank: number | null;
}

export interface RushHourRoundState {
  size: number;
  targetId: string;
  exitRow: number;
  vehicles: RushHourVehicle[];
  solvedVehicles: RushHourVehicle[];
  optimalMoves: number;
  optimalVehicleMoves: number;
}

// ─── Nurikabe State ─────────────────────────────────────────────────────────

export type NurikabeCellColor = 'black' | 'white';
export type NurikabeInitialCell = NurikabeCellColor | 'empty';

export interface NurikabeCoordinate {
  row: number;
  col: number;
}

export interface NurikabeClue extends NurikabeCoordinate {
  size: number;
}

export interface NurikabeLockedCell extends NurikabeCoordinate {
  color: NurikabeCellColor;
}

export interface NurikabePlayerState {
  completedAt: number | null;
  rank: number | null;
}

export interface NurikabeRoundState {
  rows: number;
  cols: number;
  solution: NurikabeCellColor[][];
  initial: NurikabeInitialCell[][];
  clues: NurikabeClue[];
  lockedCells: NurikabeLockedCell[];
}

// ─── Round State ──────────────────────────────────────────────────────────────

export interface RoundState {
  /** questionId → PlayerSubmission[] */
  submissions: Map<string, PlayerSubmission[]>;
  /** playerId → SpeedMathPlayerState (only used in speed_math rounds) */
  speedMathStates: Map<string, SpeedMathPlayerState>;
  /** Shared starting board for a fifteen round. 0 represents the empty space. */
  fifteenInitialBoard: number[] | null;
  /** playerId → FifteenPlayerState (only used in fifteen rounds) */
  fifteenStates: Map<string, FifteenPlayerState>;
  /** Generated Flow Connect puzzle for the current round. */
  flowConnectPuzzle: FlowConnectRoundState | null;
  /** playerId → FlowConnectPlayerState (only used in flow_connect rounds) */
  flowConnectStates: Map<string, FlowConnectPlayerState>;
  /** Generated Pipe Rotation puzzle for the current round. */
  pipeRotationPuzzle: PipeRotationRoundState | null;
  /** playerId → PipeRotationPlayerState (only used in pipe_rotation rounds) */
  pipeRotationStates: Map<string, PipeRotationPlayerState>;
  /** Generated Rush Hour puzzle for the current round. */
  rushHourPuzzle: RushHourRoundState | null;
  /** playerId → RushHourPlayerState (only used in rush_hour rounds) */
  rushHourStates: Map<string, RushHourPlayerState>;
  /** Generated Nurikabe puzzle for the current round. */
  nurikabePuzzle: NurikabeRoundState | null;
  /** playerId → NurikabePlayerState (only used in nurikabe rounds) */
  nurikabeStates: Map<string, NurikabePlayerState>;
}

// ─── Finale State ─────────────────────────────────────────────────────────────

export interface FinaleState {
  currentQuestionIndex: number;
  /** playerId → number of finale questions won */
  wins: Map<string, number>;
  /** questionId → PlayerSubmission[] */
  submissions: Map<string, PlayerSubmission[]>;
  finalists: string[];
  winnerId: string | null;
}

// ─── Full Engine State ────────────────────────────────────────────────────────

export interface GameEngineState {
  gameId: string;
  currentState: GameState;
  players: Map<string, Player>;
  config: GameConfig;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  roundStates: RoundState[];
  finaleState: FinaleState;
  scores: Map<string, number>;
  timerStartedAt: number | null;
  timerDurationMs: number | null;
  /** roundIndex → Map<questionId, Map<playerId, points>> */
  roundScores: Map<number, Map<string, Map<string, number>>>;
  /** Pre-generated questions keyed by round index */
  generatedQuestions: Map<number, GeneratedQuestion[]>;
  /** Pre-generated Fifteen boards keyed by round index */
  generatedFifteenBoards: Map<number, number[]>;
  /** Pre-generated Flow Connect puzzles keyed by round index */
  generatedFlowConnectPuzzles: Map<number, FlowConnectRoundState>;
  /** Pre-generated Pipe Rotation puzzles keyed by round index */
  generatedPipeRotationPuzzles: Map<number, PipeRotationRoundState>;
  /** Pre-generated Rush Hour puzzles keyed by round index */
  generatedRushHourPuzzles: Map<number, RushHourRoundState>;
  /** Pre-generated Nurikabe puzzles keyed by round index */
  generatedNurikabePuzzles: Map<number, NurikabeRoundState>;
  /** playerId → cumulative response time in ms (for tiebreaker) */
  totalResponseTimeMs: Map<string, number>;
  /** playerId → private winner verification code */
  winnerVerificationCodes: Map<string, string>;
}

// ─── Transition Actions ──────────────────────────────────────────────────────

export type TransitionAction =
  | 'start_game'
  | 'start_round'
  | 'next_question'
  | 'next_round'
  | 'start_finale'
  | 'next_finale_question'
  | 'end_game';

// ─── Leaderboard Entry ───────────────────────────────────────────────────────

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  score: number;
  totalResponseTimeMs: number;
}
