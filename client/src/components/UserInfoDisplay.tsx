import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useGameState } from "@/hooks/useGameState"
import { socket } from "@/socket"
import { cn } from "@/lib/utils"

type ConnectionStatus = "connected" | "reconnecting" | "disconnected"

function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? "connected" : "disconnected"
  )

  useEffect(() => {
    const onConnect = () => setStatus("connected")
    const onDisconnect = () => setStatus("disconnected")
    const onReconnecting = () => setStatus("reconnecting")

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.io.on("reconnect_attempt", onReconnecting)

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.io.off("reconnect_attempt", onReconnecting)
    }
  }, [])

  return status
}

const statusDotColor: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-400",
  reconnecting: "bg-yellow-400",
  disconnected: "bg-red-400",
}

export function UserInfoDisplay() {
  const { user } = useAuth()
  const { gameState, leaderboard } = useGameState()
  const connectionStatus = useConnectionStatus()

  if (!user || !gameState) return null

  // Don't show for guests
  if (user.isGuest) return null

  const isPlayer = gameState.players.some((p) => p.id === user.discordId)
  if (!isPlayer) return null

  const isLobby = gameState.currentState === "LOBBY"

  // Find player's score and rank
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score)
  const rank = sorted.findIndex((e) => e.playerId === user.discordId) + 1
  const player = gameState.players.find((p) => p.id === user.discordId)
  const score = player?.score ?? 0

  return (
    <div className="fixed top-3 right-3 z-30 flex items-center gap-2.5 rounded-lg border border-border bg-card/90 backdrop-blur-sm px-3 py-1.5 shadow-lg text-sm">
      <span className="relative flex size-2.5">
        <span
          className={cn(
            "absolute inline-flex size-full rounded-full opacity-75 animate-ping",
            statusDotColor[connectionStatus],
          )}
        />
        <span
          className={cn(
            "relative inline-flex size-2.5 rounded-full",
            statusDotColor[connectionStatus],
          )}
        />
      </span>
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
