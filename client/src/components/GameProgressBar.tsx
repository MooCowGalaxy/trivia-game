import { useEffect, useState } from "react"
import { useGameState } from "@/hooks/useGameState"

export function GameProgressBar() {
  const { gameState } = useGameState()
  const [displayProgress, setDisplayProgress] = useState(0)

  const progressBar = gameState?.progressBar
  const targetProgress =
    progressBar && progressBar.total > 0
      ? progressBar.completed / progressBar.total
      : 0

  // Animate to target with easing via CSS transition
  useEffect(() => {
    // Small delay so the transition is visible when the value changes
    const timeout = setTimeout(() => {
      setDisplayProgress(targetProgress)
    }, 50)
    return () => clearTimeout(timeout)
  }, [targetProgress])

  if (!gameState || gameState.currentState === "LOBBY") return null

  const pct = Math.round(displayProgress * 100)

  return (
    <div className="fixed top-0 left-0 right-0 z-30 h-1.5 bg-muted/50">
      <div
        className="h-full bg-primary/80 transition-all duration-1000 ease-in-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
