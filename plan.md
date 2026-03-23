## Implementation Plan: "Last Brain Standing"

### 1. Anti-LLM Cheating Strategy (Design-First)

This shapes everything else. The core problem: any question that can be copy-pasted as text into ChatGPT in under 5 seconds is effectively cheatable. Even multimodal LLMs (e.g., Gemini 3 Flash) can solve clean images quickly. The mitigations fall into several categories:

**A. All questions rendered as server-generated images**
All question content is rendered server-side into PNG images using `node-canvas` (or similar) and sent to the client as base64 data URLs. No question text, draw instructions, or answer data ever reaches the client. This eliminates copy-paste and prevents inspecting WebSocket payloads for answers.

**B. Visual noise & distortion on images**
To degrade multimodal LLM accuracy while remaining human-readable:
- Random background patterns/textures behind question text
- Slight text warping, varying fonts, and random rotation per question
- Noise overlays (CAPTCHA-style) — enough to trip up OCR, not enough to annoy humans
- For math expressions: embed the text within a busy but legible visual context

**C. Timer pressure**
Non-math rounds use tight timers (15-20s). The screenshot → upload → wait for LLM → read response → type answer loop takes ~8-15 seconds even with fast models, leaving almost no margin.

**D. Speed Math is inherently LLM-proof by design**
The self-paced nature of speed math (10 sequential questions, each requiring a screenshot-upload-solve cycle) makes LLM assistance impractical. Even at 8 seconds per LLM round-trip, that's 80 seconds — far slower than a human doing simple mental math. This is the strongest anti-cheat category.

**E. Question design that resists LLMs**
- **Speed Math**: Simple operations (add/subtract/multiply/divide) with numbers < 150. Self-paced format compounds the LLM overhead per question.
- **Pattern/Sequence**: Use *visual* sequences (shape grids, color patterns, spatial transformations) rather than number sequences. Number sequences like "1, 11, 21, 1211" are trivially LLM-solvable. Visual matrix puzzles rendered as distorted images are not.
- **Visual/Spatial**: Inherently safe — counting overlapping shapes, mental rotation, grid completion are all image-native.
- **Logic Deduction**: Use *visual logic* — e.g., a grid of colored/shaped objects with 3 written clues, "which cell satisfies all clues?" The clues reference visual properties on-screen, making it impossible to convey to an LLM without describing the whole image.
- **Fermi Estimation**: Use *custom/specific* referents with image dependency. Show an image of a specific room/container and ask estimation questions — the image dependency defeats LLMs.

**F. Server-side answer validation only**
No correct answers ever sent to the client. All answer checking happens server-side after submission. The client only knows "correct/incorrect" after the timer ends and the host advances.

---

### 2. Architecture Overview

```
┌─────────────────────────────────────────┐
│              Frontend (Vite + React + TS)│
│  ┌─────────────┐   ┌─────────────────┐  │
│  │  Host View   │   │  Player View    │  │
│  │  (admin)     │   │  (participant)  │  │
│  └──────┬───────┘   └───────┬─────────┘  │
│         └────────┬──────────┘            │
│            Socket.io Client              │
└──────────────────┬───────────────────────┘
                   │
            WebSocket + HTTP
                   │
┌──────────────────┴───────────────────────┐
│         Backend (Express + Socket.io)     │
│  ┌────────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Game Engine │ │ Auth     │ │ Question│ │
│  │ (state     │ │ (Discord │ │ Loader  │ │
│  │  machine)  │ │  OAuth)  │ │ + Gen   │ │
│  └────────────┘ └──────────┘ └─────────┘ │
│  ┌────────────────────────────────────┐   │
│  │  Question Bank (JSON config files) │   │
│  └────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

---

### 3. Backend Design

#### 3.1 Project Structure

```
server/
├── src/
│   ├── index.ts                 # Express + Socket.io bootstrap
│   ├── auth/
│   │   └── discord.ts           # OAuth2 flow (authorization code grant)
│   ├── game/
│   │   ├── engine.ts            # Core state machine
│   │   ├── scoring.ts           # Score calculation per round type
│   │   ├── timer.ts             # Server-authoritative countdown
│   │   └── types.ts             # Shared game state types
│   ├── questions/
│   │   ├── loader.ts            # Reads & validates JSON config at startup
│   │   ├── generator.ts         # Generates speed math questions from parameters
│   │   ├── renderer.ts          # Server-side image rendering (node-canvas)
│   │   └── validator.ts         # Answer checking logic per question type
│   ├── socket/
│   │   ├── hostHandlers.ts      # Host-only socket event handlers
│   │   └── playerHandlers.ts    # Player socket event handlers
│   └── middleware/
│       └── authMiddleware.ts    # JWT verification for socket connections
├── config/
│   └── games/
│       ├── game-2026-03-25.json # One file per game session
│       └── _template.json       # Template with schema docs
└── package.json
```

#### 3.2 Discord OAuth Flow

1. Player clicks "Join Game" → redirected to Discord OAuth2 authorize URL
2. Discord redirects back with auth code → backend exchanges for access token
3. Backend fetches user profile (id, username, avatar) from Discord API
4. Backend issues a short-lived JWT (contains discord_id, username, avatar_url)
5. JWT stored in httpOnly cookie, also sent as socket auth token
6. **Host identification**: You pre-configure your own Discord ID as the host ID in an env variable. If the authenticated user's ID matches, they get the host view. Everyone else gets the player view. No separate login flow needed.

#### 3.3 Game Engine (State Machine)

The game progresses through a strict sequence of states. Only the host can trigger transitions (no force-end option — rounds always run their full timer).

**States:**
```
LOBBY → ROUND_INTRO → QUESTION_ACTIVE → QUESTION_REVEAL → ROUND_RESULTS
  → (repeat ROUND_INTRO for next round)
  → FINALE_INTRO → FINALE_QUESTION → FINALE_REVEAL
  → GAME_OVER
```

For **speed_math** rounds, the flow is different:
```
ROUND_INTRO → SPEED_MATH_ACTIVE → ROUND_RESULTS
```
During `SPEED_MATH_ACTIVE`, the global timer runs and each player progresses through questions independently. The round ends when the timer expires.

**State details:**

- **LOBBY**: Players join, see their name on a waiting list. Host sees player count + usernames + "Start Game" button.
- **ROUND_INTRO**: 5-second splash screen — "Round 2: Pattern Recognition". Host clicks to proceed to first question.
- **QUESTION_ACTIVE**: Question displayed (as server-rendered image), timer counting down. Players submit answers. Server records answer + timestamp per player. Host sees live submission count ("12/18 answered").
- **QUESTION_REVEAL**: Timer expired. Correct answer shown. Per-player correct/incorrect displayed briefly. Host clicks to go to next question or to ROUND_RESULTS.
- **SPEED_MATH_ACTIVE**: All players see question 1 simultaneously. Each player answers at their own pace — correct answer advances to the next question, wrong answer keeps them on the current question. Global timer counts down. Host sees live progress ("Player A: 7/10, Player B: 5/10..."). Round ends when timer expires.
- **ROUND_RESULTS**: Leaderboard shown with updated scores. Host clicks to advance to next round intro.
- **FINALE_INTRO**: "Top 3" announcement with names. Only the top 3 players by cumulative score advance. All others become spectators. Transition to sudden death format.
- **FINALE_QUESTION**: Same as QUESTION_ACTIVE but only finalists can answer. First correct submission wins the point (server checks timestamps). If nobody gets it, no points awarded.
- **GAME_OVER**: Winner announced with fanfare. 1st, 2nd, and 3rd place displayed prominently, plus full leaderboard. The host sees all usernames and manually sends the prize to the winner outside the website. The website does NOT display or reference any prize/code.

**Key engine rules:**
- All timers are server-authoritative. The client displays a local countdown synced at question start, but the server decides when time's up.
- Answer submissions after server timer expiry are rejected.
- The host socket connection is authenticated and verified against the admin Discord ID on every event.
- No elimination during regular rounds — all players play every round. Only the top 3 advance to the finale.

#### 3.4 Scoring Module

**Standard rounds (Pattern / Visual / Logic):** `basePoints + speedBonus`

Speed bonus is based on **order of correct answers relative to correct participants**, not time:
- `speedBonus = floor(speedBonusMax * (1 - (correctAnswerRank - 1) / totalCorrectParticipants))`
- Example: 10 total participants, 3 correct answers, speedBonusMax = 50
  - 1st correct: `floor(50 * (1 - 0/3))` = 50 (100%)
  - 2nd correct: `floor(50 * (1 - 1/3))` = 33 (67%)
  - 3rd correct: `floor(50 * (1 - 2/3))` = 16 (33%)
- This heavily rewards being first among correct answerers, which penalizes LLM-assisted players who are slower.
- If only 1 person gets it right, they get 100% speed bonus.
- Players who answer incorrectly get 0 (no base points, no speed bonus).

**Speed Math (self-paced):**
- `score = floor(basePoints * (questionsCorrect / totalQuestions))`
- Example: basePoints = 100, player answers 7/10 correctly → 70 points
- Among players who complete all questions, rank by completion time. Award speed bonus based on order / totalCompletedPlayers (same formula as standard rounds).
- Players who don't finish all questions get only the accuracy-based score (no speed bonus).

**Fermi Estimation:** Proximity-based. Server computes `abs(log10(playerAnswer) - log10(correctAnswer))`. Rank players by proximity. 1st = 250, 2nd = 150, 3rd = 75, rest = 25 participation points. This log-scale scoring means being off by an order of magnitude matters, but being 10% off vs 20% off doesn't create huge gaps.

**Finale (Sudden Death):** No points — first correct answer wins the question. First to N wins (configurable, default 3). Server compares submission timestamps at millisecond precision.

#### 3.5 Speed Math Question Generator

Instead of hardcoded questions, speed math questions are **generated at game start** from configurable parameters:

```jsonc
{
  "type": "speed_math",
  "generatorParams": {
    "questionCount": 10,              // number of questions per round (configurable)
    "operations": ["+", "-", "*", "/"], // which operations to include
    "maxOperand": 150,                // all operands must be < this value
    "maxAnswer": 150,                 // the correct answer must be < this value
    "allowNegativeResults": false,    // for subtraction: ensure result >= 0
    "divisionWholeNumbersOnly": true  // division always produces integer results
  }
}
```

The generator:
1. At game start, generates the full question list from these parameters
2. Ensures all generated questions satisfy the constraints (operands < 150, answer < 150, whole number division results)
3. Renders each question as a server-side image (with visual noise/distortion) using `node-canvas`
4. Stores the generated questions + images in memory
5. All players receive the **same** generated question list (questions are shared, not per-player)

#### 3.6 Question Loader & Config Schema

This is the core of the "no code changes to update questions" requirement.

**Game config file** (`config/games/game-2026-03-25.json`):

```jsonc
{
  "gameId": "game-2026-03-25",
  "settings": {
    "hostDiscordId": "123456789",
    "finaleTopN": 3,
    "finaleWinCondition": 3       // first to N correct in sudden death
  },
  "rounds": [
    {
      "roundNumber": 1,
      "type": "speed_math",
      "title": "Speed Math Blitz",
      "description": "Pure mental math. No calculators.",
      "timerSeconds": 30,           // global timer for the whole self-paced round
      "basePoints": 100,
      "speedBonusMax": 50,
      "generatorParams": {
        "questionCount": 10,
        "operations": ["+", "-", "*", "/"],
        "maxOperand": 150,
        "maxAnswer": 150,
        "allowNegativeResults": false,
        "divisionWholeNumbersOnly": true
      }
    },
    {
      "roundNumber": 2,
      "type": "pattern",
      "title": "Pattern Recognition",
      "timerSeconds": 20,
      "basePoints": 150,
      "speedBonusMax": 75,
      "questions": [
        {
          "id": "r2q1",
          "display": {
            "type": "image",
            "src": "/assets/questions/pattern_grid_01.png"
          },
          "answerType": "multiple_choice",
          "options": ["A", "B", "C", "D"],
          "correctAnswer": "C"
        }
      ]
    },
    {
      "roundNumber": 3,
      "type": "visual_spatial",
      "title": "Visual/Spatial Puzzle",
      "timerSeconds": 25,
      "basePoints": 200,
      "speedBonusMax": 75,
      "questions": [
        {
          "id": "r3q1",
          "display": {
            "type": "image",
            "src": "/assets/questions/visual_shapes_01.png"
          },
          "answerType": "exact_number",
          "correctAnswer": 7,
          "tolerance": 0
        }
      ]
    },
    {
      "roundNumber": 4,
      "type": "mixed_logic_fermi",
      "title": "Logic & Estimation",
      "timerSeconds": 20,
      "basePoints": 250,
      "speedBonusMax": 50,
      "questions": [
        {
          "id": "r4q1",
          "display": {
            "type": "image",
            "src": "/assets/questions/logic_grid_01.png"
          },
          "answerType": "multiple_choice",
          "options": ["Red square", "Blue circle", "Green triangle", "Yellow star"],
          "correctAnswer": "Blue circle"
        },
        {
          "id": "r4q2",
          "display": {
            "type": "image",
            "src": "/assets/questions/fermi_room_01.png"
          },
          "answerType": "fermi",
          "correctAnswer": 4200,
          "scoringMode": "log_proximity"
        }
      ]
    }
  ],
  "finale": {
    "title": "Sudden Death",
    "timerSeconds": 15,
    "questions": [
      // Mixed question types, same schema as above
    ]
  }
}
```

**Display type taxonomy:**

| `display.type` | What it does | Anti-LLM? |
|---|---|---|
| `image` | Static image file (pre-made PNG) — for complex visual puzzles, Fermi reference photos | Yes — requires multimodal LLM + distortion degrades accuracy |
| `generated` | Server-generated image from parameters (speed math) — rendered with visual noise at game start | Yes — no text in DOM or WebSocket payload, distortion layer |

**Answer type taxonomy:**

| `answerType` | Input UI | Validation |
|---|---|---|
| `exact_number` | Numeric input field | `abs(submitted - correct) <= tolerance` |
| `multiple_choice` | 4 buttons (A/B/C/D) | Exact string match |
| `fermi` | Numeric input field | Log-proximity ranking |
| `text` | Text input | Case-insensitive trimmed match (with optional aliases array) |

**The loader** (`questions/loader.ts`) reads the JSON at server startup, validates it against a Zod schema, and holds it in memory. For `speed_math` rounds, it invokes the generator to create questions from `generatorParams`. The host specifies which game config to load via an env variable or a CLI argument. To iterate on questions, you just edit the JSON and restart the server (or add a hot-reload endpoint behind host auth).

#### 3.7 Question Renderer (Server-Side)

All questions are rendered server-side using `node-canvas`:

- **Static image questions** (pattern, visual, logic, fermi): The pre-made PNG is loaded and served as-is (the image creator is responsible for adding distortion during asset creation).
- **Generated questions** (speed math): The generator creates the math expression, then the renderer draws it onto a canvas with:
  - Randomized font family, size variation, and slight rotation
  - Background noise pattern (dots, lines, or texture)
  - Anti-aliased text with slight color variation
  - The resulting PNG is stored in memory as a base64 data URL

No question text or answer data ever reaches the client. The client only receives image data and answer type metadata (e.g., "this is a numeric input question").

---

### 4. Frontend Design

#### 4.1 Project Structure

```
client/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Route: /host vs /play, based on JWT role
│   ├── socket.ts                  # Socket.io client singleton
│   ├── context/
│   │   ├── GameContext.tsx         # Game state from server
│   │   └── AuthContext.tsx         # Discord user info + JWT
│   ├── views/
│   │   ├── Lobby.tsx              # Pre-game waiting room
│   │   ├── RoundIntro.tsx         # Round splash screen
│   │   ├── QuestionActive.tsx     # Active question (image + input + timer)
│   │   ├── QuestionReveal.tsx     # Correct answer + who got it right
│   │   ├── SpeedMathActive.tsx    # Self-paced speed math round view
│   │   ├── RoundResults.tsx       # Leaderboard between rounds
│   │   ├── FinaleIntro.tsx        # Top 3 announcement
│   │   ├── FinaleQuestion.tsx     # Sudden death question
│   │   └── GameOver.tsx           # Winner + podium + full leaderboard
│   ├── components/
│   │   ├── ImageQuestion.tsx      # Renders server-provided image
│   │   ├── AnswerInput.tsx        # Numeric / MC / Text input variants
│   │   ├── Timer.tsx              # Animated countdown bar
│   │   ├── Leaderboard.tsx        # Sorted score display w/ avatars
│   │   ├── PlayerList.tsx         # Lobby player list
│   │   └── Podium.tsx             # 1st/2nd/3rd place display for GameOver
│   ├── host/
│   │   ├── HostControls.tsx       # Start game, next question, next round
│   │   ├── HostDashboard.tsx      # Live stats (submissions, scores, speed math progress)
│   │   └── HostOverlay.tsx        # Floating control panel over game view
│   └── hooks/
│       ├── useGameState.ts        # Subscribes to socket game state events
│       ├── useTimer.ts            # Local countdown synced to server
│       └── useAuth.ts             # Discord auth state
├── public/
│   └── assets/
│       └── questions/             # Static question images (pattern, visual, logic, fermi)
├── index.html
└── vite.config.ts
```

#### 4.2 View-State Mapping

The frontend is entirely driven by server state. The `GameContext` holds the current game state received via socket, and `App.tsx` renders the correct view:

```
Server state          → Player View              → Host View
───────────────────────────────────────────────────────────────
LOBBY                 → Lobby.tsx                 → Lobby + "Start Game" button
ROUND_INTRO           → RoundIntro.tsx            → RoundIntro + "Begin Round" button
QUESTION_ACTIVE       → QuestionActive.tsx        → QuestionActive + submission counter
QUESTION_REVEAL       → QuestionReveal.tsx        → QuestionReveal + "Next Question"/"End Round"
SPEED_MATH_ACTIVE     → SpeedMathActive.tsx       → SpeedMathActive + live progress dashboard
ROUND_RESULTS         → RoundResults.tsx          → RoundResults + "Next Round" button
FINALE_INTRO          → FinaleIntro.tsx           → FinaleIntro + "Start Finale" button
FINALE_QUESTION       → FinaleQuestion.tsx        → FinaleQuestion + "Next"/"End Game" button
GAME_OVER             → GameOver.tsx (podium +    → GameOver (same view, host sees
                         full leaderboard)           usernames to send prize manually)
```

The host sees everything a player sees, plus a floating `HostOverlay` with the control buttons. This way you experience the game as a player would while controlling it.

#### 4.3 Key UI Details

- **Timer**: A horizontal bar that drains left-to-right, changing color (green → yellow → red). Synced to server time at question start, then runs locally for smoothness.
- **Answer submission**: Once submitted, the input locks and shows "Submitted" with a subtle animation. No changing answers. (In speed math, correct answer immediately advances to next question; wrong answer clears the input to try again.)
- **Speed Math view**: Shows current question image, progress indicator ("Question 4/10"), and the global countdown timer. Each correct answer smoothly transitions to the next question. Wrong answers show a brief "incorrect" flash and the input clears.
- **Leaderboard**: Shows Discord avatar + username + score. Animated position changes between rounds. Top 3 highlighted.
- **Game Over / Podium**: 1st, 2nd, and 3rd place shown prominently with avatars and usernames. Full leaderboard displayed below. No prize code or prize reference shown on the website — the host sees the winner's username and sends the prize manually.
- **Spectating**: Non-finalist players can still watch the finale questions and leaderboard but cannot submit answers.
- **Finale**: Visual distinction — different color scheme, dramatic timer, large "FIRST!" indicator when someone buzzes in correctly.

---

### 5. Socket Event Architecture

#### Host → Server Events
| Event | Payload | Effect |
|---|---|---|
| `host:start_game` | `{ gameId }` | Transition LOBBY → ROUND_INTRO (round 1) |
| `host:start_round` | `{}` | Transition ROUND_INTRO → QUESTION_ACTIVE or SPEED_MATH_ACTIVE, starts server timer |
| `host:next_question` | `{}` | QUESTION_REVEAL → next QUESTION_ACTIVE, or → ROUND_RESULTS if last question |
| `host:next_round` | `{}` | ROUND_RESULTS → ROUND_INTRO (next) or FINALE_INTRO |
| `host:start_finale` | `{}` | FINALE_INTRO → FINALE_QUESTION |
| `host:next_finale_question` | `{}` | Advance to next sudden death question |
| `host:end_game` | `{}` | → GAME_OVER |

#### Player → Server Events
| Event | Payload | Effect |
|---|---|---|
| `player:submit_answer` | `{ questionId, answer }` | Records answer + timestamp, rejects if timer expired or already submitted |
| `player:speed_math_answer` | `{ questionIndex, answer }` | For speed math: validates answer, if correct sends next question image; if wrong, rejects (player retries) |

#### Server → All Clients (Broadcast)
| Event | Payload |
|---|---|
| `game:state_change` | `{ state, roundNumber, questionIndex, ... }` |
| `game:question` | `{ questionId, imageData (base64), answerType, options?, timerSeconds }` |
| `game:timer_sync` | `{ remainingMs }` (periodic sync every 3s) |
| `game:question_result` | `{ correctAnswer, playerResults: [{ id, correct, pointsEarned }] }` |
| `game:leaderboard` | `{ players: [{ id, name, avatar, score, rank }] }` |
| `game:player_joined` | `{ id, name, avatar }` |
| `game:player_left` | `{ id }` |
| `game:submission_count` | `{ count, total }` (so host + spectators see progress) |
| `game:speed_math_progress` | `{ players: [{ id, completed, total }] }` (live progress during speed math) |

#### Server → Individual Client
| Event | Payload |
|---|---|
| `player:speed_math_question` | `{ questionIndex, imageData, totalQuestions }` (sends next question to individual player on correct answer) |
| `player:speed_math_result` | `{ correct: boolean }` (per-attempt feedback) |
| `player:finale_spectator` | `{}` (tells non-top-3 players they are spectating the finale) |

---

### 6. Deployment & Hosting

Keeping it simple for a one-off event:

- **Single VPS** (your existing Windows Server VPS or a cheap Linux instance). Express serves both the API and the Vite-built static frontend.
- **No database** — all state lives in-memory for the duration of the game. If the server restarts, the game resets. That's fine for a single live event.
- **Discord OAuth** requires a registered Discord application with a redirect URI pointing to your domain/IP.
- **HTTPS**: Use Caddy or nginx as a reverse proxy with a Let's Encrypt cert if you have a domain, or use Cloudflare Tunnel for a quick setup.

---

### 7. Pre-Game Workflow

1. Write/curate questions into a JSON config file
2. For image-based questions (pattern, visual, logic, fermi), create the PNGs with visual noise/distortion and drop them in the assets folder
3. Configure speed math `generatorParams` in the JSON (operations, number ranges, question count)
4. Set env vars: `GAME_CONFIG=game-2026-03-25.json`, `HOST_DISCORD_ID=your_id`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
5. Start server (speed math questions are generated + rendered at startup)
6. Post the link in Discord #general: "Game starts in 10 minutes, join now"
7. Players click link → Discord auth → land in lobby
8. When you're ready, hit Start
9. After game ends, note the winner's username from the Game Over screen and send them the prize manually

---

### 8. Resolved Decisions

1. **Rendering approach**: All server-side PNG rendering via `node-canvas`. No client-side canvas rendering, no draw instructions sent to client.
2. **Elimination**: No elimination during regular rounds. All players play all rounds. Only top 3 by cumulative score advance to the finale.
3. **Speed bonus**: Based on order of correct answers divided by correct participants (not time-based). Formula: `floor(speedBonusMax * (1 - (rank - 1) / totalCorrectParticipants))`. Heavily rewards being first.
4. **Speed math**: Self-paced within a global timer. Questions generated from configurable parameters. Players progress independently. Scoring = `basePoints * accuracy` + speed bonus for those who complete all questions.
5. **Prize delivery**: Manual — host sees winner username on Game Over screen and sends prize outside the website. No prize code in the application.
6. **Game Over display**: Shows 1st, 2nd, 3rd place podium + full leaderboard. No prize/code references.
7. **Spectator mode**: Non-finalist players spectate the finale. They can see questions and leaderboard but cannot submit.
8. **Finale tie-breaking**: Raw timestamp comparison — no minimum time difference threshold.
9. **Speed math timer**: 30 seconds global timer (~3 seconds per question average for 10 questions).

### 9. Open Questions

1. **Question asset creation**: For the visual/spatial and pattern questions, you'll need to create image assets with visual distortion baked in. I can help generate these as SVGs or PNGs when we get to the question-writing phase.
