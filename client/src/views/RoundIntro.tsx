import { useContext } from "react"
import { Badge } from "@/components/ui/badge"
import { GameContext } from "@/context/GameContext"

const ROUND_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  exact_number: "Exact Number",
  fermi: "Fermi Estimation",
  text: "Text Answer",
  speed_math: "Speed Math",
  pattern: "Multiple Choice",
  image: "Image Round",
}

export function RoundIntro() {
  const ctx = useContext(GameContext)
  const round = ctx?.gameState?.currentRound

  if (!round) return null

  const typeLabel = round.typeLabel ?? ROUND_TYPE_LABELS[round.type] ?? round.type

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto text-center space-y-6 animate-in fade-in zoom-in-95 duration-700">
        <Badge variant="secondary" className="text-sm">
          {typeLabel}
        </Badge>

        <div className="space-y-2">
          <p className="text-lg text-muted-foreground font-medium uppercase tracking-widest animate-in fade-in slide-in-from-bottom-2 duration-500">
            Round {round.roundNumber}
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
            {round.title}
          </h1>
        </div>

        {round.description && (
          <p className="text-muted-foreground text-lg max-w-md mx-auto animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {round.description}
          </p>
        )}

        <p
          className="text-sm text-muted-foreground animate-pulse opacity-0"
          style={{ animation: "fadeIn 700ms ease-out 1500ms forwards, pulse 2s cubic-bezier(0.4,0,0.6,1) 2200ms infinite" }}
        >
          Waiting for the host to start the round...
        </p>
      </div>
    </div>
  )
}

export default RoundIntro
