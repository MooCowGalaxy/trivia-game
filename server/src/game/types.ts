// ─── Game State Machine ───────────────────────────────────────────────────────

export enum GameState {
  LOBBY = 'LOBBY',
  ROUND_INTRO = 'ROUND_INTRO',
  QUESTION_COUNTDOWN = 'QUESTION_COUNTDOWN',
  QUESTION_ACTIVE = 'QUESTION_ACTIVE',
  QUESTION_REVEAL = 'QUESTION_REVEAL',
  ROUND_RESULTS = 'ROUND_RESULTS',
  SPEED_MATH_ACTIVE = 'SPEED_MATH_ACTIVE',
  FINALE_INTRO = 'FINALE_INTRO',
  FINALE_QUESTION = 'FINALE_QUESTION',
  FINALE_REVEAL = 'FINALE_REVEAL',
  GAME_OVER = 'GAME_OVER',
}

// ─── Round & Answer Types ─────────────────────────────────────────────────────

export type RoundType = 'speed_math' | 'pattern' | 'visual_spatial' | 'mixed_logic_fermi';
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

// ─── Round State ──────────────────────────────────────────────────────────────

export interface RoundState {
  /** questionId → PlayerSubmission[] */
  submissions: Map<string, PlayerSubmission[]>;
  /** playerId → SpeedMathPlayerState (only used in speed_math rounds) */
  speedMathStates: Map<string, SpeedMathPlayerState>;
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
  /** playerId → cumulative response time in ms (for tiebreaker) */
  totalResponseTimeMs: Map<string, number>;
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
