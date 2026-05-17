import { useEffect, useState } from "react"
import { Check } from "lucide-react"

interface PuzzleSolvedCelebrationProps {
  show: boolean
}

export function PuzzleSolvedCelebration({ show }: PuzzleSolvedCelebrationProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!show) return

    setVisible(true)
    const timeout = window.setTimeout(() => setVisible(false), 3_000)
    return () => window.clearTimeout(timeout)
  }, [show])

  if (!show || !visible) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-xl bg-slate-950/45 backdrop-blur-[2px] animate-in fade-in duration-300">
      <div className="relative flex flex-col items-center gap-3 text-center animate-in zoom-in-75 duration-500">
        <div className="relative flex size-20 items-center justify-center rounded-full border border-emerald-200/50 bg-emerald-400/20 text-emerald-100 shadow-[0_0_40px_rgba(52,211,153,0.25)]">
          <Check className="size-10" />
        </div>
        <div className="relative space-y-1">
          <p className="text-2xl font-bold text-foreground">Solved!</p>
          <p className="text-sm text-muted-foreground">Your solve has been verified.</p>
        </div>
      </div>
    </div>
  )
}
