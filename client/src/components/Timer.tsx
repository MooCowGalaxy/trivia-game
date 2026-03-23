import { cn } from "@/lib/utils"

interface TimerProps {
  remainingMs: number
  totalMs: number
  className?: string
}

export function Timer({ remainingMs, totalMs, className }: TimerProps) {
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0
  const seconds = Math.max(0, remainingMs / 1000)
  const percentage = Math.max(0, Math.min(100, fraction * 100))

  const colorClass =
    fraction > 0.5
      ? "bg-teal-500"
      : fraction > 0.25
        ? "bg-yellow-500"
        : "bg-red-500"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex-1 h-3 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-linear",
            colorClass
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={cn(
          "text-sm font-mono font-medium tabular-nums min-w-[4rem] text-right",
          fraction <= 0.25 ? "text-red-400" : "text-foreground"
        )}
      >
        {Math.round(seconds)}s
      </span>
    </div>
  )
}
