import { useContext } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { AuthContext } from "@/context/AuthContext"

export interface LeaderboardEntry {
  id: string
  name: string
  score: number
  avatar: string
  connected?: boolean
}

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  highlightTop?: number
  className?: string
}

const rankColors: Record<number, string> = {
  1: "text-yellow-400",
  2: "text-gray-300",
  3: "text-amber-600",
}

const rankBgColors: Record<number, string> = {
  1: "bg-yellow-400/10 border-yellow-400/30",
  2: "bg-gray-300/10 border-gray-300/30",
  3: "bg-amber-600/10 border-amber-600/30",
}

export function Leaderboard({
  entries,
  highlightTop = 3,
  className,
}: LeaderboardProps) {
  const authCtx = useContext(AuthContext)
  const currentUserId = authCtx?.user?.discordId
  const sorted = [...entries].sort((a, b) => b.score - a.score)

  return (
    <div className={cn("space-y-1", className)}>
      {sorted.map((entry, index) => {
        const rank = index + 1
        const isHighlighted = rank <= highlightTop
        const isDisconnected = entry.connected === false
        const isYou = entry.id === currentUserId

        return (
          <div
            key={entry.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-300",
              isHighlighted && rankBgColors[rank]
                ? `border ${rankBgColors[rank]}`
                : "border border-transparent",
              isDisconnected && "opacity-40"
            )}
          >
            <span
              className={cn(
                "w-6 text-center font-bold text-sm",
                rankColors[rank] || "text-muted-foreground"
              )}
            >
              {rank}
            </span>
            <Avatar className="size-8">
              {entry.avatar && (
                <AvatarImage src={entry.avatar} alt={entry.name} />
              )}
              <AvatarFallback>
                {entry.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className={cn("flex-1 font-medium text-sm truncate", isYou && "text-primary")}>
              {entry.name}
              {isYou && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
            </span>
            <span className="font-mono text-sm font-bold text-primary tabular-nums">
              {entry.score.toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}
