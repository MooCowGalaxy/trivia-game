import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useGameState } from "@/hooks/useGameState"
import type { GameStateName } from "@/context/GameContext"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

import { LeaderboardModal } from "@/components/LeaderboardModal"
import { GameProgressBar } from "@/components/GameProgressBar"
import { UserInfoDisplay } from "@/components/UserInfoDisplay"
import { SpectatorBanner } from "@/components/SpectatorBanner"
import { Lobby } from "@/views/Lobby"
import { RoundIntro } from "@/views/RoundIntro"
import { QuestionCountdown } from "@/views/QuestionCountdown"
import { QuestionActive } from "@/views/QuestionActive"
import { QuestionReveal } from "@/views/QuestionReveal"
import { RoundResults } from "@/views/RoundResults"
import { SpeedMathActive } from "@/views/SpeedMathActive"
import { FifteenActive } from "@/views/FifteenActive"
import { FlowConnectActive } from "@/views/FlowConnectActive"
import { PipeRotationActive } from "@/views/PipeRotationActive"
import { RushHourActive } from "@/views/RushHourActive"
import { NurikabeActive } from "@/views/NurikabeActive"
import { FinaleIntro } from "@/views/FinaleIntro"
import { FinaleQuestion } from "@/views/FinaleQuestion"
import { GameOver } from "@/views/GameOver"
import { HostOverlay } from "@/host/HostOverlay"

const STATE_VIEWS: Record<GameStateName, React.FC> = {
  LOBBY: Lobby,
  ROUND_INTRO: RoundIntro,
  QUESTION_COUNTDOWN: QuestionCountdown,
  QUESTION_ACTIVE: QuestionActive,
  QUESTION_REVEAL: QuestionReveal,
  ROUND_RESULTS: RoundResults,
  SPEED_MATH_ACTIVE: SpeedMathActive,
  FIFTEEN_ACTIVE: FifteenActive,
  FLOW_CONNECT_ACTIVE: FlowConnectActive,
  PIPE_ROTATION_ACTIVE: PipeRotationActive,
  RUSH_HOUR_ACTIVE: RushHourActive,
  NURIKABE_ACTIVE: NurikabeActive,
  FINALE_INTRO: FinaleIntro,
  FINALE_QUESTION: FinaleQuestion,
  FINALE_REVEAL: QuestionReveal,
  GAME_OVER: GameOver,
}

function LoginPage() {
  const { usernameLogin, guestLogin } = useAuth()
  const [username, setUsername] = useState("")
  const [hostCode, setHostCode] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const showHostLogin = new URLSearchParams(window.location.search).get("host") === "1"
  const normalizedUsername = username.trim().toLowerCase()
  const usernameError = getUsernameError(normalizedUsername)

  const handleUsernameLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (usernameError || !confirmed || submitting) return

    setError(null)
    setSubmitting(true)
    const result = await usernameLogin(normalizedUsername, showHostLogin ? hostCode : "")
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? "Login failed")
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            moo's challenge
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleUsernameLogin} className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Input
                placeholder="Discord username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                aria-invalid={!!usernameError && username.trim().length > 0}
                autoFocus
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Use the Discord username you would claim with, not your display name. Winners may be asked to send a private code from that same account.
              </p>
              {usernameError && username.trim().length > 0 && (
                <p className="text-xs text-red-400">{usernameError}</p>
              )}
            </div>
            {showHostLogin && (
              <Input
                placeholder="Host code"
                value={hostCode}
                onChange={(e) => setHostCode(e.target.value)}
                type="password"
                autoComplete="off"
              />
            )}
            <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span>
                I’ll use this same Discord username if I need to claim a win.
              </span>
            </label>
            <Button
              type="submit"
              className="w-full"
              disabled={!!usernameError || !confirmed || submitting}
            >
              {submitting ? "Joining..." : "Join Game"}
            </Button>
            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={guestLogin}>
            Spectate as Guest
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function getUsernameError(username: string): string | null {
  if (!username) return "Enter your Discord username."
  if (username.length < 2 || username.length > 32) {
    return "Use 2 to 32 characters."
  }
  if (!/^[a-z0-9._]+$/.test(username)) {
    return "Use lowercase letters, numbers, periods, and underscores."
  }
  if (username.startsWith(".") || username.endsWith(".") || username.includes("..")) {
    return "Periods cannot appear at the beginning, end, or twice in a row."
  }
  return null
}

function LoadingScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

export function App() {
  const { user, loading } = useAuth()
  const { gameState } = useGameState()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <LoginPage />
  }

  if (!gameState) {
    return <LoadingScreen />
  }

  const View = STATE_VIEWS[gameState.currentState] ?? Lobby

  const showLeaderboard = gameState.currentState !== "LOBBY"
  const isPlayer = gameState.players.some((p) => p.id === user.discordId)
  const isSpectator = !isPlayer || !!user.isGuest

  return (
    <>
      <GameProgressBar />
      <UserInfoDisplay />
      {gameState.hostDiscordId === user.discordId && <HostOverlay />}
      {showLeaderboard && <LeaderboardModal />}
      {isSpectator && <SpectatorBanner />}
      <View />
    </>
  )
}

export default App
