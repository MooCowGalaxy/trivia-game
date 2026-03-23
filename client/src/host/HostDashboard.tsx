import { Progress } from "@/components/ui/progress"
import { useGameState } from "@/hooks/useGameState"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

interface HostDashboardProps {
  className?: string
}

export function HostDashboard({ className }: HostDashboardProps) {
  const { gameState, speedMathProgress } = useGameState()

  if (!gameState) return null

  const players = gameState.players
  const entries = players
    .map((player) => {
      const progress = speedMathProgress[player.id]
      return {
        id: player.id,
        username: player.username,
        correctCount: progress?.correctCount ?? 0,
        totalQuestions: progress?.totalQuestions ?? 0,
        completed: progress?.completed ?? false,
      }
    })
    .sort((a, b) => b.correctCount - a.correctCount)

  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Speed Math Progress
      </h4>
      {entries.map((entry) => {
        const pct =
          entry.totalQuestions > 0
            ? (entry.correctCount / entry.totalQuestions) * 100
            : 0

        return (
          <div key={entry.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate font-medium">{entry.username}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                {entry.completed && <Check className="size-3 text-emerald-400" />}
                {entry.correctCount}/{entry.totalQuestions}
              </span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        )
      })}
    </div>
  )
}
