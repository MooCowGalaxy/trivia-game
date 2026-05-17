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
  | "FIFTEEN_ACTIVE"
  | "FLOW_CONNECT_ACTIVE"
  | "PIPE_ROTATION_ACTIVE"
  | "RUSH_HOUR_ACTIVE"
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
  display?: { type: string; src?: string }
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

export interface FifteenState {
  initialBoard: number[]
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
}

export interface FlowCoordinate {
  row: number
  col: number
}

export interface FlowEndpoint {
  color: number
  start: FlowCoordinate
  end: FlowCoordinate
}

export interface FlowConnectState {
  size: number
  colorCount: number
  endpoints: FlowEndpoint[]
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
}

export interface PipeCoordinate {
  row: number
  col: number
}

export interface PipeTile {
  row: number
  col: number
  initialMask: number
}

export interface PipeRotationState {
  rows: number
  cols: number
  source: PipeCoordinate
  terminals: PipeCoordinate[]
  tiles: PipeTile[]
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
}

export type RushHourOrientation = "H" | "V"

export interface RushHourVehicle {
  id: string
  row: number
  col: number
  length: number
  orientation: RushHourOrientation
  isTarget?: boolean
}

export interface RushHourState {
  size: number
  targetId: string
  exitRow: number
  vehicles: RushHourVehicle[]
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
  optimalMoves: number
  optimalVehicleMoves: number
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
  fifteenState: FifteenState | null
  flowConnectState: FlowConnectState | null
  pipeRotationState: PipeRotationState | null
  rushHourState: RushHourState | null
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

export interface FifteenProgress {
  playerId: string
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
}

export interface FifteenResult {
  completed: boolean
  reason?: string
}

export interface FlowConnectProgress {
  playerId: string
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
}

export interface FlowConnectResult {
  completed: boolean
  reason?: string
}

export interface PipeRotationProgress {
  playerId: string
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
}

export interface PipeRotationResult {
  completed: boolean
  reason?: string
}

export interface RushHourProgress {
  playerId: string
  completed: boolean
  completedCount: number
  winnerCount: number
  totalPlayers: number
}

export interface RushHourResult {
  completed: boolean
  reason?: string
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
  fifteenProgress: FifteenProgress | null
  fifteenResult: FifteenResult | null
  flowConnectProgress: FlowConnectProgress | null
  flowConnectResult: FlowConnectResult | null
  pipeRotationProgress: PipeRotationProgress | null
  pipeRotationResult: PipeRotationResult | null
  rushHourProgress: RushHourProgress | null
  rushHourResult: RushHourResult | null
  timerRemainingMs: number | null
  leaderboard: LeaderboardEntry[]
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
  const [fifteenProgress, setFifteenProgress] =
    useState<FifteenProgress | null>(null)
  const [fifteenResult, setFifteenResult] =
    useState<FifteenResult | null>(null)
  const [flowConnectProgress, setFlowConnectProgress] =
    useState<FlowConnectProgress | null>(null)
  const [flowConnectResult, setFlowConnectResult] =
    useState<FlowConnectResult | null>(null)
  const [pipeRotationProgress, setPipeRotationProgress] =
    useState<PipeRotationProgress | null>(null)
  const [pipeRotationResult, setPipeRotationResult] =
    useState<PipeRotationResult | null>(null)
  const [rushHourProgress, setRushHourProgress] =
    useState<RushHourProgress | null>(null)
  const [rushHourResult, setRushHourResult] =
    useState<RushHourResult | null>(null)
  const [timerRemainingMs, setTimerRemainingMs] = useState<number | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardUpdate, setLeaderboardUpdate] = useState<LeaderboardUpdate | null>(null)

  // Connect socket and fetch initial state only when authenticated
  useEffect(() => {
    if (!authenticated) return

    // Register all event handlers BEFORE connecting to avoid race conditions

    const handleStateChange = (state: PublicGameState) => {
      setGameState((prev) => {
        // Reset submission count when question changes
        if (prev?.currentQuestion?.id !== state.currentQuestion?.id) {
          setSubmissionCount(null)
        }
        if (state.fifteenState) {
          setFifteenProgress({
            playerId: "",
            completed: state.fifteenState.completed,
            completedCount: state.fifteenState.completedCount,
            winnerCount: state.fifteenState.winnerCount,
            totalPlayers: state.fifteenState.totalPlayers,
          })
        } else {
          setFifteenProgress(null)
          setFifteenResult(null)
        }
        if (state.flowConnectState) {
          setFlowConnectProgress({
            playerId: "",
            completed: state.flowConnectState.completed,
            completedCount: state.flowConnectState.completedCount,
            winnerCount: state.flowConnectState.winnerCount,
            totalPlayers: state.flowConnectState.totalPlayers,
          })
        } else {
          setFlowConnectProgress(null)
          setFlowConnectResult(null)
        }
        if (state.pipeRotationState) {
          setPipeRotationProgress({
            playerId: "",
            completed: state.pipeRotationState.completed,
            completedCount: state.pipeRotationState.completedCount,
            winnerCount: state.pipeRotationState.winnerCount,
            totalPlayers: state.pipeRotationState.totalPlayers,
          })
        } else {
          setPipeRotationProgress(null)
          setPipeRotationResult(null)
        }
        if (state.rushHourState) {
          setRushHourProgress({
            playerId: "",
            completed: state.rushHourState.completed,
            completedCount: state.rushHourState.completedCount,
            winnerCount: state.rushHourState.winnerCount,
            totalPlayers: state.rushHourState.totalPlayers,
          })
        } else {
          setRushHourProgress(null)
          setRushHourResult(null)
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
    }

    const handleTimerSync = (data: { remainingMs: number }) => {
      setTimerRemainingMs((prev) => {
        // Ignore timer syncs that jump up (new timer started before
        // the corresponding state_change arrived on this client)
        if (prev !== null && data.remainingMs > prev + 1500) {
          return prev
        }
        return data.remainingMs
      })
    }

    const handleSubmissionCount = (data: SubmissionCount) => {
      setSubmissionCount(data)
    }

    const handleSpeedMathProgress = (data: SpeedMathProgressEntry) => {
      setSpeedMathProgress((prev) => ({
        ...prev,
        [data.playerId]: data,
      }))
    }

    const handleFifteenProgress = (data: FifteenProgress) => {
      setFifteenProgress(data)
    }

    const handleFlowConnectProgress = (data: FlowConnectProgress) => {
      setFlowConnectProgress(data)
    }

    const handlePipeRotationProgress = (data: PipeRotationProgress) => {
      setPipeRotationProgress(data)
    }

    const handleRushHourProgress = (data: RushHourProgress) => {
      setRushHourProgress(data)
    }

    const handleLeaderboardUpdate = (data: LeaderboardUpdate) => {
      setLeaderboard(data.current)
      setLeaderboardUpdate(data)
    }

    const handlePlayersSync = (players: Player[]) => {
      setGameState((prev) => {
        if (!prev) return prev
        return { ...prev, players }
      })
    }

    // --- Individual player events ---

    const handleSpeedMathResult = (data: SpeedMathResult) => {
      setSpeedMathResult(data)
    }

    const handleFifteenResult = (data: FifteenResult) => {
      setFifteenResult(data)
    }

    const handleFlowConnectResult = (data: FlowConnectResult) => {
      setFlowConnectResult(data)
    }

    const handlePipeRotationResult = (data: PipeRotationResult) => {
      setPipeRotationResult(data)
    }

    const handleRushHourResult = (data: RushHourResult) => {
      setRushHourResult(data)
    }

    const handleConnect = () => {
      console.log("[socket] connected:", socket.id)
    }

    const handleConnectError = (err: Error) => {
      console.error("[socket] connect_error:", err.message)
    }

    socket.on("game:state_change", handleStateChange)
    socket.on("game:timer_sync", handleTimerSync)
    socket.on("game:submission_count", handleSubmissionCount)
    socket.on("game:speed_math_progress", handleSpeedMathProgress)
    socket.on("game:fifteen_progress", handleFifteenProgress)
    socket.on("game:flow_connect_progress", handleFlowConnectProgress)
    socket.on("game:pipe_rotation_progress", handlePipeRotationProgress)
    socket.on("game:rush_hour_progress", handleRushHourProgress)
    socket.on("game:leaderboard_update", handleLeaderboardUpdate)
    socket.on("game:players_sync", handlePlayersSync)
    socket.on("player:speed_math_result", handleSpeedMathResult)
    socket.on("player:fifteen_result", handleFifteenResult)
    socket.on("player:flow_connect_result", handleFlowConnectResult)
    socket.on("player:pipe_rotation_result", handlePipeRotationResult)
    socket.on("player:rush_hour_result", handleRushHourResult)
    socket.on("connect", handleConnect)
    socket.on("connect_error", handleConnectError)

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
      socket.off("connect", handleConnect)
      socket.off("connect_error", handleConnectError)
      socket.off("game:state_change", handleStateChange)
      socket.off("game:timer_sync", handleTimerSync)
      socket.off("game:submission_count", handleSubmissionCount)
      socket.off("game:speed_math_progress", handleSpeedMathProgress)
      socket.off("game:fifteen_progress", handleFifteenProgress)
      socket.off("game:flow_connect_progress", handleFlowConnectProgress)
      socket.off("game:pipe_rotation_progress", handlePipeRotationProgress)
      socket.off("game:rush_hour_progress", handleRushHourProgress)
      socket.off("game:leaderboard_update", handleLeaderboardUpdate)
      socket.off("game:players_sync", handlePlayersSync)
      socket.off("player:speed_math_result", handleSpeedMathResult)
      socket.off("player:fifteen_result", handleFifteenResult)
      socket.off("player:flow_connect_result", handleFlowConnectResult)
      socket.off("player:pipe_rotation_result", handlePipeRotationResult)
      socket.off("player:rush_hour_result", handleRushHourResult)
      socket.disconnect()
    }
  }, [authenticated])

  const value: GameContextValue = {
    gameState,
    submissionCount,
    speedMathProgress,
    speedMathResult,
    fifteenProgress,
    fifteenResult,
    flowConnectProgress,
    flowConnectResult,
    pipeRotationProgress,
    pipeRotationResult,
    rushHourProgress,
    rushHourResult,
    timerRemainingMs,
    leaderboard,
    leaderboardUpdate,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
