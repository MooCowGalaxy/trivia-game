import { useContext } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PlayerList } from "@/components/PlayerList"
import { GameContext } from "@/context/GameContext"
import { AuthContext } from "@/context/AuthContext"
import { socket } from "@/socket"
import { Eye, LogIn } from "lucide-react"

export function Lobby() {
  const ctx = useContext(GameContext)
  const authCtx = useContext(AuthContext)
  const gameState = ctx?.gameState
  const user = authCtx?.user

  if (!gameState) return null

  const connectedPlayers = gameState.players.filter((p) => p.connected)
  const isPlayer = user ? gameState.players.some((p) => p.id === user.discordId) : false
  const isGuest = !!user?.isGuest
  const isHost = !!user?.isHost

  const handleSpectate = () => {
    socket.emit("player:spectate")
  }

  const handleJoin = () => {
    socket.emit("player:join_game")
  }

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

        {!isGuest && !isHost && (
          <div className="flex justify-center">
            {isPlayer ? (
              <Button variant="outline" size="sm" onClick={handleSpectate} className="gap-1.5">
                <Eye className="size-3.5" />
                Switch to Spectating
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={handleJoin} className="gap-1.5">
                <LogIn className="size-3.5" />
                Join Game
              </Button>
            )}
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground animate-pulse">
          Waiting for the host to start the game...
        </p>
      </div>
    </div>
  )
}

export default Lobby
