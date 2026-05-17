# Architecture Overview

## Stack

- **Server**: Express + Socket.io (TypeScript, Node.js)
- **Client**: Vite + React (TypeScript), shadcn/ui components
- **Auth**: Discord OAuth2 + JWT (httpOnly cookies), dev mode with username-only login, guest spectator access
- **State**: All game state in-memory (no database)

## Project Structure

```
server/
├── src/
│   ├── index.ts                 # Express + Socket.io bootstrap, connection handler
│   ├── auth/
│   │   └── discord.ts           # Discord OAuth2, dev login, guest login
│   ├── game/
│   │   ├── engine.ts            # Core state machine (GameEngine class)
│   │   ├── scoring.ts           # Scoring algorithms per round type
│   │   ├── timer.ts             # Server-authoritative countdown timer
│   │   └── types.ts             # All game types and interfaces
│   ├── questions/
│   │   ├── loader.ts            # JSON config validation and loading
│   │   ├── categoryParser.ts    # Loads questions from category JSON files
│   │   ├── generator.ts         # Speed math expression generation
│   │   └── renderer.ts          # Math expression to PNG rendering (node-canvas)
│   ├── socket/
│   │   ├── hostHandlers.ts      # Host-only socket events (transitions, timer management)
│   │   └── playerHandlers.ts    # Player socket events (answers, join/spectate, disconnect)
│   └── middleware/
│       └── authMiddleware.ts    # JWT verification for HTTP + socket connections
├── config/games/                # Game config JSON files (one per session)
└── assets/questions/            # Static question images

client/
├── src/
│   ├── App.tsx                  # View router (maps game state to view components)
│   ├── socket.ts                # Socket.io client singleton
│   ├── context/
│   │   ├── GameContext.tsx       # Game state provider (all socket event listeners)
│   │   └── AuthContext.tsx       # Auth state (Discord, dev, guest login flows)
│   ├── views/                   # One component per game state
│   │   ├── Lobby.tsx
│   │   ├── RoundIntro.tsx
│   │   ├── QuestionCountdown.tsx
│   │   ├── QuestionActive.tsx
│   │   ├── QuestionReveal.tsx
│   │   ├── RoundResults.tsx
│   │   ├── SpeedMathActive.tsx
│   │   ├── FinaleIntro.tsx
│   │   ├── FinaleQuestion.tsx
│   │   └── GameOver.tsx
│   ├── components/              # Shared UI components
│   │   ├── Leaderboard.tsx
│   │   ├── AnimatedLeaderboard.tsx
│   │   ├── LeaderboardModal.tsx
│   │   ├── PlayerList.tsx
│   │   ├── Podium.tsx
│   │   ├── SpectatorBanner.tsx
│   │   ├── GameProgressBar.tsx
│   │   └── UserInfoDisplay.tsx
│   ├── host/
│   │   ├── HostControls.tsx
│   │   ├── HostDashboard.tsx
│   │   └── HostOverlay.tsx
│   └── hooks/
│       ├── useAuth.ts
│       └── useGameState.ts
```

## Game State Machine

```
LOBBY
  └─ start_game ─► ROUND_INTRO
                      ├─ start_round (speed_math) ─► SPEED_MATH_ACTIVE
                      │                                 └─ timer expires ─► ROUND_RESULTS
                      ├─ start_round (fifteen) ─► FIFTEEN_ACTIVE
                      │                              ├─ first N verified solvers ─► ROUND_RESULTS
                      │                              └─ timer / host ends round ─► ROUND_RESULTS
                      ├─ start_round (flow_connect) ─► FLOW_CONNECT_ACTIVE
                      │                                    ├─ first N verified solvers ─► ROUND_RESULTS
                      │                                    └─ timer / host ends round ─► ROUND_RESULTS
                      └─ start_round (other) ─► QUESTION_COUNTDOWN (3s)
                                                   └─ timer expires ─► QUESTION_ACTIVE
                                                                          └─ timer expires ─► QUESTION_REVEAL
                                                                                                ├─ next_question ─► QUESTION_COUNTDOWN
                                                                                                └─ last question ─► ROUND_RESULTS
ROUND_RESULTS
  ├─ next_round ─► ROUND_INTRO (next round)
  ├─ last round + finale configured ─► FINALE_INTRO
  └─ last round + no finale ─► GAME_OVER

FINALE_INTRO
  └─ start_finale ─► FINALE_QUESTION
                        └─ timer expires ─► FINALE_REVEAL
                                              ├─ next + no winner yet ─► FINALE_QUESTION
                                              └─ winner or out of questions ─► GAME_OVER
```

All transitions are host-initiated. Timers are server-authoritative.

## Scoring

**Standard rounds**: `basePoints + speedBonus` for correct answers, 0 for incorrect. Speed bonus is rank-based among correct answerers (earliest submission = highest bonus).

**Speed math**: `floor(basePoints * correctCount / totalQuestions)` + speed bonus for players who completed all questions, ranked by completion time.

**Fifteen**: The server generates one shared solvable 4x4 board. Clients submit a Base64-packed 4-bit move list after local solve detection; the server replays every move and scores only the first configured N verified solvers using standard base + rank speed bonus.

**Flow Connect**: The server generates a filled solved grid, sends only endpoint coordinates, and accepts any submitted final grid where all colors form single non-branching paths between endpoints and every cell is filled. The first configured N verified solvers score with standard base + rank speed bonus.

**Fermi estimation**: Rank by proximity to correct answer (`|playerAnswer - correctAnswer|`). Points linearly scaled from max to 0 based on rank.

**Finale (sudden death)**: No points. First correct submission (by timestamp) wins the question. First to N wins takes the game.

**Tiebreaker**: Players with equal scores are ranked by total response time across all questions (lower total time = higher rank).

## Player Management

- Players can join during any game state (not just lobby)
- In the lobby, players can toggle between participating and spectating
- Guests are always spectators
- Disconnected players remain in the game (marked as disconnected) for scoring continuity
- Reconnecting players get their full state restored

## Question System

Questions come from three sources:
1. **Static images**: Pre-made PNGs referenced in config, read from disk and sent as base64 data URLs
2. **Category files**: JSON files with question banks, loaded and sampled at startup
3. **Generated (speed math)**: Expressions generated from config parameters, rendered as PNG images via node-canvas

No question text or answers are ever sent to the client as raw data. The client only receives images and answer type metadata.

## Socket Events

**Host → Server**: `host:start_game`, `host:start_round`, `host:next_question`, `host:next_round`, `host:start_finale`, `host:next_finale_question`, `host:end_game`

**Player → Server**: `player:submit_answer`, `player:speed_math_answer`, `player:fifteen_solve`, `player:flow_connect_solve`, `player:join_game`, `player:spectate`

**Server → All**: `game:state_change` (per-player state snapshot), `game:timer_sync`, `game:submission_count`, `game:speed_math_progress`, `game:fifteen_progress`, `game:flow_connect_progress`, `game:leaderboard_update`, `game:player_joined`, `game:player_left`

**Server → Individual**: `player:speed_math_result`, `player:fifteen_result`, `player:flow_connect_result`

## Auth Flow

1. Player clicks "Join with Discord" or enters username in dev mode
2. Server issues JWT containing discordId, username, avatarUrl, isHost
3. JWT stored in httpOnly cookie + used as socket auth token
4. Host is identified by matching discordId against the config's hostDiscordId (or auto-assigned in dev mode)

## Deployment

Single server process. Express serves the API, socket connections, and the Vite-built static frontend. No database, no external dependencies beyond Discord OAuth. Config is loaded at startup from a JSON file specified by the `GAME_CONFIG` env var.
