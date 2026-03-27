import type { Server, Socket } from 'socket.io';
import type { GameEngine } from '../game/engine.js';
import { GameState } from '../game/types.js';
import type { JwtPayload } from '../middleware/authMiddleware.js';

export function registerPlayerHandlers(
  socket: Socket,
  io: Server,
  engine: GameEngine,
  getQuestionImageData: (questionId: string) => string | null,
): void {
  const user = socket.data.user as JwtPayload;
  const playerId = user.discordId;

  // ── Answer submission ─────────────────────────────────────────────────────

  socket.on('player:submit_answer', (data: { questionId: string; answer: string | number }, callback) => {
    try {
      const { questionId, answer } = data;
      const result = engine.submitAnswer(playerId, questionId, answer);

      if (typeof callback === 'function') {
        callback({ ok: result.accepted, reason: result.reason });
      }

      if (result.accepted) {
        // Send updated state back to submitting player (so they see playerSubmission)
        socket.emit('game:state_change', engine.getPublicStateForPlayer(playerId, getQuestionImageData));

        // Broadcast submission count so clients can show progress
        const publicState = engine.getPublicState();
        const totalPlayers = publicState.players.filter((p) => p.connected).length;
        io.emit('game:submission_count', {
          questionId,
          count: getSubmissionCount(engine, questionId),
          total: totalPlayers,
        });
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
        socket.emit('game:state_change', engine.getPublicStateForPlayer(playerId, getQuestionImageData));
      }

      // Broadcast progress to everyone
      io.emit('game:speed_math_progress', {
        playerId,
        correctCount: getSpeedMathCorrectCount(engine, playerId),
        completed: result.completed,
        totalQuestions: engine.getGeneratedQuestionsForCurrentRound().length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('player:speed_math_answer error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  // ── Join / Spectate toggle ───────────────────────────────────────────────

  socket.on('player:join_game', (_data, callback) => {
    try {
      if (user.isGuest) {
        if (typeof callback === 'function') callback({ ok: false, reason: 'Guests cannot join as players' });
        return;
      }

      const player = engine.addPlayer(user.discordId, user.username, user.avatarUrl);
      player.socketId = socket.id;

      // Broadcast to everyone that a new player joined
      io.emit('game:player_joined', {
        id: player.id,
        username: player.username,
        avatarUrl: player.avatarUrl,
        score: player.score,
        connected: player.connected,
      });

      // Broadcast per-player state to all sockets
      for (const [, s] of io.sockets.sockets) {
        const u = s.data.user as JwtPayload | undefined;
        const pid = u?.discordId ?? null;
        s.emit('game:state_change', engine.getPublicStateForPlayer(pid, getQuestionImageData));
      }

      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('player:join_game error:', message);
      if (typeof callback === 'function') callback({ ok: false, error: message });
    }
  });

  socket.on('player:spectate', (_data, callback) => {
    try {
      const dropped = engine.dropPlayer(user.discordId);
      if (!dropped) {
        if (typeof callback === 'function') callback({ ok: false, reason: 'Can only switch to spectator during lobby' });
        return;
      }

      io.emit('game:player_left', { id: user.discordId });

      // Broadcast per-player state to all sockets
      for (const [, s] of io.sockets.sockets) {
        const u = s.data.user as JwtPayload | undefined;
        const pid = u?.discordId ?? null;
        s.emit('game:state_change', engine.getPublicStateForPlayer(pid, getQuestionImageData));
      }

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
    io.emit('game:player_left', { id: playerId });

    // Broadcast updated state to all remaining sockets
    for (const [, s] of io.sockets.sockets) {
      const u = s.data.user as JwtPayload | undefined;
      const pid = u?.discordId ?? null;
      s.emit('game:state_change', engine.getPublicStateForPlayer(pid, getQuestionImageData));
    }
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
