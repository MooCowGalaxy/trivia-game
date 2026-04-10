import {
  GameState,
} from './types.js';
import type {
  GameConfig,
  GameEngineState,
  GeneratedQuestion,
  Player,
  PlayerSubmission,
  RoundConfig,
  RoundState,
  SpeedMathPlayerState,
  QuestionConfig,
  FinaleState,
  LeaderboardEntry,
  TransitionAction,
} from './types.js';
import {
  scoreStandardRound,
  scoreSpeedMathRound,
  scoreFermiQuestion,
  checkFinaleAnswer,
} from './scoring.js';

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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function freshRoundState(): RoundState {
  return {
    submissions: new Map(),
    speedMathStates: new Map(),
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

// ─── Game Engine ─────────────────────────────────────────────────────────────

export class GameEngine {
  private state: GameEngineState;

  constructor(
    config: GameConfig,
    generatedQuestions?: Map<number, GeneratedQuestion[]>,
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
      totalResponseTimeMs: new Map(),
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
    }

    return player;
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
        } else if (round.type !== 'speed_math') {
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
    if (round.type === 'speed_math') {
      return round.basePoints + round.speedBonusMax;
    }
    const questionCount = round.questions?.length ?? 0;
    return questionCount * (round.basePoints + round.speedBonusMax);
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

    if (st === GameState.SPEED_MATH_ACTIVE) {
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
        } else {
          roundPointsBreakdown = { base: total, speedBonus: 0 };
        }
      }
    }

    return {
      ...broadcastBase,
      playerSubmission,
      roundPointsEarned,
      roundPointsBreakdown,
      speedMathState,
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
  }

  private getCurrentRoundState(): RoundState {
    const rs = this.state.roundStates[this.state.currentRoundIndex];
    if (!rs) throw new Error('No round state at current index');
    return rs;
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
