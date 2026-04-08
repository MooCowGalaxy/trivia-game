import { useContext, useEffect, useRef, useState } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { AuthContext } from "@/context/AuthContext"
import type { LeaderboardUpdate } from "@/context/GameContext"
import { truncateLeaderboard } from "@/lib/truncateLeaderboard"
import { ArrowUp, ArrowDown, Minus } from "lucide-react"

export interface LeaderboardDisplayEntry {
  id: string
  name: string
  score: number
  avatar: string
  connected?: boolean
}

interface AnimatedLeaderboardProps {
  entries: LeaderboardDisplayEntry[]
  leaderboardUpdate: LeaderboardUpdate | null
  highlightTop?: number
  className?: string
}

const ENTRY_HEIGHT = 48 // px per row (py-2 + content)
const ANIMATION_DELAY = 300 // ms before position animation starts
const ANIMATION_DURATION = 1200 // ms for position slide
const COUNT_DURATION = 1200 // ms for number count-up

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

function useCountUp(target: number, from: number, active: boolean): number {
  const [value, setValue] = useState(active ? from : target)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active) {
      setValue(target)
      return
    }

    setValue(from)
    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime - ANIMATION_DELAY
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const t = Math.min(1, elapsed / COUNT_DURATION)
      // ease-in-out cubic
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2
      setValue(Math.round(from + (target - from) * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, from, active])

  return value
}

function AnimatedEntry({
  entry,
  newRank,
  oldRank,
  oldScore,
  animate,
  highlightTop,
}: {
  entry: LeaderboardDisplayEntry
  newRank: number
  oldRank: number
  oldScore: number
  animate: boolean
  highlightTop: number
}) {
  const authCtx = useContext(AuthContext)
  const currentUserId = authCtx?.user?.discordId
  const isYou = entry.id === currentUserId
  const isDisconnected = entry.connected === false
  const isHighlighted = newRank <= highlightTop

  const rankDiff = oldRank - newRank // positive = rose, negative = fell
  const displayScore = useCountUp(entry.score, oldScore, animate)
  const [offset, setOffset] = useState(animate ? (oldRank - newRank) * ENTRY_HEIGHT : 0)

  useEffect(() => {
    if (!animate) {
      setOffset(0)
      return
    }
    // Start at old position offset
    setOffset((oldRank - newRank) * ENTRY_HEIGHT)
    // After delay, animate to new position
    const timeout = setTimeout(() => {
      setOffset(0)
    }, ANIMATION_DELAY)
    return () => clearTimeout(timeout)
  }, [animate, oldRank, newRank])

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2",
        isHighlighted && rankBgColors[newRank]
          ? `border ${rankBgColors[newRank]}`
          : "border border-transparent",
        isDisconnected && "opacity-40"
      )}
      style={{
        transform: `translateY(${offset}px)`,
        transition: offset === 0 && animate
          ? `transform ${ANIMATION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`
          : "none",
      }}
    >
      {/* Rank number */}
      <span
        className={cn(
          "w-6 text-center font-bold text-sm",
          rankColors[newRank] || "text-muted-foreground"
        )}
      >
        {newRank}
      </span>

      {/* Rank change indicator */}
      <span className="w-8 flex items-center justify-center text-xs font-semibold">
        {animate && rankDiff !== 0 ? (
          rankDiff > 0 ? (
            <span className="flex items-center gap-0.5 text-emerald-400">
              <ArrowUp className="size-3" />
              {rankDiff}
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-red-400">
              <ArrowDown className="size-3" />
              {Math.abs(rankDiff)}
            </span>
          )
        ) : (
          <Minus className="size-3 text-muted-foreground/40" />
        )}
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
        {displayScore.toLocaleString()}
      </span>
    </div>
  )
}

function Ellipsis() {
  return (
    <div className="flex items-center justify-center py-1 text-muted-foreground text-sm">
      ...
    </div>
  )
}

export function AnimatedLeaderboard({
  entries,
  leaderboardUpdate,
  highlightTop = 3,
  className,
}: AnimatedLeaderboardProps) {
  const authCtx = useContext(AuthContext)
  const currentUserId = authCtx?.user?.discordId ?? null

  // Build lookup maps from the update data
  const shouldAnimate = leaderboardUpdate !== null
  const previousRankMap = new Map<string, number>()
  const previousScoreMap = new Map<string, number>()

  if (leaderboardUpdate) {
    leaderboardUpdate.previous.forEach((e, i) => {
      previousRankMap.set(e.playerId, i + 1)
      previousScoreMap.set(e.playerId, e.score)
    })
  }

  const items = truncateLeaderboard(entries, currentUserId)

  return (
    <div className={cn("space-y-1", className)}>
      {items.map((item) => {
        if (item.type === "ellipsis") {
          return <Ellipsis key={item.key} />
        }

        const { entry, rank: newRank } = item
        const oldRank = previousRankMap.get(entry.id) ?? newRank
        const oldScore = previousScoreMap.get(entry.id) ?? entry.score

        return (
          <AnimatedEntry
            key={entry.id}
            entry={entry}
            newRank={newRank}
            oldRank={oldRank}
            oldScore={oldScore}
            animate={shouldAnimate}
            highlightTop={highlightTop}
          />
        )
      })}
    </div>
  )
}
