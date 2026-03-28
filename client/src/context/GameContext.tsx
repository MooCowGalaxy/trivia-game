import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { socket } from "@/socket"

// ---------- Types ----------

export type GameStateName =
  | "LOBBY"
  | "ROUND_INTRO"
  | "QUESTION_COUNTDOWN"
  | "QUESTION_ACTIVE"
  | "QUESTION_REVEAL"
  | "ROUND_RESULTS"
  | "SPEED_MATH_ACTIVE"
  | "FINALE_INTRO"
  | "FINALE_QUESTION"
  | "FINALE_REVEAL"
  | "GAME_OVER"

export interface Player {
  id: string
  username: string
  avatarUrl: string
  score: number
  connected: boolean
}

export interface RoundInfo {
  roundNumber: number
  type: string
  title: string
  description?: string
  typeLabel?: string
  timerSeconds: number
}

export interface CurrentQuestion {
  id: string
  display: { type: string; src?: string }
  answerType: string
  options?: string[]
}

export interface FinaleState {
  currentQuestionIndex: number
  wins: Record<string, number>
  finalists: string[]
  winnerId: string | null
}

export interface LeaderboardEntry {
  playerId: string
  username: string
  score: number
  totalResponseTimeMs: number
}

export interface SpeedMathState {
  questionIndex: number
  imageData: string | null
  totalQuestions: number
  completed: boolean
}

export interface PublicGameState {
  gameId: string
  hostDiscordId: string
  currentState: GameStateName
  players: Player[]
  currentRoundIndex: number
  currentQuestionIndex: number
  currentRound: RoundInfo | null
  currentQuestion: CurrentQuestion | null
  leaderboard: LeaderboardEntry[]
  timerRemainingMs: number | null
  progressBar: { completed: number; total: number }
  finaleState: FinaleState | null

  // Unified view data
  questionImageData: string | null
  questionText: string | null
  questionAnswerType: string | null
  questionOptions: string[] | null
  questionTimerSeconds: number | null
  revealAnswer: string | number | null
  playerSubmission: { answer: string | number; correct: boolean | null; pointsEarned: number | null; pointsBreakdown: { base: number; speedBonus: number } | null } | null
  roundPointsEarned: number | null
  roundPointsBreakdown: { base: number; speedBonus: number } | null
  speedMathState: SpeedMathState | null
}

export interface SubmissionCount {
  questionId: string
  count: number
  total: number
}

export interface SpeedMathProgressEntry {
  playerId: string
  correctCount: number
  completed: boolean
  totalQuestions: number
}

export interface SpeedMathResult {
  questionIndex: number
  correct: boolean
  completed: boolean
}

export interface LeaderboardUpdate {
  previous: LeaderboardEntry[]
  current: LeaderboardEntry[]
}

// ---------- Context ----------

export interface GameContextValue {
  gameState: PublicGameState | null
  submissionCount: SubmissionCount | null
  speedMathProgress: Record<string, SpeedMathProgressEntry>
  speedMathResult: SpeedMathResult | null
  timerRemainingMs: number | null
  leaderboardUpdate: LeaderboardUpdate | null
}

export const GameContext = createContext<GameContextValue | null>(null)

const API_BASE = ""

export function GameProvider({ children, authenticated }: { children: ReactNode; authenticated: boolean }) {
  const [gameState, setGameState] = useState<PublicGameState | null>(null)
  const [submissionCount, setSubmissionCount] =
    useState<SubmissionCount | null>(null)
  const [speedMathProgress, setSpeedMathProgress] = useState<
    Record<string, SpeedMathProgressEntry>
  >({})
  const [speedMathResult, setSpeedMathResult] =
    useState<SpeedMathResult | null>(null)
  const [timerRemainingMs, setTimerRemainingMs] = useState<number | null>(null)
  const [leaderboardUpdate, setLeaderboardUpdate] = useState<LeaderboardUpdate | null>(null)

  // Connect socket and fetch initial state only when authenticated
  useEffect(() => {
    if (!authenticated) return

    // Register all event handlers BEFORE connecting to avoid race conditions

    socket.on("game:state_change", (state: PublicGameState) => {
      setGameState((prev) => {
        // Reset submission count when question changes
        if (prev?.currentQuestion?.id !== state.currentQuestion?.id) {
          setSubmissionCount(null)
        }
        // Clear leaderboard update when leaving reveal/results states
        // (so reconnecting users don't see stale animation data)
        if (
          state.currentState !== "QUESTION_REVEAL" &&
          state.currentState !== "ROUND_RESULTS"
        ) {
          setLeaderboardUpdate(null)
        }
        return state
      })
      if (state.timerRemainingMs != null) {
        setTimerRemainingMs(state.timerRemainingMs)
      }
    })

    socket.on("game:timer_sync", (data: { remainingMs: number }) => {
      setTimerRemainingMs(data.remainingMs)
    })

    socket.on("game:submission_count", (data: SubmissionCount) => {
      setSubmissionCount(data)
    })

    socket.on(
      "game:speed_math_progress",
      (data: SpeedMathProgressEntry) => {
        setSpeedMathProgress((prev) => ({
          ...prev,
          [data.playerId]: data,
        }))
      }
    )

    socket.on("game:leaderboard_update", (data: LeaderboardUpdate) => {
      setLeaderboardUpdate(data)
    })

    socket.on("game:player_joined", (player: Player) => {
      setGameState((prev) => {
        if (!prev) return prev
        const exists = prev.players.some((p) => p.id === player.id)
        if (exists) {
          return {
            ...prev,
            players: prev.players.map((p) =>
              p.id === player.id ? player : p
            ),
          }
        }
        return { ...prev, players: [...prev.players, player] }
      })
    })

    socket.on("game:player_left", (data: { id: string }) => {
      setGameState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === data.id ? { ...p, connected: false } : p
          ),
        }
      })
    })

    // --- Individual player events ---

    socket.on("player:speed_math_result", (data: SpeedMathResult) => {
      setSpeedMathResult(data)
    })

    socket.on("connect", () => {
      console.log("[socket] connected:", socket.id)
    })

    socket.on("connect_error", (err) => {
      console.error("[socket] connect_error:", err.message)
    })

    // NOW connect (all handlers are registered)
    socket.connect()

    // Also fetch initial state as fallback
    fetch(`${API_BASE}/api/game/state`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setGameState((prev) => prev ?? data)
          if (data.timerRemainingMs != null) {
            setTimerRemainingMs((prev) => prev ?? data.timerRemainingMs)
          }
        }
      })
      .catch(() => {})

    return () => {
      socket.off("connect")
      socket.off("connect_error")
      socket.off("game:state_change")
      socket.off("game:timer_sync")
      socket.off("game:submission_count")
      socket.off("game:speed_math_progress")
      socket.off("game:leaderboard_update")
      socket.off("game:player_joined")
      socket.off("game:player_left")
      socket.off("player:speed_math_result")
      socket.disconnect()
    }
  }, [authenticated])

  const value: GameContextValue = {
    gameState,
    submissionCount,
    speedMathProgress,
    speedMathResult,
    timerRemainingMs,
    leaderboardUpdate,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
