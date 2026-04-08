import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Player {
  id: string
  username: string
  avatarUrl: string
  connected: boolean
}

interface PlayerListProps {
  players: Player[]
  maxVisible?: number
  className?: string
}

export function PlayerList({ players, maxVisible = 30, className }: PlayerListProps) {
  const isTruncated = players.length > maxVisible
  const visiblePlayers = isTruncated ? players.slice(0, maxVisible) : players

  return (
    <div className="relative">
      <div
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3",
          className
        )}
      >
        {visiblePlayers.map((player) => (
          <div
            key={player.id}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 transition-all duration-300",
              !player.connected && "opacity-40"
            )}
          >
            <Avatar className="size-12">
              {player.avatarUrl && (
                <AvatarImage src={player.avatarUrl} alt={player.username} />
              )}
              <AvatarFallback>
                {player.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate max-w-full">
              {player.username}
            </span>
            <Badge variant={player.connected ? "default" : "secondary"}>
              {player.connected ? "Online" : "Offline"}
            </Badge>
          </div>
        ))}
      </div>
      {isTruncated && (
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent pointer-events-none" />
      )}
    </div>
  )
}
