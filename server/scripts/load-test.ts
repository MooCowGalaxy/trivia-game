/**
 * Load test script: spawns N simulated players against a dev-mode server.
 *
 * Usage:
 *   npx tsx scripts/load-test.ts [numClients] [serverUrl] [--host]
 *
 * Defaults: 1000 clients, http://localhost:3000
 *
 * With --host: also creates a host connection that automatically drives
 * the game forward (start game, start rounds, next question, etc.)
 * with a 5-second delay between transitions.
 *
 * Prerequisites:
 *   - Server must be running in DEV_MODE=true
 *   - Without --host: a human host must drive the game from a browser
 *   - With --host: the script creates its own host and runs the game
 *
 * Each simulated player will:
 *   1. Authenticate via GET /auth/dev?username=Bot_N
 *   2. Connect via Socket.io with the returned JWT
 *   3. Listen for game:state_change events
 *   4. When a multiple-choice question is active, submit a random answer
 *      after a random delay (between 0.5s and timerSeconds)
 */

import { io, type Socket } from 'socket.io-client';

// ── Config ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));

const NUM_CLIENTS = parseInt(args[0] ?? '1000', 10);
const SERVER_URL = args[1] ?? 'http://localhost:3000';
const AUTO_HOST = flags.includes('--host');
const CONNECT_BATCH_SIZE = 50;   // connect this many at a time
const BATCH_DELAY_MS = 200;      // delay between batches
const HOST_TRANSITION_DELAY_MS = 5000; // delay between host transitions

// ── Stats ────────────────────────────────────────────────────────────────────

const stats = {
  connected: 0,
  authFailed: 0,
  connectFailed: 0,
  answersSubmitted: 0,
  answersAccepted: 0,
  answersRejected: 0,
  stateChanges: 0,
  currentState: 'unknown',
};

let statsInterval: ReturnType<typeof setInterval>;

function printStats() {
  process.stdout.write(
    `\r[stats] connected=${stats.connected}/${NUM_CLIENTS}  ` +
    `submitted=${stats.answersSubmitted} accepted=${stats.answersAccepted} rejected=${stats.answersRejected}  ` +
    `state_changes=${stats.stateChanges}  ` +
    `state=${stats.currentState}  ` +
    `auth_fail=${stats.authFailed} conn_fail=${stats.connectFailed}     `,
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(username: string, host = false): Promise<string | null> {
  try {
    const url = `${SERVER_URL}/auth/dev?username=${encodeURIComponent(username)}${host ? '&host=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (host) {
        const body = await res.text().catch(() => '');
        console.error(`\n[host auth] ${res.status} ${res.statusText}: ${body}`);
      }
      stats.authFailed++;
      return null;
    }
    const data = (await res.json()) as { token: string };
    return data.token;
  } catch (err) {
    if (host) {
      console.error('\n[host auth] fetch error:', err);
    }
    stats.authFailed++;
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

// ── Host simulation ──────────────────────────────────────────────────────────

function createHost(token: string): Socket {
  const socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ['websocket'],
    auth: { token },
  });

  let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

  function emitHost(event: string) {
    socket.emit(event, null, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) {
        console.log(`\n[host] ${event} failed: ${res?.error ?? 'unknown'}`);
      }
    });
  }

  function scheduleTransition(event: string, delayMs = HOST_TRANSITION_DELAY_MS) {
    if (transitionTimeout) clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(() => emitHost(event), delayMs);
  }

  socket.on('connect', () => {
    console.log('[host] connected');
  });

  socket.on('game:state_change', (state: { currentState: string }) => {
    stats.currentState = state.currentState;

    switch (state.currentState) {
      case 'LOBBY':
        scheduleTransition('host:start_game');
        console.log('\n[host] LOBBY — starting game in 5s...');
        break;

      case 'ROUND_INTRO':
        scheduleTransition('host:start_round');
        break;

      case 'QUESTION_REVEAL':
        // Wait 5s after results show, then advance
        scheduleTransition('host:next_question');
        break;

      case 'ROUND_RESULTS':
        scheduleTransition('host:next_round');
        break;

      case 'FINALE_INTRO':
        scheduleTransition('host:start_finale');
        break;

      case 'FINALE_REVEAL':
        scheduleTransition('host:next_finale_question');
        break;

      case 'GAME_OVER':
        console.log('\n[host] GAME_OVER — game finished');
        break;

      // QUESTION_COUNTDOWN, QUESTION_ACTIVE, SPEED_MATH_ACTIVE, FINALE_QUESTION
      // are timer-driven — no host action needed
    }
  });

  socket.connect();
  return socket;
}

// ── Client simulation ────────────────────────────────────────────────────────

function createClient(token: string): Socket {
  const socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ['websocket'],
    auth: { token },
  });

  // Track which question we've already answered to avoid duplicates
  let answeredQuestionId: string | null = null;
  let answerTimeout: ReturnType<typeof setTimeout> | null = null;

  socket.on('connect', () => {
    stats.connected++;
  });

  socket.on('connect_error', () => {
    stats.connectFailed++;
  });

  socket.on('disconnect', () => {
    stats.connected--;
  });

  socket.on('game:state_change', (state: {
    currentState: string;
    currentQuestion: { id: string; options?: string[]; answerType: string } | null;
    questionOptions: string[] | null;
    questionAnswerType: string | null;
    questionTimerSeconds: number | null;
  }) => {
    stats.stateChanges++;
    stats.currentState = state.currentState;

    // Only answer during active question states
    if (state.currentState !== 'QUESTION_ACTIVE' && state.currentState !== 'FINALE_QUESTION') {
      // Reset for next question
      if (state.currentState !== 'QUESTION_COUNTDOWN') {
        answeredQuestionId = null;
      }
      if (answerTimeout) {
        clearTimeout(answerTimeout);
        answerTimeout = null;
      }
      return;
    }

    const question = state.currentQuestion;
    if (!question || question.id === answeredQuestionId) return;

    // Determine answer options
    const options = state.questionOptions ?? question.options;
    const answerType = state.questionAnswerType ?? question.answerType;

    let answer: string | number;

    if (options && options.length > 0) {
      // Multiple choice — pick a random option
      answer = options[Math.floor(Math.random() * options.length)]!;
    } else if (answerType === 'number' || answerType === 'fermi') {
      // Numeric answer — guess a random number
      answer = Math.floor(Math.random() * 1000);
    } else {
      // Text answer — random guess
      answer = `guess_${Math.floor(Math.random() * 100)}`;
    }

    const timerMs = (state.questionTimerSeconds ?? 15) * 1000;
    const maxDelay = Math.max(timerMs * 0.5, 1000); // submit within first 50% of timer

    answeredQuestionId = question.id;

    // Submit after a random delay
    answerTimeout = setTimeout(() => {
      stats.answersSubmitted++;
      socket.emit(
        'player:submit_answer',
        { questionId: question.id, answer },
        (res: { ok: boolean }) => {
          if (res?.ok) {
            stats.answersAccepted++;
          } else {
            stats.answersRejected++;
          }
        },
      );
    }, 500 + Math.random() * maxDelay);
  });

  socket.connect();
  return socket;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Load test: spawning ${NUM_CLIENTS} clients against ${SERVER_URL}`);
  if (AUTO_HOST) console.log('Auto-host mode enabled');
  console.log(`Connecting in batches of ${CONNECT_BATCH_SIZE}...\n`);

  statsInterval = setInterval(printStats, 500);

  const sockets: Socket[] = [];

  for (let batch = 0; batch < Math.ceil(NUM_CLIENTS / CONNECT_BATCH_SIZE); batch++) {
    const start = batch * CONNECT_BATCH_SIZE;
    const end = Math.min(start + CONNECT_BATCH_SIZE, NUM_CLIENTS);

    const batchPromises: Promise<void>[] = [];

    for (let i = start; i < end; i++) {
      const username = `Bot_${String(i).padStart(4, '0')}`;
      batchPromises.push(
        getToken(username).then((token) => {
          if (token) {
            sockets.push(createClient(token));
          }
        }),
      );
    }

    await Promise.all(batchPromises);
    await delay(BATCH_DELAY_MS);
  }

  console.log(`\nAll ${NUM_CLIENTS} clients launched.`);

  // Wait until all clients have connected
  console.log('Waiting for all clients to connect...');
  while (stats.connected < NUM_CLIENTS - stats.authFailed - stats.connectFailed) {
    await delay(500);
  }
  console.log(`\n${stats.connected} clients connected.`);

  // Create host after all players are in
  if (AUTO_HOST) {
    let hostToken: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      hostToken = await getToken('LoadTestHost', true);
      if (hostToken) break;
      console.log(`\n[host] Auth attempt ${attempt + 1}/5 failed, retrying in 2s...`);
      await delay(2000);
    }
    if (!hostToken) {
      console.error('\nFailed to authenticate host after 5 attempts — is the server running with DEV_MODE=true?');
      process.exit(1);
    }
    sockets.push(createHost(hostToken));
    console.log('[host] Connecting... game will start in 5s');
  }

  console.log('Press Ctrl+C to stop.\n');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down...');
    clearInterval(statsInterval);
    printStats();
    console.log('\nDisconnecting all clients...');
    for (const s of sockets) {
      s.disconnect();
    }
    console.log('Done.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
