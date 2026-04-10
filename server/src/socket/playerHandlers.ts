import type { Server, Socket } from 'socket.io';
import type { GameEngine } from '../game/engine.js';
import type { GameTimer } from '../game/timer.js';
import { GameState } from '../game/types.js';
import type { JwtPayload } from '../middleware/authMiddleware.js';

// ── Per-socket rate limiter ──────────────────────────────────────────────────

function createRateLimiter(maxPerWindow: number, windowMs: number) {
  let count = 0;
  let windowStart = Date.now();
  return function check(): boolean {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      count = 0;
      windowStart = now;
    }
    count++;
    return count <= maxPerWindow;
  };
}

// ── Debounced submission count broadcaster (shared across all sockets) ───────

let submissionCountTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSubmissionCount: { questionId: string; io: Server; engine: GameEngine } | null = null;

let broadcastDebounceMs = 500;

/** Called once from index.ts to set the debounce interval from env. */
export function setBroadcastDebounceMs(ms: number): void {
  broadcastDebounceMs = ms;
}

function scheduleSubmissionCountBroadcast(questionId: string, ioRef: Server, engineRef: GameEngine): void {
  pendingSubmissionCount = { questionId, io: ioRef, engine: engineRef };
  if (submissionCountTimer) return;
  submissionCountTimer = setTimeout(() => {
    submissionCountTimer = null;
    if (!pendingSubmissionCount) return;
    const { questionId: qId, io: sio, engine: eng } = pendingSubmissionCount;
    pendingSubmissionCount = null;
    const fullState = eng.getFullState();
    const totalPlayers = Array.from(fullState.players.values()).filter((p) => p.connected).length;
    sio.emit('game:submission_count', {
      questionId: qId,
      count: getSubmissionCount(eng, qId),
      total: totalPlayers,
    });
  }, broadcastDebounceMs);
}

let speedMathProgressTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSpeedMathProgress: { io: Server; engine: GameEngine; playerId: string; completed: boolean } | null = null;

function scheduleSpeedMathProgressBroadcast(ioRef: Server, engineRef: GameEngine, pid: string, completed: boolean): void {
  pendingSpeedMathProgress = { io: ioRef, engine: engineRef, playerId: pid, completed };
  if (speedMathProgressTimer) return;
  speedMathProgressTimer = setTimeout(() => {
    speedMathProgressTimer = null;
    if (!pendingSpeedMathProgress) return;
    const { io: sio, engine: eng, playerId: id, completed: comp } = pendingSpeedMathProgress;
    pendingSpeedMathProgress = null;
    sio.emit('game:speed_math_progress', {
      playerId: id,
      correctCount: getSpeedMathCorrectCount(eng, id),
      completed: comp,
      totalQuestions: eng.getGeneratedQuestionsForCurrentRound().length,
    });
  }, broadcastDebounceMs);
}

export function registerPlayerHandlers(
  socket: Socket,
  io: Server,
  engine: GameEngine,
  getQuestionImageData: (questionId: string) => string | null,
  schedulePlayerSync: () => void,
  timer: GameTimer,
): void {
  const user = socket.data.user as JwtPayload;
  const playerId = user.discordId;

  // Rate limiters: per socket, per event type
  const answerLimit = createRateLimiter(10, 5000);       // 10 answers per 5s
  const speedMathLimit = createRateLimiter(30, 5000);    // 30 speed math answers per 5s
  const joinLimit = createRateLimiter(3, 5000);         // 3 join/spectate per 5s

  // ── Answer submission ─────────────────────────────────────────────────────

  socket.on('player:submit_answer', (data: { questionId: string; answer: string | number }, callback) => {
    try {
      if (!answerLimit()) {
        if (typeof callback === 'function') callback({ ok: false, error: 'Rate limited' });
        return;
      }
      const { questionId, answer } = data;
      const result = engine.submitAnswer(playerId, questionId, answer);

      if (typeof callback === 'function') {
        callback({ ok: result.accepted, reason: result.reason });
      }

      if (result.accepted) {
        // Send updated state back to submitting player (so they see playerSubmission)
        const base = engine.computeBroadcastBase(getQuestionImageData);
        socket.emit('game:state_change', engine.getPlayerOverlay(playerId, base));

        // Debounced broadcast of submission count (batches rapid submissions)
        scheduleSubmissionCountBroadcast(questionId, io, engine);

        // End timer early if all connected players have answered
        if (engine.haveAllPlayersAnswered()) {
          timer.forceExpire();
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('player:submit_answer error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  // ── Speed math answer ─────────────────────────────────────────────────────

  socket.on('player:speed_math_answer', (data: { questionIndex: number; answer: number }, callback) => {
    try {
      if (!speedMathLimit()) {
        if (typeof callback === 'function') callback({ ok: false, error: 'Rate limited' });
        return;
      }
      const { questionIndex, answer } = data;
      const result = engine.submitSpeedMathAnswer(playerId, questionIndex, answer);

      // Send result back to the submitting player
      socket.emit('player:speed_math_result', {
        questionIndex,
        correct: result.correct,
        completed: result.completed,
      });

      if (typeof callback === 'function') {
        callback({ ok: true, correct: result.correct, completed: result.completed });
      }

      if (result.correct) {
        // Send updated state to this player (next question or completed state)
        const base = engine.computeBroadcastBase(getQuestionImageData);
        socket.emit('game:state_change', engine.getPlayerOverlay(playerId, base));
      }

      // Debounced broadcast of speed math progress
      scheduleSpeedMathProgressBroadcast(io, engine, playerId, result.completed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('player:speed_math_answer error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  // ── Join / Spectate toggle ───────────────────────────────────────────────

  socket.on('player:join_game', (_data, callback) => {
    try {
      if (!joinLimit()) {
        if (typeof callback === 'function') callback({ ok: false, error: 'Rate limited' });
        return;
      }
      if (user.isGuest) {
        if (typeof callback === 'function') callback({ ok: false, reason: 'Guests cannot join as players' });
        return;
      }

      const player = engine.addPlayer(user.discordId, user.username, user.avatarUrl);
      player.socketId = socket.id;

      // Batch-notify others about player roster change
      schedulePlayerSync();

      // Send full state only to the joining player
      const base = engine.computeBroadcastBase(getQuestionImageData);
      socket.emit('game:state_change', engine.getPlayerOverlay(playerId, base));

      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('player:join_game error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('player:spectate', (_data, callback) => {
    try {
      if (!joinLimit()) {
        if (typeof callback === 'function') callback({ ok: false, error: 'Rate limited' });
        return;
      }
      const dropped = engine.dropPlayer(user.discordId);
      if (!dropped) {
        if (typeof callback === 'function') callback({ ok: false, reason: 'Can only switch to spectator during lobby' });
        return;
      }

      schedulePlayerSync();

      // Send updated state only to this socket
      const base = engine.computeBroadcastBase(getQuestionImageData);
      socket.emit('game:state_change', engine.getPlayerOverlay(null, base));

      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('player:spectate error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    engine.removePlayer(playerId);
    schedulePlayerSync();
  });

}

// ── Module-level helpers ──────────────────────────────────────────────────────

function getSubmissionCount(engine: GameEngine, questionId: string): number {
  const fullState = engine.getFullState();
  const gameState = fullState.currentState;

  if (gameState === GameState.FINALE_QUESTION) {
    const submissions = fullState.finaleState.submissions.get(questionId);
    return submissions?.length ?? 0;
  }

  const roundState = fullState.roundStates[fullState.currentRoundIndex];
  const submissions = roundState?.submissions.get(questionId);
  return submissions?.length ?? 0;
}

function getSpeedMathCorrectCount(engine: GameEngine, playerId: string): number {
  const fullState = engine.getFullState();
  const roundState = fullState.roundStates[fullState.currentRoundIndex];
  const playerState = roundState?.speedMathStates.get(playerId);
  return playerState?.correctCount ?? 0;
}
