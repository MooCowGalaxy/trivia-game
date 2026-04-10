import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createAuthRouter } from './auth/discord.js';
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
import { registerPlayerHandlers, setBroadcastDebounceMs } from './socket/playerHandlers.js';

// ── Broadcast debounce interval (ms) ─────────────────────────────────────────

const DEBOUNCE_MS = parseInt(process.env.BROADCAST_DEBOUNCE_MS ?? '500', 10);
setBroadcastDebounceMs(DEBOUNCE_MS);

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

// ── Image cache: read and base64-encode each image only once ─────────────────

const imageCache = new Map<string, string | null>();

function readImageAsDataUrl(imagePath: string): string | null {
  const cached = imageCache.get(imagePath);
  if (cached !== undefined) return cached;

  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/png';
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    imageCache.set(imagePath, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error(`Failed to read image at ${imagePath}:`, err);
    imageCache.set(imagePath, null);
    return null;
  }
}

// Pre-build a lookup from questionId → image data URL for all static image questions
const questionImageCache = new Map<string, string | null>();

function buildQuestionImageCache(): void {
  const allQuestions = [
    ...gameConfig.rounds.flatMap((r) => r.questions ?? []),
    ...(gameConfig.finale?.questions ?? []),
  ];
  for (const question of allQuestions) {
    if (question.display?.type === 'image' && question.display.src) {
      questionImageCache.set(question.id, readImageAsDataUrl(resolveImagePath(question.display.src)));
    }
  }
}

buildQuestionImageCache();

function getQuestionImageData(questionId: string): string | null {
  // Check generated questions first (speed math)
  for (const [, questions] of generatedQuestionsMap) {
    const found = questions.find((q) => q.id === questionId);
    if (found) {
      return found.imageDataUrl;
    }
  }

  // Check pre-cached static image questions
  const cached = questionImageCache.get(questionId);
  if (cached !== undefined) return cached;

  return null;
}

// ── Express app ───────────────────────────────────────────────────────────────

const allowedOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());

// Rate limit auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
});

// Mount auth routes
const authRouter = createAuthRouter((devHostId) => {
  gameConfig.settings.hostDiscordId = devHostId;
});
// In dev mode, skip rate limiting on /auth/dev so load tests can create many tokens
const isDevMode = process.env.DEV_MODE === 'true';
const conditionalAuthLimiter: express.RequestHandler = (req, res, next) => {
  if (isDevMode && req.path === '/dev') {
    return next();
  }
  return authLimiter(req, res, next);
};
app.use('/auth', conditionalAuthLimiter, authRouter);

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
    origin: allowedOrigin,
    credentials: true,
  },
});

// Authenticate all socket connections
io.use(authenticateSocket);

// ── Debounced player list sync ────────────────────────────────────────────────
// Batches rapid player_joined / player_left events into a single broadcast.

let playerSyncTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePlayerSync(): void {
  if (playerSyncTimer) return; // already scheduled
  playerSyncTimer = setTimeout(() => {
    playerSyncTimer = null;
    const players = Array.from(engine.getPlayers().values()).map((p) => ({
      id: p.id,
      username: p.username,
      avatarUrl: p.avatarUrl,
      score: p.score,
      connected: p.connected,
    }));
    io.emit('game:players_sync', players);
  }, DEBOUNCE_MS);
}

// ── Socket connection handler ─────────────────────────────────────────────────

io.on('connection', (socket) => {
  const user = socket.data.user as JwtPayload;
  const isHost = user.discordId === gameConfig.settings.hostDiscordId;
  console.log(`Socket connected: ${user.username} (${user.discordId}) [host=${isHost}]`);

  const existingPlayer = engine.getPlayers().get(user.discordId);
  const currentState = engine.getGameState();

  // Guests are always spectators — skip player management
  if (user.isGuest) {
    console.log(`  Guest spectator connected: ${user.username}`);
    const guestBase = engine.computeBroadcastBase(getQuestionImageData);
    socket.emit('game:state_change', engine.getPlayerOverlay(null, guestBase));
    socket.emit('game:leaderboard_update', { previous: engine.getLeaderboard(), current: engine.getLeaderboard() });
    registerPlayerHandlers(socket, io, engine, getQuestionImageData, schedulePlayerSync, timer);

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
      // Batch-notify others about player roster change
      schedulePlayerSync();

      // Send full state only to the reconnecting player
      const base = engine.computeBroadcastBase(getQuestionImageData);
      socket.emit('game:state_change', engine.getPlayerOverlay(user.discordId, base));
      socket.emit('game:leaderboard_update', { previous: engine.getLeaderboard(), current: engine.getLeaderboard() });
    }
  } else if (currentState === GameState.LOBBY) {
    // New player joining during lobby (host is also a player)
    try {
      const player = engine.addPlayer(user.discordId, user.username, user.avatarUrl);
      player.socketId = socket.id;
      console.log(`  New player added: ${user.username}`);

      // Batch-notify others about player roster change
      schedulePlayerSync();

      // Send full state only to the joining player
      const base = engine.computeBroadcastBase(getQuestionImageData);
      socket.emit('game:state_change', engine.getPlayerOverlay(user.discordId, base));
    } catch (err) {
      console.error(`  Failed to add player ${user.username}:`, err);
    }
  } else {
    // Game has left lobby — connect as spectator (they can join via player:join_game)
    console.log(`  Spectator connected: ${user.username} (game in ${currentState})`);
    const specBase = engine.computeBroadcastBase(getQuestionImageData);
    socket.emit('game:state_change', engine.getPlayerOverlay(null, specBase));
    socket.emit('game:leaderboard_update', { previous: engine.getLeaderboard(), current: engine.getLeaderboard() });
  }

  // Register host handlers if this is the host
  if (isHost) {
    registerHostHandlers(socket, io, engine, timer, getQuestionImageData);
  }

  // Register player handlers for all connections (handles submit, disconnect, reconnect logic)
  registerPlayerHandlers(socket, io, engine, getQuestionImageData, schedulePlayerSync, timer);
});

// ── Start listening ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`challenge server running on port ${PORT}`);
  console.log(`  Game ID: ${gameConfig.gameId}`);
  console.log(`  Rounds: ${gameConfig.rounds.length}`);
  console.log(`  Finale questions: ${gameConfig.finale?.questions?.length ?? 0}`);
});
