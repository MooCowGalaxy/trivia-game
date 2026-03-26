import { useAuth } from "@/hooks/useAuth"
import { useGameState } from "@/hooks/useGameState"

export function UserInfoDisplay() {
  const { user } = useAuth()
  const { gameState } = useGameState()

  if (!user || !gameState) return null

  // Don't show for guests
  if (user.isGuest) return null

  const isPlayer = gameState.players.some((p) => p.id === user.discordId)
  if (!isPlayer) return null

  const isLobby = gameState.currentState === "LOBBY"

  // Find player's score and rank
  const sorted = [...gameState.leaderboard].sort((a, b) => b.score - a.score)
  const rank = sorted.findIndex((e) => e.playerId === user.discordId) + 1
  const player = gameState.players.find((p) => p.id === user.discordId)
  const score = player?.score ?? 0

  return (
    <div className="fixed top-3 right-3 z-30 flex items-center gap-2.5 rounded-lg border border-border bg-card/90 backdrop-blur-sm px-3 py-1.5 shadow-lg text-sm">
      <span className="font-medium text-foreground truncate max-w-[120px]">
        {user.username}
      </span>
      {!isLobby && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono font-bold text-primary tabular-nums">
            {score.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">pts</span>
          </span>
          {rank > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground font-medium">
                #{rank}
              </span>
            </>
          )}
        </>
      )}
    </div>
  )
}
