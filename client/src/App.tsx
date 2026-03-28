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
  FINALE_INTRO: FinaleIntro,
  FINALE_QUESTION: FinaleQuestion,
  FINALE_REVEAL: QuestionReveal,
  GAME_OVER: GameOver,
}

function LoginPage() {
  const { login, devLogin, guestLogin, devMode } = useAuth()
  const [devUsername, setDevUsername] = useState("")
  const [devIsHost, setDevIsHost] = useState(false)

  const handleDevLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (devUsername.trim()) {
      devLogin(devUsername.trim(), devIsHost)
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
          {devMode ? (
            <form onSubmit={handleDevLogin} className="flex flex-col gap-3">
              <Input
                placeholder="Username"
                value={devUsername}
                onChange={(e) => setDevUsername(e.target.value)}
                autoFocus
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={devIsHost}
                  onChange={(e) => setDevIsHost(e.target.checked)}
                  className="rounded"
                />
                Join as host
              </label>
              <Button type="submit" className="w-full" disabled={!devUsername.trim()}>
                Join
              </Button>
            </form>
          ) : (
            <>
              <Button className="w-full" onClick={login}>
                Join with Discord
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Sign in with Discord to join the game
              </p>
            </>
          )}
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
