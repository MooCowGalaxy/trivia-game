import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import authRouter from './auth/discord.js';
import { authenticateSocket } from './middleware/authMiddleware.js';
import type { JwtPayload } from './middleware/authMiddleware.js';
import { loadGameConfig } from './questions/loader.js';
import { loadCategoryQuestions } from './questions/categoryParser.js';
import { generateSpeedMathQuestions } from './questions/generator.js';
import { renderMathExpression } from './questions/renderer.js';
import { GameEngine } from './game/engine.js';
import { GameTimer } from './game/timer.js';
import { GameState } from './game/types.js';
import type { GeneratedQuestion } from './game/types.js';
import { registerHostHandlers } from './socket/hostHandlers.js';
import { registerPlayerHandlers } from './socket/playerHandlers.js';

// ── Load game config ──────────────────────────────────────────────────────────

const configFile = process.env.GAME_CONFIG ?? 'default.json';
const configPath = path.resolve(__dirname, '..', 'config', 'games', configFile);
console.log(`Loading game config from: ${configPath}`);
const gameConfig = loadGameConfig(configPath);

// ── Resolve category-sourced questions ────────────────────────────────────────

for (let i = 0; i < gameConfig.rounds.length; i++) {
  const round = gameConfig.rounds[i]!;
  if (round.categorySource) {
    console.log(
      `Loading category questions for round ${round.roundNumber} from [${round.categorySource.categories.join(', ')}]...`,
    );
    const questions = loadCategoryQuestions({
      ...round.categorySource,
      idPrefix: `r${round.roundNumber}`,
    });
    round.questions = questions;
    console.log(`  Loaded ${questions.length} questions for round ${round.roundNumber}`);
  }
}

if (gameConfig.finale?.categorySource) {
  console.log(
    `Loading category questions for finale from [${gameConfig.finale.categorySource.categories.join(', ')}]...`,
  );
  const questions = loadCategoryQuestions({
    ...gameConfig.finale.categorySource,
    idPrefix: 'fin',
  });
  gameConfig.finale.questions = questions;
  console.log(`  Loaded ${questions.length} questions for finale`);
}

// ── Generate speed math questions and render as images ────────────────────────

const generatedQuestionsMap = new Map<number, GeneratedQuestion[]>();

for (let i = 0; i < gameConfig.rounds.length; i++) {
  const round = gameConfig.rounds[i]!;
  if (round.type === 'speed_math' && round.generatorParams) {
    console.log(`Generating speed math questions for round ${round.roundNumber}...`);
    const expressions = generateSpeedMathQuestions(round.generatorParams);

    const generated: GeneratedQuestion[] = expressions.map((expr) => ({
      id: expr.id,
      imageDataUrl: renderMathExpression(expr.expression),
      correctAnswer: expr.correctAnswer,
    }));

    generatedQuestionsMap.set(i, generated);
    console.log(`  Generated ${generated.length} questions for round ${round.roundNumber}`);
  }
}

// ── Create game engine and timer ──────────────────────────────────────────────

const engine = new GameEngine(gameConfig, generatedQuestionsMap);
const timer = new GameTimer();

// ── getQuestionImageData helper ───────────────────────────────────────────────

// Question images live server-side only — never served statically
const assetsDir = path.resolve(__dirname, '..', 'assets');

function resolveImagePath(src: string): string {
  // src is like "/assets/questions/pattern_01.png" — strip the leading /assets/
  const relativeSrc = src.replace(/^\/+assets\//, '');
  return path.resolve(assetsDir, relativeSrc);
}

function readImageAsDataUrl(imagePath: string): string | null {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/png';
    return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  } catch (err) {
    console.error(`Failed to read image at ${imagePath}:`, err);
    return null;
  }
}

function getQuestionImageData(questionId: string): string | null {
  // Check generated questions first (speed math)
  for (const [, questions] of generatedQuestionsMap) {
    const found = questions.find((q) => q.id === questionId);
    if (found) {
      return found.imageDataUrl;
    }
  }

  // Check static image questions in all rounds and finale
  const allQuestions = [
    ...gameConfig.rounds.flatMap((r) => r.questions ?? []),
    ...(gameConfig.finale?.questions ?? []),
  ];

  for (const question of allQuestions) {
    if (question.id === questionId && question.display.type === 'image' && question.display.src) {
      return readImageAsDataUrl(resolveImagePath(question.display.src));
    }
  }

  return null;
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Mount auth routes
app.use('/auth', authRouter);

// Serve client build (static assets)
const clientDistDir = path.resolve(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDistDir));


// API: get current game state (for reconnection / initial page load)
app.get('/api/game/state', (_req, res) => {
  res.json(engine.getPublicState());
});

// SPA catch-all: serve index.html for any unmatched routes
app.get('{*path}', (_req, res) => {
  const indexPath = path.join(clientDistDir, 'index.html');
  res.sendFile(indexPath);
});

// ── HTTP + Socket.io server ───────────────────────────────────────────────────

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

// Authenticate all socket connections
io.use(authenticateSocket);

// ── Socket connection handler ─────────────────────────────────────────────────

io.on('connection', (socket) => {
  const user = socket.data.user as JwtPayload;
  console.log(`Socket connected: ${user.username} (${user.discordId}) [host=${user.isHost}]`);

  // In dev mode, if this user's JWT says they're the host, update the game config
  // so the engine recognizes their generated discordId as the host
  if (process.env.DEV_MODE === 'true' && user.isHost) {
    gameConfig.settings.hostDiscordId = user.discordId;
  }

  const existingPlayer = engine.getPlayers().get(user.discordId);
  const currentState = engine.getGameState();

  // Guests are always spectators — skip player management
  if (user.isGuest) {
    console.log(`  Guest spectator connected: ${user.username}`);
    socket.emit('game:state_change', engine.getPublicStateForPlayer(null, getQuestionImageData));
    registerPlayerHandlers(socket, io, engine, getQuestionImageData);

    socket.on('disconnect', () => {
      console.log(`  Guest spectator disconnected: ${user.username}`);
    });
    return;
  }

  if (existingPlayer) {
    // Reconnection — update socket mapping
    const reconnected = engine.reconnectPlayer(user.discordId, socket.id);
    console.log(`  Reconnected player: ${user.username}`);

    if (reconnected) {
      // Notify others this player is back online
      io.emit('game:player_joined', {
        id: reconnected.id,
        username: reconnected.username,
        avatarUrl: reconnected.avatarUrl,
        score: reconnected.score,
        connected: true,
      });

      // Broadcast per-player state to all sockets
      for (const [, s] of io.sockets.sockets) {
        const u = s.data.user as JwtPayload | undefined;
        const pid = u?.discordId ?? null;
        s.emit('game:state_change', engine.getPublicStateForPlayer(pid, getQuestionImageData));
      }
    }
  } else if (currentState === GameState.LOBBY) {
    // New player joining during lobby (host is also a player)
    try {
      const player = engine.addPlayer(user.discordId, user.username, user.avatarUrl);
      player.socketId = socket.id;
      console.log(`  New player added: ${user.username}`);

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
    } catch (err) {
      console.error(`  Failed to add player ${user.username}:`, err);
    }
  } else {
    // Game has left lobby — connect as spectator (they can join via player:join_game)
    console.log(`  Spectator connected: ${user.username} (game in ${currentState})`);
    socket.emit('game:state_change', engine.getPublicStateForPlayer(null, getQuestionImageData));
  }

  // Register host handlers if this is the host
  if (user.isHost) {
    registerHostHandlers(socket, io, engine, timer, getQuestionImageData);
  }

  // Register player handlers for all connections (handles submit, disconnect, reconnect logic)
  registerPlayerHandlers(socket, io, engine, getQuestionImageData);
});

// ── Start listening ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`challenge server running on port ${PORT}`);
  console.log(`  Game ID: ${gameConfig.gameId}`);
  console.log(`  Rounds: ${gameConfig.rounds.length}`);
  console.log(`  Finale questions: ${gameConfig.finale?.questions?.length ?? 0}`);
});
