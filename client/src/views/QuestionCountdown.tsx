import { useContext } from "react"
import { Badge } from "@/components/ui/badge"
import { GameContext } from "@/context/GameContext"

export function QuestionCountdown() {
  const ctx = useContext(GameContext)
  const gameState = ctx?.gameState
  const timerRemainingMs = ctx?.timerRemainingMs

  if (!gameState) return null

  const round = gameState.currentRound
  const questionIndex = gameState.currentQuestionIndex
  const secondsLeft = Math.ceil((timerRemainingMs ?? 0) / 1000)

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto text-center space-y-6">
        {round && (
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest">
            {round.title} — Question {questionIndex + 1}
          </p>
        )}

        <div className="flex items-center justify-center">
          <span
            key={secondsLeft}
            className="text-8xl font-black text-primary tabular-nums animate-in fade-in zoom-in-50 duration-300"
          >
            {secondsLeft}
          </span>
        </div>

        {gameState.questionText ? (
          <p className="text-lg font-medium text-foreground">{gameState.questionText}</p>
        ) : (
          <Badge variant="secondary" className="text-sm">
            Get ready...
          </Badge>
        )}
      </div>
    </div>
  )
}

export default QuestionCountdown
