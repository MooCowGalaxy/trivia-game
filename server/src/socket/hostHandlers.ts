import type { Server, Socket } from 'socket.io';
import type { GameEngine } from '../game/engine.js';
import type { GameTimer } from '../game/timer.js';
import { GameState } from '../game/types.js';
import type { TransitionAction } from '../game/types.js';
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
    if (!user.isHost) {
      throw new Error('Only the host can perform this action');
    }
  }

  function broadcastState(): void {
    for (const [, s] of io.sockets.sockets) {
      const u = s.data.user as JwtPayload | undefined;
      const pid = u?.discordId ?? null;
      s.emit('game:state_change', engine.getPublicStateForPlayer(pid, getQuestionImageData));
    }
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
        engine.endTimer();
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
