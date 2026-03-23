import { useContext } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Leaderboard } from "@/components/Leaderboard"
import { GameContext } from "@/context/GameContext"

export function RoundResults() {
  const ctx = useContext(GameContext)
  const gameState = ctx?.gameState

  if (!gameState) return null

  const roundNumber =
    gameState.currentRound?.roundNumber ?? gameState.currentRoundIndex + 1

  const entries = gameState.leaderboard.map((e) => {
    const player = gameState.players.find((p) => p.id === e.playerId)
    return {
      id: e.playerId,
      name: e.username,
      score: e.score,
      avatar: player?.avatarUrl ?? "",
      connected: player?.connected,
    }
  })

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="text-center space-y-2">
          <Badge variant="secondary" className="text-sm">
            Results
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
            Round {roundNumber} Complete!
          </h1>
          {gameState.roundPointsEarned != null && (() => {
            const bd = gameState.roundPointsBreakdown
            const total = gameState.roundPointsEarned!
            return (
              <div className="animate-in fade-in duration-700 space-y-1">
                <p className="text-lg font-semibold text-primary">
                  You earned +{total} pts this round
                </p>
                {bd && bd.speedBonus > 0 && (
                  <p className="text-sm text-muted-foreground">
                    +{bd.base} base, +{bd.speedBonus} speed bonus
                  </p>
                )}
              </div>
            )
          })()}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <Leaderboard entries={entries} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default RoundResults
