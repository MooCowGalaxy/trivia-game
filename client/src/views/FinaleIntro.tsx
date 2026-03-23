import { useContext } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { GameContext } from "@/context/GameContext"
import { AuthContext } from "@/context/AuthContext"

export function FinaleIntro() {
  const ctx = useContext(GameContext)
  const authCtx = useContext(AuthContext)
  const gameState = ctx?.gameState
  const finaleState = gameState?.finaleState
  const userId = authCtx?.user?.discordId

  if (!gameState || !finaleState) return null

  const finalistPlayers = finaleState.finalists
    .map((id) => gameState.players.find((p) => p.id === id))
    .filter(Boolean)

  const isFinalist = userId ? finaleState.finalists.includes(userId) : false

  const placementStyles = [
    "ring-2 ring-yellow-500/60 bg-yellow-500/5",
    "ring-2 ring-gray-400/60 bg-gray-400/5",
    "ring-2 ring-amber-700/60 bg-amber-700/5",
  ]

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-8 animate-in fade-in duration-700">
        <div className="text-center space-y-3">
          <Badge variant="destructive" className="text-sm px-4 py-1 animate-in fade-in zoom-in-95 duration-500">
            SUDDEN DEATH
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
            FINAL ROUND
          </h1>
          <p className="text-muted-foreground text-lg">
            The top 3 players face off head-to-head
          </p>
        </div>

        <div className="grid gap-4">
          {finalistPlayers.map((player, index) => (
            <Card
              key={player!.id}
              className={`animate-in fade-in slide-in-from-bottom-4 ${placementStyles[index] ?? ""}`}
              style={{ animationDelay: `${(index + 1) * 200}ms`, animationFillMode: "both" }}
            >
              <CardContent className="flex items-center gap-4 py-2">
                <span className="text-2xl font-bold text-muted-foreground w-8 text-center">
                  {index + 1}
                </span>
                <Avatar className="h-12 w-12">
                  <AvatarImage src={player!.avatarUrl} alt={player!.username} />
                  <AvatarFallback>
                    {player!.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {player!.username}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {player!.score.toLocaleString()} pts
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!isFinalist && (
          <div className="text-center animate-in fade-in duration-1000">
            <Badge variant="secondary" className="text-base px-4 py-1">
              You are now spectating
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}

export default FinaleIntro
