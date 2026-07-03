import { randomBytes } from 'node:crypto';
import {
  GameState,
} from './types.js';
import type {
  GameConfig,
  GameEngineState,
  GeneratedQuestion,
  FlowConnectRoundState,
  NurikabeRoundState,
  PipeRotationRoundState,
  Player,
  PlayerSubmission,
  RushHourRoundState,
  RoundConfig,
  RoundState,
  QuestionConfig,
  FinaleState,
  LeaderboardEntry,
  TransitionAction,
} from './types.js';
import {
  scoreStandardRound,
  scoreSpeedMathRound,
  scoreFifteenRound,
  scoreFlowConnectRound,
  scorePipeRotationRound,
  scoreRushHourRound,
  scoreNurikabeRound,
  scoreFermiQuestion,
  checkFinaleAnswer,
} from './scoring.js';
import {
  decodePackedFifteenMoves,
  verifyFifteenSolve,
} from './fifteen.js';
import {
  verifyFlowConnectSolution,
} from './flowConnect.js';
import type {
  FlowConnectSubmittedPath,
} from './flowConnect.js';
import {
  verifyPipeRotationSolution,
} from './pipeRotation.js';
import {
  verifyRushHourSolve,
} from './rushHour.js';
import type {
  RushHourMove,
} from './rushHour.js';
import {
  verifyRegionSizeSolution,
} from './regionSize.js';
import type {
  RegionSizeColor,
} from './regionSize.js';

// ─── Broadcast base type (shared state computed once per broadcast) ──────────

export interface BroadcastBase {
  gameId: string;
  hostDiscordId: string;
  currentState: GameState;
  players: Array<{
    id: string;
    username: string;
    avatarUrl: string;
    score: number;
    connected: boolean;
  }>;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  currentRound: {
    roundNumber: number;
    type: string;
    title: string;
    description?: string;
    typeLabel?: string;
    timerSeconds: number;
  } | null;
  fifteenState: {
    initialBoard: number[];
    completed: boolean;
    completedCount: number;
    winnerCount: number;
    totalPlayers: number;
  } | null;
  flowConnectState: {
    size: number;
    colorCount: number;
    endpoints: Array<{
      color: number;
      start: { row: number; col: number };
      end: { row: number; col: number };
    }>;
    completed: boolean;
    completedCount: number;
    winnerCount: number;
    totalPlayers: number;
  } | null;
  pipeRotationState: {
    rows: number;
    cols: number;
    source: { row: number; col: number };
    terminals: Array<{ row: number; col: number }>;
    tiles: Array<{ row: number; col: number; initialMask: number }>;
    requireFullSolve: boolean;
    completed: boolean;
    completedCount: number;
    winnerCount: number;
    totalPlayers: number;
  } | null;
  rushHourState: {
    size: number;
    targetId: string;
    exitRow: number;
    vehicles: Array<{
      id: string;
      row: number;
      col: number;
      length: number;
      orientation: 'H' | 'V';
      isTarget?: boolean;
    }>;
    completed: boolean;
    completedCount: number;
    winnerCount: number;
    totalPlayers: number;
    optimalMoves: number;
    optimalVehicleMoves: number;
  } | null;
  nurikabeState: {
    rows: number;
    cols: number;
    initial: Array<Array<'black' | 'white' | 'empty'>>;
    clues: Array<{ row: number; col: number; size: number }>;
    lockedCells: Array<{ row: number; col: number; color: 'black' | 'white' }>;
    completed: boolean;
    completedCount: number;
    winnerCount: number;
    totalPlayers: number;
  } | null;
  currentQuestion: {
    id: string;
    display?: { type: string; src?: string };
    answerType: string;
    options?: string[];
  } | null;
  timerRemainingMs: number | null;
  progressBar: { completed: number; total: number };
  finaleState: {
    currentQuestionIndex: number;
    wins: Record<string, number>;
    finalists: string[];
    winnerId: string | null;
  } | null;
  questionImageData: string | null;
  questionText: string | null;
  questionAnswerType: string | null;
  questionOptions: string[] | null;
  questionTimerSeconds: number | null;
  revealAnswer: string | number | null;
  winnerVerification: { code: string; rank: number } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function freshRoundState(): RoundState {
  return {
    submissions: new Map(),
    speedMathStates: new Map(),
    fifteenInitialBoard: null,
    fifteenStates: new Map(),
    flowConnectPuzzle: null,
    flowConnectStates: new Map(),
    pipeRotationPuzzle: null,
    pipeRotationStates: new Map(),
    rushHourPuzzle: null,
    rushHourStates: new Map(),
    nurikabePuzzle: null,
    nurikabeStates: new Map(),
  };
}

function freshFinaleState(finalistIds: string[] = []): FinaleState {
  return {
    currentQuestionIndex: 0,
    wins: new Map(),
    submissions: new Map(),
    finalists: finalistIds,
    winnerId: null,
  };
}

function normalizeUsernameForComparison(username: string): string {
  return username.trim().toLowerCase();
}

function makeWinnerVerificationCode(): string {
  return randomBytes(4).toString('hex');
}

function cloneFlowConnectPuzzle(puzzle: FlowConnectRoundState): FlowConnectRoundState {
  return {
    size: puzzle.size,
    colorCount: puzzle.colorCount,
    solvedGrid: puzzle.solvedGrid.map((row) => [...row]),
    endpoints: puzzle.endpoints.map((endpoint) => ({
      color: endpoint.color,
      start: { ...endpoint.start },
      end: { ...endpoint.end },
    })),
  };
}

function clonePipeRotationPuzzle(puzzle: PipeRotationRoundState): PipeRotationRoundState {
  return {
    rows: puzzle.rows,
    cols: puzzle.cols,
    source: { ...puzzle.source },
    terminals: puzzle.terminals.map((terminal) => ({ ...terminal })),
    tiles: puzzle.tiles.map((tile) => ({ ...tile })),
    requireFullSolve: puzzle.requireFullSolve,
  };
}

function cloneRushHourPuzzle(puzzle: RushHourRoundState): RushHourRoundState {
  return {
    size: puzzle.size,
    targetId: puzzle.targetId,
    exitRow: puzzle.exitRow,
    vehicles: puzzle.vehicles.map((vehicle) => ({ ...vehicle })),
    solvedVehicles: puzzle.solvedVehicles.map((vehicle) => ({ ...vehicle })),
    optimalMoves: puzzle.optimalMoves,
    optimalVehicleMoves: puzzle.optimalVehicleMoves,
  };
}

function cloneNurikabePuzzle(puzzle: NurikabeRoundState): NurikabeRoundState {
  return {
    rows: puzzle.rows,
    cols: puzzle.cols,
    solution: puzzle.solution.map((row) => [...row]),
    initial: puzzle.initial.map((row) => [...row]),
    clues: puzzle.clues.map((clue) => ({ ...clue })),
    lockedCells: puzzle.lockedCells.map((cell) => ({ ...cell })),
  };
}

// ─── Game Engine ─────────────────────────────────────────────────────────────

export class GameEngine {
  private state: GameEngineState;

  constructor(
    config: GameConfig,
    generatedQuestions?: Map<number, GeneratedQuestion[]>,
    generatedFifteenBoards?: Map<number, number[]>,
    generatedFlowConnectPuzzles?: Map<number, FlowConnectRoundState>,
    generatedPipeRotationPuzzles?: Map<number, PipeRotationRoundState>,
    generatedRushHourPuzzles?: Map<number, RushHourRoundState>,
    generatedNurikabePuzzles?: Map<number, NurikabeRoundState>,
  ) {
    this.state = {
      gameId: config.gameId,
      currentState: GameState.LOBBY,
      players: new Map(),
      config,
      currentRoundIndex: 0,
      currentQuestionIndex: 0,
      roundStates: config.rounds.map(() => freshRoundState()),
      finaleState: freshFinaleState(),
      scores: new Map(),
      timerStartedAt: null,
      timerDurationMs: null,
      roundScores: new Map(),
      generatedQuestions: generatedQuestions ?? new Map(),
      generatedFifteenBoards: generatedFifteenBoards ?? new Map(),
      generatedFlowConnectPuzzles: generatedFlowConnectPuzzles ?? new Map(),
      generatedPipeRotationPuzzles: generatedPipeRotationPuzzles ?? new Map(),
      generatedRushHourPuzzles: generatedRushHourPuzzles ?? new Map(),
      generatedNurikabePuzzles: generatedNurikabePuzzles ?? new Map(),
      totalResponseTimeMs: new Map(),
      winnerVerificationCodes: new Map(),
    };
  }

  // ── Player Management ──────────────────────────────────────────────────

  addPlayer(id: string, username: string, avatarUrl: string): Player {
    const existing = this.state.players.get(id);
    if (existing) {
      // Player already exists — reconnect them
      existing.connected = true;
      existing.username = username;
      existing.avatarUrl = avatarUrl;
      return existing;
    }

    const normalizedUsername = normalizeUsernameForComparison(username);
    for (const [otherId, player] of this.state.players) {
      if (
        otherId !== id &&
        normalizeUsernameForComparison(player.username) === normalizedUsername
      ) {
        throw new Error('That username is already in the game');
      }
    }

    const player: Player = {
      id,
      username,
      avatarUrl,
      score: 0,
      connected: true,
      socketId: null,
    };
    this.state.players.set(id, player);
    this.state.scores.set(id, 0);

    // If joining during an active speed math round, init their state
    if (this.state.currentState === GameState.SPEED_MATH_ACTIVE) {
      const roundState = this.getCurrentRoundState();
      roundState.speedMathStates.set(id, {
        currentQuestionIndex: 0,
        correctCount: 0,
        completedAt: null,
        attempts: new Map(),
      });
    } else if (this.state.currentState === GameState.FIFTEEN_ACTIVE) {
      const roundState = this.getCurrentRoundState();
      roundState.fifteenStates.set(id, {
        completedAt: null,
        moveCount: null,
        rank: null,
      });
    } else if (this.state.currentState === GameState.FLOW_CONNECT_ACTIVE) {
      const roundState = this.getCurrentRoundState();
      roundState.flowConnectStates.set(id, {
        completedAt: null,
        rank: null,
      });
    } else if (this.state.currentState === GameState.PIPE_ROTATION_ACTIVE) {
      const roundState = this.getCurrentRoundState();
      roundState.pipeRotationStates.set(id, {
        completedAt: null,
        rank: null,
      });
    } else if (this.state.currentState === GameState.RUSH_HOUR_ACTIVE) {
      const roundState = this.getCurrentRoundState();
      roundState.rushHourStates.set(id, {
        completedAt: null,
        moveCount: null,
        rank: null,
      });
    } else if (this.state.currentState === GameState.NURIKABE_ACTIVE) {
      const roundState = this.getCurrentRoundState();
      roundState.nurikabeStates.set(id, {
        completedAt: null,
        rank: null,
      });
    }

    return player;
  }

  isUsernameInUse(normalizedUsername: string): boolean {
    const normalized = normalizeUsernameForComparison(normalizedUsername);
    for (const player of this.state.players.values()) {
      if (normalizeUsernameForComparison(player.username) === normalized) {
        return true;
      }
    }
    return false;
  }

  kickPlayer(id: string): { ok: boolean; reason?: string; player?: Player } {
    if (id === this.state.config.settings.hostDiscordId) {
      return { ok: false, reason: 'Cannot kick the host' };
    }

    const player = this.state.players.get(id);
    if (!player) {
      return { ok: false, reason: 'Unknown player' };
    }

    this.removePlayerEverywhere(id);
    return { ok: true, player };
  }

  /**
   * Fully removes a player from the game (lobby toggle to spectate).
   * Only allowed during LOBBY.
   */
  dropPlayer(id: string): boolean {
    if (this.state.currentState !== GameState.LOBBY) {
      return false;
    }
    this.state.players.delete(id);
    this.state.scores.delete(id);
    this.state.totalResponseTimeMs.delete(id);
    return true;
  }

  removePlayer(id: string): void {
    const player = this.state.players.get(id);
    if (player) {
      player.connected = false;
      player.socketId = null;
    }
  }

  reconnectPlayer(id: string, socketId: string): Player | null {
    const player = this.state.players.get(id);
    if (!player) return null;
    player.connected = true;
    player.socketId = socketId;
    return player;
  }

  // ── State Transitions ──────────────────────────────────────────────────

  transition(action: TransitionAction, hostId: string): void {
    this.assertHost(hostId);

    switch (action) {
      case 'start_game':
        this.assertState(GameState.LOBBY);
        this.setState(GameState.ROUND_INTRO);
        break;

      case 'start_round':
        this.assertState(GameState.ROUND_INTRO);
        this.state.currentQuestionIndex = 0;
        this.initRoundState();
        if (this.getCurrentRoundConfig().type === 'speed_math') {
          this.initSpeedMathStates();
          this.startTimer(this.getCurrentRoundConfig().timerSeconds * 1000);
          this.setState(GameState.SPEED_MATH_ACTIVE);
        } else if (this.getCurrentRoundConfig().type === 'fifteen') {
          this.initFifteenRound();
          this.startTimer(this.getCurrentRoundConfig().timerSeconds * 1000);
          this.setState(GameState.FIFTEEN_ACTIVE);
        } else if (this.getCurrentRoundConfig().type === 'flow_connect') {
          this.initFlowConnectRound();
          this.startTimer(this.getCurrentRoundConfig().timerSeconds * 1000);
          this.setState(GameState.FLOW_CONNECT_ACTIVE);
        } else if (this.getCurrentRoundConfig().type === 'pipe_rotation') {
          this.initPipeRotationRound();
          this.startTimer(this.getCurrentRoundConfig().timerSeconds * 1000);
          this.setState(GameState.PIPE_ROTATION_ACTIVE);
        } else if (this.getCurrentRoundConfig().type === 'rush_hour') {
          this.initRushHourRound();
          this.startTimer(this.getCurrentRoundConfig().timerSeconds * 1000);
          this.setState(GameState.RUSH_HOUR_ACTIVE);
        } else if (this.getCurrentRoundConfig().type === 'nurikabe') {
          this.initNurikabeRound();
          this.startTimer(this.getCurrentRoundConfig().timerSeconds * 1000);
          this.setState(GameState.NURIKABE_ACTIVE);
        } else {
          // Go to countdown first, then QUESTION_ACTIVE after countdown expires
          this.startTimer(3000); // 3 second countdown
          this.setState(GameState.QUESTION_COUNTDOWN);
        }
        break;

      case 'next_question': {
        this.assertState(GameState.QUESTION_REVEAL);
        const round = this.getCurrentRoundConfig();
        const questions = round.questions ?? [];
        if (this.state.currentQuestionIndex < questions.length - 1) {
          this.state.currentQuestionIndex++;
          // Go to countdown first
          this.startTimer(3000);
          this.setState(GameState.QUESTION_COUNTDOWN);
        } else {
          // Last question — go to round results
          this.setState(GameState.ROUND_RESULTS);
        }
        break;
      }

      case 'next_round': {
        this.assertState(GameState.ROUND_RESULTS);
        if (this.state.currentRoundIndex < this.state.config.rounds.length - 1) {
          this.state.currentRoundIndex++;
          this.state.currentQuestionIndex = 0;
          this.setState(GameState.ROUND_INTRO);
        } else if (this.state.config.finale) {
          // All rounds done → finale. Pre-populate finalists so FINALE_INTRO can display them.
          const finalists = this.getFinalists().map((e) => e.playerId);
          this.state.finaleState = freshFinaleState(finalists);
          this.setState(GameState.FINALE_INTRO);
        } else {
          // No finale configured → game over
          this.setState(GameState.GAME_OVER);
        }
        break;
      }

      case 'start_finale': {
        this.assertState(GameState.FINALE_INTRO);
        if (!this.state.config.finale) throw new Error('No finale configured');
        const finalists = this.getFinalists().map((e) => e.playerId);
        this.state.finaleState = freshFinaleState(finalists);
        this.startTimer(this.state.config.finale.timerSeconds * 1000);
        this.setState(GameState.FINALE_QUESTION);
        break;
      }

      case 'next_finale_question': {
        this.assertState(GameState.FINALE_REVEAL);
        const finale = this.state.config.finale;
        if (!finale) throw new Error('No finale configured');
        if (
          this.state.finaleState.currentQuestionIndex < (finale.questions ?? []).length - 1 &&
          this.state.finaleState.winnerId === null
        ) {
          this.state.finaleState.currentQuestionIndex++;
          this.startTimer(finale.timerSeconds * 1000);
          this.setState(GameState.FINALE_QUESTION);
        } else {
          this.setState(GameState.GAME_OVER);
        }
        break;
      }

      case 'end_game':
        this.setState(GameState.GAME_OVER);
        break;

      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown action: ${_exhaustive as string}`);
      }
    }
  }

  // ── Answer Submission (Standard / Pattern / Visual / Logic) ────────────

  submitAnswer(
    playerId: string,
    questionId: string,
    answer: string | number,
  ): { accepted: boolean; reason?: string } {
    if (
      this.state.currentState !== GameState.QUESTION_ACTIVE &&
      this.state.currentState !== GameState.FINALE_QUESTION
    ) {
      return { accepted: false, reason: 'Not accepting answers in current state' };
    }

    if (!this.state.players.has(playerId)) {
      return { accepted: false, reason: 'Unknown player' };
    }

    // Check timer
    if (this.isTimerExpired()) {
      return { accepted: false, reason: 'Timer has expired' };
    }

    // Determine submission store
    const submissionStore =
      this.state.currentState === GameState.FINALE_QUESTION
        ? this.state.finaleState.submissions
        : this.getCurrentRoundState().submissions;

    // Check for duplicate
    const existing = submissionStore.get(questionId) ?? [];
    if (existing.some((s) => s.playerId === playerId)) {
      return { accepted: false, reason: 'Already submitted for this question' };
    }

    // In finale, only finalists may answer
    if (this.state.currentState === GameState.FINALE_QUESTION) {
      if (!this.state.finaleState.finalists.includes(playerId)) {
        return { accepted: false, reason: 'Player is not a finalist' };
      }
    }

    const submission: PlayerSubmission = {
      playerId,
      answer,
      timestamp: Date.now(),
      questionId,
    };

    existing.push(submission);
    submissionStore.set(questionId, existing);

    return { accepted: true };
  }

  // ── Answer Submission (Speed Math) ─────────────────────────────────────

  submitSpeedMathAnswer(
    playerId: string,
    questionIndex: number,
    answer: number,
  ): { correct: boolean; nextIndex: number | null; completed: boolean } {
    if (this.state.currentState !== GameState.SPEED_MATH_ACTIVE) {
      throw new Error('Speed math is not active');
    }

    if (this.isTimerExpired()) {
      throw new Error('Timer has expired');
    }

    const roundState = this.getCurrentRoundState();
    const playerState = roundState.speedMathStates.get(playerId);
    if (!playerState) {
      throw new Error('Player not found in speed math state');
    }

    if (playerState.completedAt !== null) {
      throw new Error('Player already completed all questions');
    }

    // Validate that the submitted question index matches the player's current position
    if (questionIndex !== playerState.currentQuestionIndex) {
      throw new Error(`Expected question index ${playerState.currentQuestionIndex}, got ${questionIndex}`);
    }

    // Record attempt
    const attempts = playerState.attempts.get(questionIndex) ?? 0;
    playerState.attempts.set(questionIndex, attempts + 1);

    // Get correct answer from generated questions
    const generatedQs = this.state.generatedQuestions.get(this.state.currentRoundIndex);
    if (!generatedQs) {
      throw new Error('No generated questions for this round');
    }

    const question = generatedQs[questionIndex];
    if (!question) {
      throw new Error(`Invalid question index: ${questionIndex}`);
    }

    const correct = Number(answer) === question.correctAnswer;

    if (correct) {
      playerState.correctCount++;
      playerState.currentQuestionIndex = questionIndex + 1;

      // Check if player has completed all questions
      if (playerState.currentQuestionIndex >= generatedQs.length) {
        playerState.completedAt = Date.now();
        return { correct: true, nextIndex: null, completed: true };
      }

      return {
        correct: true,
        nextIndex: playerState.currentQuestionIndex,
        completed: false,
      };
    }

    return { correct: false, nextIndex: questionIndex, completed: false };
  }

  // ── Solve Submission (Fifteen) ─────────────────────────────────────────

  submitFifteenSolve(
    playerId: string,
    movesBase64: string,
    moveCount: number,
  ): { accepted: boolean; reason?: string; completedCount: number; winnerCount: number } {
    if (this.state.currentState !== GameState.FIFTEEN_ACTIVE) {
      return {
        accepted: false,
        reason: 'Fifteen is not active',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    if (!this.state.players.has(playerId)) {
      return {
        accepted: false,
        reason: 'Unknown player',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    if (this.isTimerExpired()) {
      return {
        accepted: false,
        reason: 'Timer has expired',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    if (moveCount > 8192) {
      return {
        accepted: false,
        reason: 'Too many moves',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    const roundState = this.getCurrentRoundState();
    const playerState = roundState.fifteenStates.get(playerId);
    if (!playerState) {
      return {
        accepted: false,
        reason: 'Player not found in Fifteen state',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    if (playerState.completedAt !== null) {
      return {
        accepted: false,
        reason: 'Player already completed the puzzle',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    const initialBoard = roundState.fifteenInitialBoard;
    if (!initialBoard) {
      return {
        accepted: false,
        reason: 'No Fifteen board for this round',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    let moves: number[];
    try {
      moves = decodePackedFifteenMoves(movesBase64, moveCount);
    } catch (err) {
      return {
        accepted: false,
        reason: err instanceof Error ? err.message : String(err),
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    const verification = verifyFifteenSolve(initialBoard, moves);
    if (!verification.valid) {
      return {
        accepted: false,
        reason: verification.reason ?? 'Invalid solve',
        completedCount: this.getFifteenCompletedCount(),
        winnerCount: this.getFifteenWinnerCount(),
      };
    }

    const rank = this.getFifteenCompletedCount() + 1;
    playerState.completedAt = Date.now();
    playerState.moveCount = moveCount;
    playerState.rank = rank;

    return {
      accepted: true,
      completedCount: this.getFifteenCompletedCount(),
      winnerCount: this.getFifteenWinnerCount(),
    };
  }

  // ── Solve Submission (Flow Connect) ────────────────────────────────────

  submitFlowConnectSolve(
    playerId: string,
    paths: FlowConnectSubmittedPath[],
  ): { accepted: boolean; reason?: string; completedCount: number; winnerCount: number } {
    if (this.state.currentState !== GameState.FLOW_CONNECT_ACTIVE) {
      return {
        accepted: false,
        reason: 'Flow Connect is not active',
        completedCount: this.getFlowConnectCompletedCount(),
        winnerCount: this.getFlowConnectWinnerCount(),
      };
    }

    if (!this.state.players.has(playerId)) {
      return {
        accepted: false,
        reason: 'Unknown player',
        completedCount: this.getFlowConnectCompletedCount(),
        winnerCount: this.getFlowConnectWinnerCount(),
      };
    }

    if (this.isTimerExpired()) {
      return {
        accepted: false,
        reason: 'Timer has expired',
        completedCount: this.getFlowConnectCompletedCount(),
        winnerCount: this.getFlowConnectWinnerCount(),
      };
    }

    const roundState = this.getCurrentRoundState();
    const playerState = roundState.flowConnectStates.get(playerId);
    if (!playerState) {
      return {
        accepted: false,
        reason: 'Player not found in Flow Connect state',
        completedCount: this.getFlowConnectCompletedCount(),
        winnerCount: this.getFlowConnectWinnerCount(),
      };
    }

    if (playerState.completedAt !== null) {
      return {
        accepted: false,
        reason: 'Player already completed the puzzle',
        completedCount: this.getFlowConnectCompletedCount(),
        winnerCount: this.getFlowConnectWinnerCount(),
      };
    }

    const puzzle = roundState.flowConnectPuzzle;
    if (!puzzle) {
      return {
        accepted: false,
        reason: 'No Flow Connect puzzle for this round',
        completedCount: this.getFlowConnectCompletedCount(),
        winnerCount: this.getFlowConnectWinnerCount(),
      };
    }

    const verification = verifyFlowConnectSolution(
      paths,
      puzzle.endpoints,
      puzzle.size,
      puzzle.colorCount,
    );
    if (!verification.valid) {
      return {
        accepted: false,
        reason: verification.reason ?? 'Invalid solve',
        completedCount: this.getFlowConnectCompletedCount(),
        winnerCount: this.getFlowConnectWinnerCount(),
      };
    }

    const rank = this.getFlowConnectCompletedCount() + 1;
    playerState.completedAt = Date.now();
    playerState.rank = rank;

    return {
      accepted: true,
      completedCount: this.getFlowConnectCompletedCount(),
      winnerCount: this.getFlowConnectWinnerCount(),
    };
  }

  // ── Solve Submission (Pipe Rotation) ───────────────────────────────────

  submitPipeRotationSolve(
    playerId: string,
    masks: number[],
  ): { accepted: boolean; reason?: string; completedCount: number; winnerCount: number } {
    if (this.state.currentState !== GameState.PIPE_ROTATION_ACTIVE) {
      return {
        accepted: false,
        reason: 'Pipe Rotation is not active',
        completedCount: this.getPipeRotationCompletedCount(),
        winnerCount: this.getPipeRotationWinnerCount(),
      };
    }

    if (!this.state.players.has(playerId)) {
      return {
        accepted: false,
        reason: 'Unknown player',
        completedCount: this.getPipeRotationCompletedCount(),
        winnerCount: this.getPipeRotationWinnerCount(),
      };
    }

    if (this.isTimerExpired()) {
      return {
        accepted: false,
        reason: 'Timer has expired',
        completedCount: this.getPipeRotationCompletedCount(),
        winnerCount: this.getPipeRotationWinnerCount(),
      };
    }

    const roundState = this.getCurrentRoundState();
    const playerState = roundState.pipeRotationStates.get(playerId);
    if (!playerState) {
      return {
        accepted: false,
        reason: 'Player not found in Pipe Rotation state',
        completedCount: this.getPipeRotationCompletedCount(),
        winnerCount: this.getPipeRotationWinnerCount(),
      };
    }
    if (playerState.completedAt !== null) {
      return {
        accepted: false,
        reason: 'Player already completed the puzzle',
        completedCount: this.getPipeRotationCompletedCount(),
        winnerCount: this.getPipeRotationWinnerCount(),
      };
    }

    const puzzle = roundState.pipeRotationPuzzle;
    if (!puzzle) {
      return {
        accepted: false,
        reason: 'No Pipe Rotation puzzle for this round',
        completedCount: this.getPipeRotationCompletedCount(),
        winnerCount: this.getPipeRotationWinnerCount(),
      };
    }

    const verification = verifyPipeRotationSolution(
      puzzle.rows,
      puzzle.cols,
      puzzle.source,
      puzzle.terminals,
      masks,
      puzzle.requireFullSolve,
    );
    if (!verification.valid) {
      return {
        accepted: false,
        reason: verification.reason ?? 'Invalid solve',
        completedCount: this.getPipeRotationCompletedCount(),
        winnerCount: this.getPipeRotationWinnerCount(),
      };
    }

    const rank = this.getPipeRotationCompletedCount() + 1;
    playerState.completedAt = Date.now();
    playerState.rank = rank;

    return {
      accepted: true,
      completedCount: this.getPipeRotationCompletedCount(),
      winnerCount: this.getPipeRotationWinnerCount(),
    };
  }

  // ── Solve Submission (Rush Hour) ───────────────────────────────────────

  submitRushHourSolve(
    playerId: string,
    moves: RushHourMove[],
  ): { accepted: boolean; reason?: string; completedCount: number; winnerCount: number } {
    if (this.state.currentState !== GameState.RUSH_HOUR_ACTIVE) {
      return {
        accepted: false,
        reason: 'Rush Hour is not active',
        completedCount: this.getRushHourCompletedCount(),
        winnerCount: this.getRushHourWinnerCount(),
      };
    }

    if (!this.state.players.has(playerId)) {
      return {
        accepted: false,
        reason: 'Unknown player',
        completedCount: this.getRushHourCompletedCount(),
        winnerCount: this.getRushHourWinnerCount(),
      };
    }

    if (this.isTimerExpired()) {
      return {
        accepted: false,
        reason: 'Timer has expired',
        completedCount: this.getRushHourCompletedCount(),
        winnerCount: this.getRushHourWinnerCount(),
      };
    }

    const roundState = this.getCurrentRoundState();
    const playerState = roundState.rushHourStates.get(playerId);
    if (!playerState) {
      return {
        accepted: false,
        reason: 'Player not found in Rush Hour state',
        completedCount: this.getRushHourCompletedCount(),
        winnerCount: this.getRushHourWinnerCount(),
      };
    }
    if (playerState.completedAt !== null) {
      return {
        accepted: false,
        reason: 'Player already completed the puzzle',
        completedCount: this.getRushHourCompletedCount(),
        winnerCount: this.getRushHourWinnerCount(),
      };
    }

    const puzzle = roundState.rushHourPuzzle;
    if (!puzzle) {
      return {
        accepted: false,
        reason: 'No Rush Hour puzzle for this round',
        completedCount: this.getRushHourCompletedCount(),
        winnerCount: this.getRushHourWinnerCount(),
      };
    }

    const verification = verifyRushHourSolve(puzzle.vehicles, puzzle.size, moves);
    if (!verification.valid) {
      return {
        accepted: false,
        reason: verification.reason ?? 'Invalid solve',
        completedCount: this.getRushHourCompletedCount(),
        winnerCount: this.getRushHourWinnerCount(),
      };
    }

    const rank = this.getRushHourCompletedCount() + 1;
    playerState.completedAt = Date.now();
    playerState.moveCount = verification.moveCount ?? moves.length;
    playerState.rank = rank;

    return {
      accepted: true,
      completedCount: this.getRushHourCompletedCount(),
      winnerCount: this.getRushHourWinnerCount(),
    };
  }

  // ── Solve Submission (Nurikabe) ────────────────────────────────────────

  submitNurikabeSolve(
    playerId: string,
    board: RegionSizeColor[][],
  ): { accepted: boolean; reason?: string; completedCount: number; winnerCount: number } {
    if (this.state.currentState !== GameState.NURIKABE_ACTIVE) {
      return {
        accepted: false,
        reason: 'Nurikabe is not active',
        completedCount: this.getNurikabeCompletedCount(),
        winnerCount: this.getNurikabeWinnerCount(),
      };
    }

    if (!this.state.players.has(playerId)) {
      return {
        accepted: false,
        reason: 'Unknown player',
        completedCount: this.getNurikabeCompletedCount(),
        winnerCount: this.getNurikabeWinnerCount(),
      };
    }

    if (this.isTimerExpired()) {
      return {
        accepted: false,
        reason: 'Timer has expired',
        completedCount: this.getNurikabeCompletedCount(),
        winnerCount: this.getNurikabeWinnerCount(),
      };
    }

    const roundState = this.getCurrentRoundState();
    const playerState = roundState.nurikabeStates.get(playerId);
    if (!playerState) {
      return {
        accepted: false,
        reason: 'Player not found in Nurikabe state',
        completedCount: this.getNurikabeCompletedCount(),
        winnerCount: this.getNurikabeWinnerCount(),
      };
    }
    if (playerState.completedAt !== null) {
      return {
        accepted: false,
        reason: 'Player already completed the puzzle',
        completedCount: this.getNurikabeCompletedCount(),
        winnerCount: this.getNurikabeWinnerCount(),
      };
    }

    const puzzle = roundState.nurikabePuzzle;
    if (!puzzle) {
      return {
        accepted: false,
        reason: 'No Nurikabe puzzle for this round',
        completedCount: this.getNurikabeCompletedCount(),
        winnerCount: this.getNurikabeWinnerCount(),
      };
    }

    const verification = verifyRegionSizeSolution(
      puzzle.rows,
      puzzle.cols,
      puzzle.clues,
      puzzle.lockedCells,
      board,
    );
    if (!verification.valid) {
      return {
        accepted: false,
        reason: verification.reason ?? 'Invalid solve',
        completedCount: this.getNurikabeCompletedCount(),
        winnerCount: this.getNurikabeWinnerCount(),
      };
    }

    const rank = this.getNurikabeCompletedCount() + 1;
    playerState.completedAt = Date.now();
    playerState.rank = rank;

    return {
      accepted: true,
      completedCount: this.getNurikabeCompletedCount(),
      winnerCount: this.getNurikabeWinnerCount(),
    };
  }

  // ── Timer Expiry ───────────────────────────────────────────────────────

  endTimer(): void {
    const timerStartedAt = this.state.timerStartedAt;
    const timerDurationMs = this.state.timerDurationMs;
    this.state.timerStartedAt = null;
    this.state.timerDurationMs = null;

    switch (this.state.currentState) {
      case GameState.QUESTION_COUNTDOWN:
        // Countdown finished → start the actual question timer
        this.startTimer(this.getCurrentRoundConfig().timerSeconds * 1000);
        this.setState(GameState.QUESTION_ACTIVE);
        break;

      case GameState.QUESTION_ACTIVE:
        this.scoreCurrentQuestion(timerStartedAt);
        this.setState(GameState.QUESTION_REVEAL);
        break;

      case GameState.SPEED_MATH_ACTIVE:
        this.scoreSpeedMathRound(timerStartedAt, timerDurationMs);
        this.setState(GameState.ROUND_RESULTS);
        break;

      case GameState.FIFTEEN_ACTIVE:
        this.scoreFifteenRound(timerStartedAt, timerDurationMs);
        this.setState(GameState.ROUND_RESULTS);
        break;

      case GameState.FLOW_CONNECT_ACTIVE:
        this.scoreFlowConnectRound(timerStartedAt, timerDurationMs);
        this.setState(GameState.ROUND_RESULTS);
        break;

      case GameState.PIPE_ROTATION_ACTIVE:
        this.scorePipeRotationRound(timerStartedAt, timerDurationMs);
        this.setState(GameState.ROUND_RESULTS);
        break;

      case GameState.RUSH_HOUR_ACTIVE:
        this.scoreRushHourRound(timerStartedAt, timerDurationMs);
        this.setState(GameState.ROUND_RESULTS);
        break;

      case GameState.NURIKABE_ACTIVE:
        this.scoreNurikabeRound(timerStartedAt, timerDurationMs);
        this.setState(GameState.ROUND_RESULTS);
        break;

      case GameState.FINALE_QUESTION:
        this.scoreFinaleQuestion();
        this.setState(GameState.FINALE_REVEAL);
        break;

      default:
        // Timer expired in a state that doesn't need handling — ignore
        break;
    }
  }

  // ── Scoring Helpers ────────────────────────────────────────────────────

  private scoreCurrentQuestion(timerStartedAt: number | null): void {
    const round = this.getCurrentRoundConfig();
    const question = this.getCurrentQuestion();
    if (!question) return;

    const roundState = this.getCurrentRoundState();
    const submissions = roundState.submissions.get(question.id) ?? [];

    let questionScores: Map<string, number>;

    if (question.scoringMode === 'fermi' || question.answerType === 'fermi') {
      questionScores = scoreFermiQuestion(
        submissions,
        typeof question.correctAnswer === 'number'
          ? question.correctAnswer
          : Number(question.correctAnswer),
        round.basePoints,
        round.speedBonusMax,
      );
    } else {
      questionScores = scoreStandardRound(
        submissions,
        question.correctAnswer,
        round.basePoints,
        round.speedBonusMax,
      );
    }

    this.applyScores(questionScores, question.id);

    // Track response times for tiebreaker
    if (timerStartedAt !== null) {
      for (const sub of submissions) {
        const responseTime = sub.timestamp - timerStartedAt;
        const current = this.state.totalResponseTimeMs.get(sub.playerId) ?? 0;
        this.state.totalResponseTimeMs.set(sub.playerId, current + responseTime);
      }
    }
  }

  private scoreSpeedMathRound(timerStartedAt: number | null, timerDurationMs: number | null): void {
    const round = this.getCurrentRoundConfig();
    const roundState = this.getCurrentRoundState();
    const generatedQs = this.state.generatedQuestions.get(this.state.currentRoundIndex);
    const totalQuestions =
      generatedQs?.length ?? round.generatorParams?.questionCount ?? 0;

    const questionScores = scoreSpeedMathRound(
      roundState.speedMathStates,
      round.basePoints,
      round.speedBonusMax,
      totalQuestions,
    );

    // Apply using a synthetic questionId
    this.applyScores(questionScores, `speed_math_round_${this.state.currentRoundIndex}`);

    // Track response times for tiebreaker
    if (timerStartedAt !== null) {
      for (const [playerId, playerState] of roundState.speedMathStates) {
        const responseTime = playerState.completedAt !== null
          ? playerState.completedAt - timerStartedAt
          : (timerDurationMs ?? 0);
        const current = this.state.totalResponseTimeMs.get(playerId) ?? 0;
        this.state.totalResponseTimeMs.set(playerId, current + responseTime);
      }
    }
  }

  private scoreFifteenRound(timerStartedAt: number | null, timerDurationMs: number | null): void {
    const round = this.getCurrentRoundConfig();
    const roundState = this.getCurrentRoundState();
    const winnerCount = this.getFifteenWinnerCount();

    const questionScores = scoreFifteenRound(
      roundState.fifteenStates,
      round.basePoints,
      round.speedBonusMax,
      winnerCount,
    );

    this.applyScores(questionScores, this.getFifteenRoundId());

    if (timerStartedAt !== null) {
      for (const [playerId, playerState] of roundState.fifteenStates) {
        const responseTime = playerState.completedAt !== null
          ? playerState.completedAt - timerStartedAt
          : (timerDurationMs ?? 0);
        const current = this.state.totalResponseTimeMs.get(playerId) ?? 0;
        this.state.totalResponseTimeMs.set(playerId, current + responseTime);
      }
    }
  }

  private scoreFlowConnectRound(timerStartedAt: number | null, timerDurationMs: number | null): void {
    const round = this.getCurrentRoundConfig();
    const roundState = this.getCurrentRoundState();
    const winnerCount = this.getFlowConnectWinnerCount();

    const questionScores = scoreFlowConnectRound(
      roundState.flowConnectStates,
      round.basePoints,
      round.speedBonusMax,
      winnerCount,
    );

    this.applyScores(questionScores, this.getFlowConnectRoundId());

    if (timerStartedAt !== null) {
      for (const [playerId, playerState] of roundState.flowConnectStates) {
        const responseTime = playerState.completedAt !== null
          ? playerState.completedAt - timerStartedAt
          : (timerDurationMs ?? 0);
        const current = this.state.totalResponseTimeMs.get(playerId) ?? 0;
        this.state.totalResponseTimeMs.set(playerId, current + responseTime);
      }
    }
  }

  private scorePipeRotationRound(timerStartedAt: number | null, timerDurationMs: number | null): void {
    const round = this.getCurrentRoundConfig();
    const roundState = this.getCurrentRoundState();
    const questionScores = scorePipeRotationRound(
      roundState.pipeRotationStates,
      round.basePoints,
      round.speedBonusMax,
      this.getPipeRotationWinnerCount(),
    );

    this.applyScores(questionScores, this.getPipeRotationRoundId());
    this.addPuzzleResponseTimes(roundState.pipeRotationStates, timerStartedAt, timerDurationMs);
  }

  private scoreRushHourRound(timerStartedAt: number | null, timerDurationMs: number | null): void {
    const round = this.getCurrentRoundConfig();
    const roundState = this.getCurrentRoundState();
    const questionScores = scoreRushHourRound(
      roundState.rushHourStates,
      round.basePoints,
      round.speedBonusMax,
      this.getRushHourWinnerCount(),
    );

    this.applyScores(questionScores, this.getRushHourRoundId());
    this.addPuzzleResponseTimes(roundState.rushHourStates, timerStartedAt, timerDurationMs);
  }

  private scoreNurikabeRound(timerStartedAt: number | null, timerDurationMs: number | null): void {
    const round = this.getCurrentRoundConfig();
    const roundState = this.getCurrentRoundState();
    const questionScores = scoreNurikabeRound(
      roundState.nurikabeStates,
      round.basePoints,
      round.speedBonusMax,
      this.getNurikabeWinnerCount(),
    );

    this.applyScores(questionScores, this.getNurikabeRoundId());
    this.addPuzzleResponseTimes(roundState.nurikabeStates, timerStartedAt, timerDurationMs);
  }

  private addPuzzleResponseTimes(
    playerStates: Map<string, { completedAt: number | null }>,
    timerStartedAt: number | null,
    timerDurationMs: number | null,
  ): void {
    if (timerStartedAt === null) return;
    for (const [playerId, playerState] of playerStates) {
      const responseTime = playerState.completedAt !== null
        ? playerState.completedAt - timerStartedAt
        : (timerDurationMs ?? 0);
      const current = this.state.totalResponseTimeMs.get(playerId) ?? 0;
      this.state.totalResponseTimeMs.set(playerId, current + responseTime);
    }
  }

  private scoreFinaleQuestion(): void {
    const finaleState = this.state.finaleState;
    const question = this.getCurrentFinaleQuestion();
    if (!question) return;

    const submissions = finaleState.submissions.get(question.id) ?? [];
    const winnerId = checkFinaleAnswer(submissions, question.correctAnswer);

    if (winnerId) {
      const current = finaleState.wins.get(winnerId) ?? 0;
      finaleState.wins.set(winnerId, current + 1);

      // Check win condition
      if (this.state.config.finale && current + 1 >= this.state.config.finale.winCondition) {
        finaleState.winnerId = winnerId;
      }
    }
  }

  private applyScores(questionScores: Map<string, number>, questionId: string): void {
    const roundIndex = this.state.currentRoundIndex;

    // Ensure round scores map exists
    if (!this.state.roundScores.has(roundIndex)) {
      this.state.roundScores.set(roundIndex, new Map());
    }
    const roundMap = this.state.roundScores.get(roundIndex)!;
    roundMap.set(questionId, questionScores);

    // Update cumulative player scores
    for (const [playerId, points] of questionScores) {
      const current = this.state.scores.get(playerId) ?? 0;
      const newScore = current + points;
      this.state.scores.set(playerId, newScore);

      const player = this.state.players.get(playerId);
      if (player) {
        player.score = newScore;
      }
    }
  }

  // ── Public Getters ─────────────────────────────────────────────────────

  getCurrentRoundConfig(): RoundConfig {
    const round = this.state.config.rounds[this.state.currentRoundIndex];
    if (!round) throw new Error('No round at current index');
    return round;
  }

  getCurrentQuestion(): QuestionConfig | null {
    const round = this.getCurrentRoundConfig();
    const questions = round.questions ?? [];
    return questions[this.state.currentQuestionIndex] ?? null;
  }

  getCurrentFinaleQuestion(): QuestionConfig | null {
    if (!this.state.config.finale) return null;
    const questions = this.state.config.finale.questions ?? [];
    return questions[this.state.finaleState.currentQuestionIndex] ?? null;
  }

  /**
   * Compute the progress bar state: how many theoretical max points have been
   * "played through" vs the total possible across the whole game.
   * The value reflects the start of the current question (doesn't advance
   * until the next question/round begins).
   */
  getProgressBar(): { completed: number; total: number } {
    const rounds = this.state.config.rounds;
    let total = 0;
    let completed = 0;

    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i]!;
      const roundMax = this.getRoundTheoreticalMax(round);
      total += roundMax;

      if (i < this.state.currentRoundIndex) {
        // Fully completed round
        completed += roundMax;
      } else if (i === this.state.currentRoundIndex) {
        const st = this.state.currentState;
        if (
          st === GameState.ROUND_RESULTS ||
          st === GameState.FINALE_INTRO ||
          st === GameState.FINALE_QUESTION ||
          st === GameState.FINALE_REVEAL ||
          st === GameState.GAME_OVER
        ) {
          // Current round is fully complete
          completed += roundMax;
        } else if (!this.isAtomicRound(round)) {
          // Standard round: count questions before the current one
          const questionMax = round.basePoints + round.speedBonusMax;
          completed += this.state.currentQuestionIndex * questionMax;
        }
        // Speed math in progress: 0 additional (it's atomic)
      }
    }

    return { completed, total };
  }

  private getRoundTheoreticalMax(round: RoundConfig): number {
    if (this.isAtomicRound(round)) {
      return round.basePoints + round.speedBonusMax;
    }
    const questionCount = round.questions?.length ?? 0;
    return questionCount * (round.basePoints + round.speedBonusMax);
  }

  private isAtomicRound(round: RoundConfig): boolean {
    return (
      round.type === 'speed_math' ||
      round.type === 'fifteen' ||
      round.type === 'flow_connect' ||
      round.type === 'pipe_rotation' ||
      round.type === 'rush_hour' ||
      round.type === 'nurikabe'
    );
  }

  getLeaderboard(): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    for (const [playerId, score] of this.state.scores) {
      const player = this.state.players.get(playerId);
      if (player) {
        const totalResponseTimeMs = this.state.totalResponseTimeMs.get(playerId) ?? 0;
        entries.push({ playerId, username: player.username, score, totalResponseTimeMs });
      }
    }
    // Sort by score descending, then by total response time ascending (faster = better)
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalResponseTimeMs - b.totalResponseTimeMs;
    });
    return entries;
  }

  getFinalists(): LeaderboardEntry[] {
    const topN = this.state.config.settings.finaleTopN;
    return this.getLeaderboard().slice(0, topN);
  }

  getPrizeWinners(): LeaderboardEntry[] {
    return this.getLeaderboard().slice(0, 3);
  }

  verifyWinnerCode(
    username: string,
    code: string,
  ): { valid: boolean; username?: string; rank?: number } {
    const normalizedUsername = normalizeUsernameForComparison(username);
    const normalizedCode = code.trim().toLowerCase();
    const winners = this.getPrizeWinners();

    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i]!;
      const player = this.state.players.get(winner.playerId);
      const expectedCode = this.state.winnerVerificationCodes.get(winner.playerId);
      if (!player || !expectedCode) continue;
      if (
        normalizeUsernameForComparison(player.username) === normalizedUsername &&
        expectedCode === normalizedCode
      ) {
        return { valid: true, username: player.username, rank: i + 1 };
      }
    }

    return { valid: false };
  }

  /** Check if all connected players have submitted an answer for the current question. */
  haveAllPlayersAnswered(): boolean {
    const st = this.state.currentState;
    if (st !== GameState.QUESTION_ACTIVE && st !== GameState.FINALE_QUESTION) {
      return false;
    }

    const question =
      st === GameState.FINALE_QUESTION
        ? this.getCurrentFinaleQuestion()
        : this.getCurrentQuestion();
    if (!question) return false;

    const submissionStore =
      st === GameState.FINALE_QUESTION
        ? this.state.finaleState.submissions
        : this.getCurrentRoundState().submissions;
    const submissions = submissionStore.get(question.id) ?? [];
    const submittedIds = new Set(submissions.map((s) => s.playerId));

    // In finale, only finalists need to answer
    if (st === GameState.FINALE_QUESTION) {
      return this.state.finaleState.finalists.every((id) => submittedIds.has(id));
    }

    // Standard question: all connected players except the host
    const hostId = this.state.config.settings.hostDiscordId;
    for (const [id, player] of this.state.players) {
      if (id === hostId) continue;
      if (player.connected && !submittedIds.has(id)) {
        return false;
      }
    }
    return true;
  }

  getFifteenCompletedCount(): number {
    const roundState = this.getCurrentRoundState();
    return this.getActiveParticipantIds()
      .filter((playerId) => roundState.fifteenStates.get(playerId)?.completedAt !== null)
      .length;
  }

  getFifteenWinnerCount(): number {
    const round = this.getCurrentRoundConfig();
    return round.fifteenParams?.winnerCount ?? 1;
  }

  shouldEndFifteenRound(): boolean {
    const winnerCount = this.getFifteenWinnerCount();
    if (this.state.currentState !== GameState.FIFTEEN_ACTIVE) return false;
    const completedCount = this.getFifteenCompletedCount();
    if (winnerCount > 0) return completedCount >= winnerCount;
    const activeParticipants = this.getActiveParticipantIds();
    return activeParticipants.length > 0 && completedCount >= activeParticipants.length;
  }

  getFifteenProgress(): { completedCount: number; winnerCount: number; totalPlayers: number } {
    const totalPlayers = this.getActiveParticipantIds().length;
    return {
      completedCount: this.getFifteenCompletedCount(),
      winnerCount: this.getFifteenWinnerCount(),
      totalPlayers,
    };
  }

  getFlowConnectCompletedCount(): number {
    const roundState = this.getCurrentRoundState();
    return this.getActiveParticipantIds()
      .filter((playerId) => roundState.flowConnectStates.get(playerId)?.completedAt !== null)
      .length;
  }

  getFlowConnectWinnerCount(): number {
    const round = this.getCurrentRoundConfig();
    return round.flowConnectParams?.winnerCount ?? 1;
  }

  shouldEndFlowConnectRound(): boolean {
    const winnerCount = this.getFlowConnectWinnerCount();
    if (this.state.currentState !== GameState.FLOW_CONNECT_ACTIVE) return false;
    const completedCount = this.getFlowConnectCompletedCount();
    if (winnerCount > 0) return completedCount >= winnerCount;
    const activeParticipants = this.getActiveParticipantIds();
    return activeParticipants.length > 0 && completedCount >= activeParticipants.length;
  }

  getFlowConnectProgress(): { completedCount: number; winnerCount: number; totalPlayers: number } {
    const totalPlayers = this.getActiveParticipantIds().length;
    return {
      completedCount: this.getFlowConnectCompletedCount(),
      winnerCount: this.getFlowConnectWinnerCount(),
      totalPlayers,
    };
  }

  getPipeRotationCompletedCount(): number {
    const roundState = this.getCurrentRoundState();
    return this.getActiveParticipantIds()
      .filter((playerId) => roundState.pipeRotationStates.get(playerId)?.completedAt !== null)
      .length;
  }

  getPipeRotationWinnerCount(): number {
    const round = this.getCurrentRoundConfig();
    return round.pipeRotationParams?.winnerCount ?? 1;
  }

  shouldEndPipeRotationRound(): boolean {
    const winnerCount = this.getPipeRotationWinnerCount();
    if (this.state.currentState !== GameState.PIPE_ROTATION_ACTIVE) return false;
    const completedCount = this.getPipeRotationCompletedCount();
    if (winnerCount > 0) return completedCount >= winnerCount;
    const activeParticipants = this.getActiveParticipantIds();
    return activeParticipants.length > 0 && completedCount >= activeParticipants.length;
  }

  getPipeRotationProgress(): { completedCount: number; winnerCount: number; totalPlayers: number } {
    const totalPlayers = this.getActiveParticipantIds().length;
    return {
      completedCount: this.getPipeRotationCompletedCount(),
      winnerCount: this.getPipeRotationWinnerCount(),
      totalPlayers,
    };
  }

  getRushHourCompletedCount(): number {
    const roundState = this.getCurrentRoundState();
    return this.getActiveParticipantIds()
      .filter((playerId) => roundState.rushHourStates.get(playerId)?.completedAt !== null)
      .length;
  }

  getRushHourWinnerCount(): number {
    const round = this.getCurrentRoundConfig();
    return round.rushHourParams?.winnerCount ?? 1;
  }

  shouldEndRushHourRound(): boolean {
    const winnerCount = this.getRushHourWinnerCount();
    if (this.state.currentState !== GameState.RUSH_HOUR_ACTIVE) return false;
    const completedCount = this.getRushHourCompletedCount();
    if (winnerCount > 0) return completedCount >= winnerCount;
    const activeParticipants = this.getActiveParticipantIds();
    return activeParticipants.length > 0 && completedCount >= activeParticipants.length;
  }

  getRushHourProgress(): { completedCount: number; winnerCount: number; totalPlayers: number } {
    const totalPlayers = this.getActiveParticipantIds().length;
    return {
      completedCount: this.getRushHourCompletedCount(),
      winnerCount: this.getRushHourWinnerCount(),
      totalPlayers,
    };
  }

  getNurikabeCompletedCount(): number {
    const roundState = this.getCurrentRoundState();
    return this.getActiveParticipantIds()
      .filter((playerId) => roundState.nurikabeStates.get(playerId)?.completedAt !== null)
      .length;
  }

  getNurikabeWinnerCount(): number {
    const round = this.getCurrentRoundConfig();
    return round.nurikabeParams?.winnerCount ?? 1;
  }

  shouldEndNurikabeRound(): boolean {
    const winnerCount = this.getNurikabeWinnerCount();
    if (this.state.currentState !== GameState.NURIKABE_ACTIVE) return false;
    const completedCount = this.getNurikabeCompletedCount();
    if (winnerCount > 0) return completedCount >= winnerCount;
    const activeParticipants = this.getActiveParticipantIds();
    return activeParticipants.length > 0 && completedCount >= activeParticipants.length;
  }

  getNurikabeProgress(): { completedCount: number; winnerCount: number; totalPlayers: number } {
    const totalPlayers = this.getActiveParticipantIds().length;
    return {
      completedCount: this.getNurikabeCompletedCount(),
      winnerCount: this.getNurikabeWinnerCount(),
      totalPlayers,
    };
  }

  getPlayers(): Map<string, Player> {
    return this.state.players;
  }

  getGameState(): GameState {
    return this.state.currentState;
  }

  getGameId(): string {
    return this.state.gameId;
  }

  getFinaleState(): FinaleState {
    return this.state.finaleState;
  }

  /**
   * Returns a state object safe for broadcast to clients.
   * Strips correct answers and internal bookkeeping.
   * Leaderboard is NOT included — it is sent via a separate event.
   */
  getPublicState(): {
    gameId: string;
    hostDiscordId: string;
    currentState: GameState;
    players: Array<{
      id: string;
      username: string;
      avatarUrl: string;
      score: number;
      connected: boolean;
    }>;
    currentRoundIndex: number;
    currentQuestionIndex: number;
    currentRound: {
      roundNumber: number;
      type: string;
      title: string;
      description?: string;
      typeLabel?: string;
      timerSeconds: number;
    } | null;
    fifteenState: {
      initialBoard: number[];
      completed: boolean;
      completedCount: number;
      winnerCount: number;
      totalPlayers: number;
    } | null;
    flowConnectState: {
      size: number;
      colorCount: number;
      endpoints: Array<{
        color: number;
        start: { row: number; col: number };
        end: { row: number; col: number };
      }>;
      completed: boolean;
      completedCount: number;
      winnerCount: number;
      totalPlayers: number;
    } | null;
    pipeRotationState: BroadcastBase['pipeRotationState'];
    rushHourState: BroadcastBase['rushHourState'];
    nurikabeState: BroadcastBase['nurikabeState'];
    currentQuestion: {
      id: string;
      display?: { type: string; src?: string };
      answerType: string;
      options?: string[];
    } | null;
    timerRemainingMs: number | null;
    progressBar: { completed: number; total: number };
    finaleState: {
      currentQuestionIndex: number;
      wins: Record<string, number>;
      finalists: string[];
      winnerId: string | null;
    } | null;
    winnerVerification: { code: string; rank: number } | null;
  } {
    const round = this.safeGetCurrentRound();
    const question = this.safeGetCurrentPublicQuestion();

    return {
      gameId: this.state.gameId,
      hostDiscordId: this.state.config.settings.hostDiscordId,
      currentState: this.state.currentState,
      players: Array.from(this.state.players.values()).map((p) => ({
        id: p.id,
        username: p.username,
        avatarUrl: p.avatarUrl,
        score: p.score,
        connected: p.connected,
      })),
      currentRoundIndex: this.state.currentRoundIndex,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentRound: round
        ? {
            roundNumber: round.roundNumber,
            type: round.type,
            title: round.title,
            ...(round.description !== undefined ? { description: round.description } : {}),
            ...(round.typeLabel !== undefined ? { typeLabel: round.typeLabel } : {}),
            timerSeconds: round.timerSeconds,
          }
        : null,
      fifteenState: this.getPublicFifteenState(null),
      flowConnectState: this.getPublicFlowConnectState(null),
      pipeRotationState: this.getPublicPipeRotationState(null),
      rushHourState: this.getPublicRushHourState(null),
      nurikabeState: this.getPublicNurikabeState(null),
      currentQuestion: question,
      timerRemainingMs: this.getTimerRemainingMs(),
      progressBar: this.getProgressBar(),
      finaleState:
        this.state.currentState === GameState.FINALE_INTRO ||
        this.state.currentState === GameState.FINALE_QUESTION ||
        this.state.currentState === GameState.FINALE_REVEAL ||
        this.state.currentState === GameState.GAME_OVER
          ? {
              currentQuestionIndex: this.state.finaleState.currentQuestionIndex,
              wins: Object.fromEntries(this.state.finaleState.wins),
              finalists: this.state.finaleState.finalists,
              winnerId: this.state.finaleState.winnerId,
            }
          : null,
      winnerVerification: null,
    };
  }

  /**
   * Computes the shared (non-per-player) portion of the broadcast state,
   * including image data and reveal answers. Call once per broadcast,
   * then pass into getPlayerOverlay() for each socket.
   */
  computeBroadcastBase(
    getImageData: (questionId: string) => string | null,
  ): BroadcastBase {
    const base = this.getPublicState();
    const st = this.state.currentState;

    let questionImageData: string | null = null;
    let questionText: string | null = null;
    let questionAnswerType: string | null = null;
    let questionOptions: string[] | null = null;
    let questionTimerSeconds: number | null = null;
    let revealAnswer: string | number | null = null;

    const isQuestionActive = st === GameState.QUESTION_ACTIVE;
    const isQuestionReveal = st === GameState.QUESTION_REVEAL;
    const isFinaleQuestion = st === GameState.FINALE_QUESTION;
    const isFinaleReveal = st === GameState.FINALE_REVEAL;
    const isCountdown = st === GameState.QUESTION_COUNTDOWN;

    if (isCountdown || isQuestionActive || isQuestionReveal || isFinaleQuestion || isFinaleReveal) {
      const question =
        isFinaleQuestion || isFinaleReveal
          ? this.getCurrentFinaleQuestion()
          : this.getCurrentQuestion();

      if (question) {
        questionText = question.text ?? null;
        if (!isCountdown) {
          questionImageData = getImageData(question.id);
        }
        questionAnswerType = question.answerType;
        questionOptions = question.options ?? null;

        if ((isFinaleQuestion || isFinaleReveal) && this.state.config.finale) {
          questionTimerSeconds = this.state.config.finale.timerSeconds;
        } else {
          questionTimerSeconds = this.getCurrentRoundConfig().timerSeconds;
        }

        if (isQuestionReveal || isFinaleReveal) {
          revealAnswer = question.correctAnswer;
        }
      }
    }

    if (
      st === GameState.SPEED_MATH_ACTIVE ||
      st === GameState.FIFTEEN_ACTIVE ||
      st === GameState.FLOW_CONNECT_ACTIVE ||
      st === GameState.PIPE_ROTATION_ACTIVE ||
      st === GameState.RUSH_HOUR_ACTIVE ||
      st === GameState.NURIKABE_ACTIVE
    ) {
      questionTimerSeconds = this.getCurrentRoundConfig().timerSeconds;
    }

    return {
      ...base,
      questionImageData,
      questionText,
      questionAnswerType,
      questionOptions,
      questionTimerSeconds,
      revealAnswer,
    };
  }

  /**
   * Returns the per-player overlay on top of a pre-computed broadcast base.
   * Only computes per-player submission, speed-math state, and round points.
   */
  getPlayerOverlay(
    playerId: string | null,
    broadcastBase: BroadcastBase,
  ): ReturnType<GameEngine['getPublicStateForPlayer']> {
    const st = this.state.currentState;

    let playerSubmission: {
      answer: string | number;
      correct: boolean | null;
      pointsEarned: number | null;
      pointsBreakdown: { base: number; speedBonus: number } | null;
    } | null = null;
    let roundPointsEarned: number | null = null;
    let roundPointsBreakdown: { base: number; speedBonus: number } | null = null;
    let speedMathState: {
      questionIndex: number;
      imageData: string | null;
      totalQuestions: number;
      completed: boolean;
    } | null = null;
    let fifteenState = broadcastBase.fifteenState;
    let flowConnectState = broadcastBase.flowConnectState;
    let pipeRotationState = broadcastBase.pipeRotationState;
    let rushHourState = broadcastBase.rushHourState;
    let nurikabeState = broadcastBase.nurikabeState;
    let winnerVerification: { code: string; rank: number } | null = null;

    const isQuestionActive = st === GameState.QUESTION_ACTIVE;
    const isQuestionReveal = st === GameState.QUESTION_REVEAL;
    const isFinaleQuestion = st === GameState.FINALE_QUESTION;
    const isFinaleReveal = st === GameState.FINALE_REVEAL;
    const isSpeedMath = st === GameState.SPEED_MATH_ACTIVE;
    const isCountdown = st === GameState.QUESTION_COUNTDOWN;

    if ((isCountdown || isQuestionActive || isQuestionReveal || isFinaleQuestion || isFinaleReveal) && playerId) {
      const question =
        isFinaleQuestion || isFinaleReveal
          ? this.getCurrentFinaleQuestion()
          : this.getCurrentQuestion();

      if (question) {
        const submissionStore =
          (isFinaleQuestion || isFinaleReveal)
            ? this.state.finaleState.submissions
            : this.getCurrentRoundState().submissions;
        const subs = submissionStore.get(question.id) ?? [];
        const playerSub = subs.find((s) => s.playerId === playerId);
        if (playerSub) {
          const isCorrect = (isQuestionReveal || isFinaleReveal)
            ? String(playerSub.answer).trim().toLowerCase() ===
              String(question.correctAnswer).trim().toLowerCase()
            : null;
          let pointsEarned: number | null = null;
          let pointsBreakdown: { base: number; speedBonus: number } | null = null;
          if (isQuestionReveal || isFinaleReveal) {
            const roundScoreMap = this.state.roundScores.get(this.state.currentRoundIndex);
            if (roundScoreMap) {
              const questionScores = roundScoreMap.get(question.id);
              pointsEarned = questionScores?.get(playerId) ?? 0;
            }
            const isFermi = question.answerType === 'fermi' || question.scoringMode === 'fermi';
            if (pointsEarned != null && pointsEarned > 0 && !isFermi) {
              const roundConfig = (isFinaleReveal) ? null : this.getCurrentRoundConfig();
              const basePoints = roundConfig?.basePoints ?? 0;
              pointsBreakdown = {
                base: Math.min(pointsEarned, basePoints),
                speedBonus: Math.max(0, pointsEarned - basePoints),
              };
            } else if (pointsEarned != null && isFermi) {
              pointsBreakdown = { base: pointsEarned, speedBonus: 0 };
            }
          }
          playerSubmission = { answer: playerSub.answer, correct: isCorrect, pointsEarned, pointsBreakdown };
        }
      }
    }

    // Speed math: per-player state
    if (isSpeedMath && playerId) {
      const roundState = this.getCurrentRoundState();
      const playerSpeedState = roundState.speedMathStates.get(playerId);
      const generatedQs = this.state.generatedQuestions.get(this.state.currentRoundIndex);
      const totalQuestions = generatedQs?.length ?? 0;
      const qIdx = playerSpeedState?.currentQuestionIndex ?? 0;
      const q = generatedQs?.[qIdx];
      const completed = playerSpeedState?.completedAt !== null && playerSpeedState?.completedAt !== undefined;

      speedMathState = {
        questionIndex: qIdx,
        imageData: q?.imageDataUrl ?? null,
        totalQuestions,
        completed,
      };
    }

    if (st === GameState.FIFTEEN_ACTIVE) {
      fifteenState = this.getPublicFifteenState(playerId);
    }

    if (st === GameState.FLOW_CONNECT_ACTIVE) {
      flowConnectState = this.getPublicFlowConnectState(playerId);
    }

    if (st === GameState.PIPE_ROTATION_ACTIVE) {
      pipeRotationState = this.getPublicPipeRotationState(playerId);
    }

    if (st === GameState.RUSH_HOUR_ACTIVE) {
      rushHourState = this.getPublicRushHourState(playerId);
    }

    if (st === GameState.NURIKABE_ACTIVE) {
      nurikabeState = this.getPublicNurikabeState(playerId);
    }

    // Round results points
    if (st === GameState.ROUND_RESULTS && playerId) {
      const roundScoreMap = this.state.roundScores.get(this.state.currentRoundIndex);
      if (roundScoreMap) {
        let total = 0;
        for (const [, questionScores] of roundScoreMap) {
          total += questionScores.get(playerId) ?? 0;
        }
        roundPointsEarned = total;

        const roundConfig = this.getCurrentRoundConfig();
        if (roundConfig.type === 'speed_math') {
          const roundState = this.getCurrentRoundState();
          const playerSpeedState = roundState.speedMathStates.get(playerId);
          const generatedQs = this.state.generatedQuestions.get(this.state.currentRoundIndex);
          const totalQs = generatedQs?.length ?? roundConfig.generatorParams?.questionCount ?? 0;
          const correctCount = playerSpeedState?.correctCount ?? 0;
          const accuracyBase = Math.floor(roundConfig.basePoints * (correctCount / totalQs));
          roundPointsBreakdown = {
            base: accuracyBase,
            speedBonus: Math.max(0, total - accuracyBase),
          };
        } else if (
          roundConfig.type === 'fifteen' ||
          roundConfig.type === 'flow_connect' ||
          roundConfig.type === 'pipe_rotation' ||
          roundConfig.type === 'rush_hour' ||
          roundConfig.type === 'nurikabe'
        ) {
          roundPointsBreakdown = {
            base: Math.min(total, roundConfig.basePoints),
            speedBonus: Math.max(0, total - roundConfig.basePoints),
          };
        } else {
          roundPointsBreakdown = { base: total, speedBonus: 0 };
        }
      }
    }

    if (st === GameState.GAME_OVER && playerId) {
      winnerVerification = this.getWinnerVerificationForPlayer(playerId);
    }

    return {
      ...broadcastBase,
      playerSubmission,
      roundPointsEarned,
      roundPointsBreakdown,
      speedMathState,
      fifteenState,
      flowConnectState,
      pipeRotationState,
      rushHourState,
      nurikabeState,
      winnerVerification,
    };
  }

  /**
   * Returns a per-player state object that includes everything from
   * getPublicState() plus image data, answer info, and speed-math state
   * so the client can fully render any view without ephemeral events.
   *
   * NOTE: For broadcasts to many sockets, prefer computeBroadcastBase() +
   * getPlayerOverlay() to avoid recomputing the shared state N times.
   */
  getPublicStateForPlayer(
    playerId: string | null,
    getImageData: (questionId: string) => string | null,
  ): {
    gameId: string;
    hostDiscordId: string;
    currentState: GameState;
    players: Array<{
      id: string;
      username: string;
      avatarUrl: string;
      score: number;
      connected: boolean;
    }>;
    currentRoundIndex: number;
    currentQuestionIndex: number;
    currentRound: {
      roundNumber: number;
      type: string;
      title: string;
      description?: string;
      typeLabel?: string;
      timerSeconds: number;
    } | null;
    fifteenState: {
      initialBoard: number[];
      completed: boolean;
      completedCount: number;
      winnerCount: number;
      totalPlayers: number;
    } | null;
    flowConnectState: {
      size: number;
      colorCount: number;
      endpoints: Array<{
        color: number;
        start: { row: number; col: number };
        end: { row: number; col: number };
      }>;
      completed: boolean;
      completedCount: number;
      winnerCount: number;
      totalPlayers: number;
    } | null;
    pipeRotationState: BroadcastBase['pipeRotationState'];
    rushHourState: BroadcastBase['rushHourState'];
    nurikabeState: BroadcastBase['nurikabeState'];
    currentQuestion: {
      id: string;
      display?: { type: string; src?: string };
      answerType: string;
      options?: string[];
    } | null;
    timerRemainingMs: number | null;
    progressBar: { completed: number; total: number };
    finaleState: {
      currentQuestionIndex: number;
      wins: Record<string, number>;
      finalists: string[];
      winnerId: string | null;
    } | null;
    questionImageData: string | null;
    questionText: string | null;
    questionAnswerType: string | null;
    questionOptions: string[] | null;
    questionTimerSeconds: number | null;
    revealAnswer: string | number | null;
    playerSubmission: { answer: string | number; correct: boolean | null; pointsEarned: number | null; pointsBreakdown: { base: number; speedBonus: number } | null } | null;
    roundPointsEarned: number | null;
    roundPointsBreakdown: { base: number; speedBonus: number } | null;
    speedMathState: {
      questionIndex: number;
      imageData: string | null;
      totalQuestions: number;
      completed: boolean;
    } | null;
    winnerVerification: { code: string; rank: number } | null;
  } {
    const broadcastBase = this.computeBroadcastBase(getImageData);
    return this.getPlayerOverlay(playerId, broadcastBase);
  }

  /**
   * Returns generated questions for the current round (speed math).
   * Intended for sending to individual clients (one at a time).
   */
  getGeneratedQuestionsForCurrentRound(): GeneratedQuestion[] {
    return this.state.generatedQuestions.get(this.state.currentRoundIndex) ?? [];
  }

  /** Returns the full internal state (for persistence / debugging). */
  getFullState(): GameEngineState {
    return this.state;
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private removePlayerEverywhere(playerId: string): void {
    this.state.players.delete(playerId);
    this.state.scores.delete(playerId);
    this.state.totalResponseTimeMs.delete(playerId);
    this.state.winnerVerificationCodes.delete(playerId);

    for (const roundState of this.state.roundStates) {
      roundState.speedMathStates.delete(playerId);
      roundState.fifteenStates.delete(playerId);
      roundState.flowConnectStates.delete(playerId);
      roundState.pipeRotationStates.delete(playerId);
      roundState.rushHourStates.delete(playerId);
      roundState.nurikabeStates.delete(playerId);

      for (const [questionId, submissions] of roundState.submissions) {
        roundState.submissions.set(
          questionId,
          submissions.filter((submission) => submission.playerId !== playerId),
        );
      }
    }

    for (const [, roundScores] of this.state.roundScores) {
      for (const [, questionScores] of roundScores) {
        questionScores.delete(playerId);
      }
    }

    this.state.finaleState.wins.delete(playerId);
    this.state.finaleState.finalists = this.state.finaleState.finalists.filter(
      (id) => id !== playerId,
    );
    if (this.state.finaleState.winnerId === playerId) {
      this.state.finaleState.winnerId = null;
    }
    for (const [questionId, submissions] of this.state.finaleState.submissions) {
      this.state.finaleState.submissions.set(
        questionId,
        submissions.filter((submission) => submission.playerId !== playerId),
      );
    }
  }

  private ensureWinnerVerificationCodes(): void {
    const winners = this.getPrizeWinners();
    for (const winner of winners) {
      if (!this.state.winnerVerificationCodes.has(winner.playerId)) {
        this.state.winnerVerificationCodes.set(
          winner.playerId,
          makeWinnerVerificationCode(),
        );
      }
    }
  }

  private getWinnerVerificationForPlayer(
    playerId: string,
  ): { code: string; rank: number } | null {
    const code = this.state.winnerVerificationCodes.get(playerId);
    if (!code) return null;

    const rank = this.getPrizeWinners().findIndex((entry) => entry.playerId === playerId);
    if (rank === -1) return null;

    return { code, rank: rank + 1 };
  }

  private assertHost(hostId: string): void {
    if (hostId !== this.state.config.settings.hostDiscordId) {
      throw new Error('Only the host can perform this action');
    }
  }

  private assertState(expected: GameState): void {
    if (this.state.currentState !== expected) {
      throw new Error(
        `Invalid state transition: expected ${expected}, but currently in ${this.state.currentState}`,
      );
    }
  }

  private setState(next: GameState): void {
    this.state.currentState = next;
    if (next === GameState.GAME_OVER) {
      this.ensureWinnerVerificationCodes();
    }
  }

  private getCurrentRoundState(): RoundState {
    const rs = this.state.roundStates[this.state.currentRoundIndex];
    if (!rs) throw new Error('No round state at current index');
    return rs;
  }

  private getActiveParticipantIds(): string[] {
    const hostId = this.state.config.settings.hostDiscordId;
    return Array.from(this.state.players.entries())
      .filter(([id, player]) => id !== hostId && player.connected)
      .map(([id]) => id);
  }

  private initRoundState(): void {
    this.state.roundStates[this.state.currentRoundIndex] = freshRoundState();
  }

  private initSpeedMathStates(): void {
    const roundState = this.getCurrentRoundState();
    for (const [playerId] of this.state.players) {
      roundState.speedMathStates.set(playerId, {
        currentQuestionIndex: 0,
        correctCount: 0,
        completedAt: null,
        attempts: new Map(),
      });
    }
  }

  private initFifteenRound(): void {
    const roundState = this.getCurrentRoundState();
    const initialBoard = this.state.generatedFifteenBoards.get(this.state.currentRoundIndex);
    if (!initialBoard) {
      throw new Error(`No pre-generated Fifteen board for round index ${this.state.currentRoundIndex}`);
    }
    roundState.fifteenInitialBoard = [...initialBoard];

    for (const [playerId] of this.state.players) {
      roundState.fifteenStates.set(playerId, {
        completedAt: null,
        moveCount: null,
        rank: null,
      });
    }
  }

  private initFlowConnectRound(): void {
    const roundState = this.getCurrentRoundState();
    const puzzle = this.state.generatedFlowConnectPuzzles.get(this.state.currentRoundIndex);
    if (!puzzle) {
      throw new Error(`No pre-generated Flow Connect puzzle for round index ${this.state.currentRoundIndex}`);
    }
    roundState.flowConnectPuzzle = cloneFlowConnectPuzzle(puzzle);

    for (const [playerId] of this.state.players) {
      roundState.flowConnectStates.set(playerId, {
        completedAt: null,
        rank: null,
      });
    }
  }

  private initPipeRotationRound(): void {
    const roundState = this.getCurrentRoundState();
    const puzzle = this.state.generatedPipeRotationPuzzles.get(this.state.currentRoundIndex);
    if (!puzzle) {
      throw new Error(`No pre-generated Pipe Rotation puzzle for round index ${this.state.currentRoundIndex}`);
    }
    roundState.pipeRotationPuzzle = clonePipeRotationPuzzle(puzzle);

    for (const [playerId] of this.state.players) {
      roundState.pipeRotationStates.set(playerId, {
        completedAt: null,
        rank: null,
      });
    }
  }

  private initRushHourRound(): void {
    const roundState = this.getCurrentRoundState();
    const puzzle = this.state.generatedRushHourPuzzles.get(this.state.currentRoundIndex);
    if (!puzzle) {
      throw new Error(`No pre-generated Rush Hour puzzle for round index ${this.state.currentRoundIndex}`);
    }
    roundState.rushHourPuzzle = cloneRushHourPuzzle(puzzle);

    for (const [playerId] of this.state.players) {
      roundState.rushHourStates.set(playerId, {
        completedAt: null,
        moveCount: null,
        rank: null,
      });
    }
  }

  private initNurikabeRound(): void {
    const roundState = this.getCurrentRoundState();
    const puzzle = this.state.generatedNurikabePuzzles.get(this.state.currentRoundIndex);
    if (!puzzle) {
      throw new Error(`No pre-generated Nurikabe puzzle for round index ${this.state.currentRoundIndex}`);
    }
    roundState.nurikabePuzzle = cloneNurikabePuzzle(puzzle);

    for (const [playerId] of this.state.players) {
      roundState.nurikabeStates.set(playerId, {
        completedAt: null,
        rank: null,
      });
    }
  }

  private getPublicFifteenState(playerId: string | null): {
    initialBoard: number[];
    completed: boolean;
    completedCount: number;
    winnerCount: number;
    totalPlayers: number;
  } | null {
    if (this.state.currentState !== GameState.FIFTEEN_ACTIVE) {
      return null;
    }

    const roundState = this.getCurrentRoundState();
    if (!roundState.fifteenInitialBoard) {
      return null;
    }

    const playerState = playerId ? roundState.fifteenStates.get(playerId) : null;
    const progress = this.getFifteenProgress();

    return {
      initialBoard: roundState.fifteenInitialBoard,
      completed: playerState?.completedAt !== null && playerState?.completedAt !== undefined,
      completedCount: progress.completedCount,
      winnerCount: progress.winnerCount,
      totalPlayers: progress.totalPlayers,
    };
  }

  private getFifteenRoundId(): string {
    return `fifteen_round_${this.state.currentRoundIndex}`;
  }

  private getPublicFlowConnectState(playerId: string | null): {
    size: number;
    colorCount: number;
    endpoints: Array<{
      color: number;
      start: { row: number; col: number };
      end: { row: number; col: number };
    }>;
    completed: boolean;
    completedCount: number;
    winnerCount: number;
    totalPlayers: number;
  } | null {
    if (this.state.currentState !== GameState.FLOW_CONNECT_ACTIVE) {
      return null;
    }

    const roundState = this.getCurrentRoundState();
    const puzzle = roundState.flowConnectPuzzle;
    if (!puzzle) {
      return null;
    }

    const playerState = playerId ? roundState.flowConnectStates.get(playerId) : null;
    const progress = this.getFlowConnectProgress();

    return {
      size: puzzle.size,
      colorCount: puzzle.colorCount,
      endpoints: puzzle.endpoints,
      completed: playerState?.completedAt !== null && playerState?.completedAt !== undefined,
      completedCount: progress.completedCount,
      winnerCount: progress.winnerCount,
      totalPlayers: progress.totalPlayers,
    };
  }

  private getFlowConnectRoundId(): string {
    return `flow_connect_round_${this.state.currentRoundIndex}`;
  }

  private getPublicPipeRotationState(playerId: string | null): BroadcastBase['pipeRotationState'] {
    if (this.state.currentState !== GameState.PIPE_ROTATION_ACTIVE) {
      return null;
    }

    const roundState = this.getCurrentRoundState();
    const puzzle = roundState.pipeRotationPuzzle;
    if (!puzzle) {
      return null;
    }

    const playerState = playerId ? roundState.pipeRotationStates.get(playerId) : null;
    const progress = this.getPipeRotationProgress();

    return {
      rows: puzzle.rows,
      cols: puzzle.cols,
      source: puzzle.source,
      terminals: puzzle.terminals,
      tiles: puzzle.tiles.map((tile) => ({
        row: tile.row,
        col: tile.col,
        initialMask: tile.initialMask,
      })),
      requireFullSolve: puzzle.requireFullSolve,
      completed: playerState?.completedAt !== null && playerState?.completedAt !== undefined,
      completedCount: progress.completedCount,
      winnerCount: progress.winnerCount,
      totalPlayers: progress.totalPlayers,
    };
  }

  private getPublicRushHourState(playerId: string | null): BroadcastBase['rushHourState'] {
    if (this.state.currentState !== GameState.RUSH_HOUR_ACTIVE) {
      return null;
    }

    const roundState = this.getCurrentRoundState();
    const puzzle = roundState.rushHourPuzzle;
    if (!puzzle) {
      return null;
    }

    const playerState = playerId ? roundState.rushHourStates.get(playerId) : null;
    const progress = this.getRushHourProgress();

    return {
      size: puzzle.size,
      targetId: puzzle.targetId,
      exitRow: puzzle.exitRow,
      vehicles: puzzle.vehicles.map((vehicle) => ({ ...vehicle })),
      completed: playerState?.completedAt !== null && playerState?.completedAt !== undefined,
      completedCount: progress.completedCount,
      winnerCount: progress.winnerCount,
      totalPlayers: progress.totalPlayers,
      optimalMoves: puzzle.optimalMoves,
      optimalVehicleMoves: puzzle.optimalVehicleMoves,
    };
  }

  private getPublicNurikabeState(playerId: string | null): BroadcastBase['nurikabeState'] {
    if (this.state.currentState !== GameState.NURIKABE_ACTIVE) {
      return null;
    }

    const roundState = this.getCurrentRoundState();
    const puzzle = roundState.nurikabePuzzle;
    if (!puzzle) {
      return null;
    }

    const playerState = playerId ? roundState.nurikabeStates.get(playerId) : null;
    const progress = this.getNurikabeProgress();

    return {
      rows: puzzle.rows,
      cols: puzzle.cols,
      initial: puzzle.initial.map((row) => [...row]),
      clues: puzzle.clues.map((clue) => ({ ...clue })),
      lockedCells: puzzle.lockedCells.map((cell) => ({ ...cell })),
      completed: playerState?.completedAt !== null && playerState?.completedAt !== undefined,
      completedCount: progress.completedCount,
      winnerCount: progress.winnerCount,
      totalPlayers: progress.totalPlayers,
    };
  }

  private getPipeRotationRoundId(): string {
    return `pipe_rotation_round_${this.state.currentRoundIndex}`;
  }

  private getRushHourRoundId(): string {
    return `rush_hour_round_${this.state.currentRoundIndex}`;
  }

  private getNurikabeRoundId(): string {
    return `nurikabe_round_${this.state.currentRoundIndex}`;
  }

  private startTimer(durationMs: number): void {
    this.state.timerStartedAt = Date.now();
    this.state.timerDurationMs = durationMs;
  }

  private isTimerExpired(): boolean {
    if (this.state.timerStartedAt === null || this.state.timerDurationMs === null) {
      return true;
    }
    return Date.now() - this.state.timerStartedAt >= this.state.timerDurationMs;
  }

  private getTimerRemainingMs(): number | null {
    if (this.state.timerStartedAt === null || this.state.timerDurationMs === null) {
      return null;
    }
    const remaining =
      this.state.timerDurationMs - (Date.now() - this.state.timerStartedAt);
    return Math.max(0, remaining);
  }

  private safeGetCurrentRound(): RoundConfig | null {
    try {
      return this.getCurrentRoundConfig();
    } catch {
      return null;
    }
  }

  private safeGetCurrentPublicQuestion(): {
    id: string;
    display?: { type: string; src?: string };
    answerType: string;
    options?: string[];
  } | null {
    let question: QuestionConfig | null = null;

    if (
      this.state.currentState === GameState.QUESTION_ACTIVE ||
      this.state.currentState === GameState.QUESTION_REVEAL
    ) {
      question = this.getCurrentQuestion();
    } else if (
      this.state.currentState === GameState.FINALE_QUESTION ||
      this.state.currentState === GameState.FINALE_REVEAL
    ) {
      question = this.getCurrentFinaleQuestion();
    }

    if (!question) return null;

    const pub: {
      id: string;
      display?: { type: string; src?: string };
      answerType: string;
      options?: string[];
    } = {
      id: question.id,
      answerType: question.answerType,
    };

    if (question.display) {
      pub.display = { type: question.display.type };
      if (question.display.src) {
        pub.display.src = question.display.src;
      }
    }
    if (question.options) {
      pub.options = question.options;
    }

    return pub;
  }
}
