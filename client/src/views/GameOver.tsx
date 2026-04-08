import { useContext } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Podium } from "@/components/Podium"
import { Leaderboard } from "@/components/Leaderboard"
import { GameContext } from "@/context/GameContext"

export function GameOver() {
  const ctx = useContext(GameContext)
  const gameState = ctx?.gameState

  if (!gameState) return null

  const leaderboard = ctx?.leaderboard ?? []
  const toEntry = (e: typeof leaderboard[number]) => {
    const player = gameState.players.find((p) => p.id === e.playerId)
    return {
      id: e.playerId,
      name: e.username,
      score: e.score,
      avatar: player?.avatarUrl ?? "",
      connected: player?.connected,
    }
  }

  const allEntries = leaderboard.map(toEntry)
  const topThree = allEntries.slice(0, 3)
  const winner = topThree[0]

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-8 animate-in fade-in duration-700">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
            Game Over
          </h1>
          {winner && (
            <p className="text-lg text-muted-foreground animate-in fade-in duration-1000">
              <Badge variant="default" className="text-base px-4 py-1">
                {winner.name} wins!
              </Badge>
            </p>
          )}
        </div>

        <div
          className="animate-in fade-in zoom-in-95 duration-700"
          style={{ animationDelay: "200ms", animationFillMode: "both" }}
        >
          <Podium players={topThree} />
        </div>

        <Card
          className="animate-in fade-in slide-in-from-bottom-4 duration-700"
          style={{ animationDelay: "400ms", animationFillMode: "both" }}
        >
          <CardHeader>
            <CardTitle>Final Standings</CardTitle>
          </CardHeader>
          <CardContent>
            <Leaderboard entries={allEntries} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default GameOver
