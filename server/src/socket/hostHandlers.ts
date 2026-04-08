import type { Server, Socket } from 'socket.io';
import type { GameEngine } from '../game/engine.js';
import type { GameTimer } from '../game/timer.js';
import { GameState } from '../game/types.js';
import type { TransitionAction, LeaderboardEntry } from '../game/types.js';
import type { JwtPayload } from '../middleware/authMiddleware.js';

export function registerHostHandlers(
  socket: Socket,
  io: Server,
  engine: GameEngine,
  timer: GameTimer,
  getQuestionImageData: (questionId: string) => string | null,
): void {
  const user = socket.data.user as JwtPayload;

  function assertHost(): void {
    if (user.discordId !== engine.getFullState().config.settings.hostDiscordId) {
      throw new Error('Only the host can perform this action');
    }
  }

  // States where the overlay adds per-player data (submission, speed math, round points)
  const perPlayerStates = new Set([
    GameState.QUESTION_ACTIVE,
    GameState.QUESTION_REVEAL,
    GameState.SPEED_MATH_ACTIVE,
    GameState.FINALE_QUESTION,
    GameState.FINALE_REVEAL,
    GameState.ROUND_RESULTS,
  ]);

  function broadcastState(): void {
    const base = engine.computeBroadcastBase(getQuestionImageData);
    const st = engine.getGameState();

    if (perPlayerStates.has(st)) {
      // Per-player overlay needed — loop sockets
      for (const [, s] of io.sockets.sockets) {
        const u = s.data.user as JwtPayload | undefined;
        const pid = u?.discordId ?? null;
        s.emit('game:state_change', engine.getPlayerOverlay(pid, base));
      }
    } else {
      // Identical payload for everyone — single broadcast, no per-socket loop
      const payload = engine.getPlayerOverlay(null, base);
      io.emit('game:state_change', payload);
    }
  }

  function emitLeaderboardUpdate(previous: LeaderboardEntry[], current: LeaderboardEntry[]): void {
    io.emit('game:leaderboard_update', { previous, current });
  }

  function startTimerForState(): void {
    const state = engine.getGameState();
    let durationMs: number;

    if (state === GameState.QUESTION_COUNTDOWN) {
      durationMs = 3000; // 3 second countdown
    } else if (state === GameState.SPEED_MATH_ACTIVE || state === GameState.QUESTION_ACTIVE) {
      durationMs = engine.getCurrentRoundConfig().timerSeconds * 1000;
    } else if (state === GameState.FINALE_QUESTION) {
      durationMs = (engine.getFullState().config.finale?.timerSeconds ?? 30) * 1000;
    } else {
      return;
    }

    timer.start(
      durationMs,
      (remainingMs) => {
        io.emit('game:timer_sync', { remainingMs });
      },
      () => {
        // Snapshot leaderboard before scoring so we can animate changes
        const prevState = engine.getGameState();
        const willScore =
          prevState === GameState.QUESTION_ACTIVE ||
          prevState === GameState.SPEED_MATH_ACTIVE;
        const previousLeaderboard = willScore ? engine.getLeaderboard() : null;

        engine.endTimer();

        // Emit leaderboard update if scoring just happened
        if (previousLeaderboard) {
          emitLeaderboardUpdate(previousLeaderboard, engine.getLeaderboard());
        }

        // If countdown just ended, start a new timer for the question
        const newState = engine.getGameState();
        if (
          newState === GameState.QUESTION_ACTIVE ||
          newState === GameState.SPEED_MATH_ACTIVE ||
          newState === GameState.FINALE_QUESTION
        ) {
          startTimerForState();
        }
        broadcastState();
      },
    );
  }

  function handleTransition(action: TransitionAction): void {
    assertHost();
    timer.stop();
    engine.transition(action, user.discordId);

    const newState = engine.getGameState();

    // Start timer for countdown and active question states
    if (
      newState === GameState.QUESTION_COUNTDOWN ||
      newState === GameState.QUESTION_ACTIVE ||
      newState === GameState.SPEED_MATH_ACTIVE ||
      newState === GameState.FINALE_QUESTION
    ) {
      startTimerForState();
    }

    broadcastState();
  }

  socket.on('host:start_game', (_data, callback) => {
    try {
      handleTransition('start_game');
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('host:start_game error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('host:start_round', (_data, callback) => {
    try {
      handleTransition('start_round');
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('host:start_round error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('host:next_question', (_data, callback) => {
    try {
      handleTransition('next_question');
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('host:next_question error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('host:next_round', (_data, callback) => {
    try {
      handleTransition('next_round');
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('host:next_round error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('host:start_finale', (_data, callback) => {
    try {
      handleTransition('start_finale');
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('host:start_finale error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('host:next_finale_question', (_data, callback) => {
    try {
      handleTransition('next_finale_question');
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('host:next_finale_question error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('host:end_game', (_data, callback) => {
    try {
      handleTransition('end_game');
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('host:end_game error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });
}
