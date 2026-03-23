import { useContext } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlayerList } from "@/components/PlayerList"
import { GameContext } from "@/context/GameContext"

export function Lobby() {
  const ctx = useContext(GameContext)
  const gameState = ctx?.gameState

  if (!gameState) return null

  const connectedPlayers = gameState.players.filter((p) => p.connected)

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            moo's challenge
          </h1>
          <div className="flex items-center justify-center gap-2">
            <span className="text-muted-foreground text-sm">Game ID:</span>
            <Badge variant="secondary" className="text-base font-mono tracking-wider px-3">
              {gameState.gameId}
            </Badge>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Players</span>
              <Badge variant="outline">
                {connectedPlayers.length} player{connectedPlayers.length !== 1 ? "s" : ""} waiting
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PlayerList players={gameState.players} />
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground animate-pulse">
          Waiting for the host to start the game...
        </p>
      </div>
    </div>
  )
}

export default Lobby
