import { useContext, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ImageQuestion } from "@/components/ImageQuestion"
import { AnswerInput } from "@/components/AnswerInput"
import { Timer } from "@/components/Timer"
import { GameContext } from "@/context/GameContext"
import { AuthContext } from "@/context/AuthContext"
import { socket } from "@/socket"
import { Check } from "lucide-react"

export function QuestionActive() {
  const ctx = useContext(GameContext)
  const authCtx = useContext(AuthContext)

  const gameState = ctx?.gameState
  const timerRemainingMs = ctx?.timerRemainingMs
  const finaleState = gameState?.finaleState
  const userId = authCtx?.user?.discordId

  const isFinale = !!finaleState
  const isSpectator = isFinale && userId
    ? !finaleState.finalists.includes(userId)
    : false

  const questionId = gameState?.currentQuestion?.id ?? null
  const alreadySubmitted = gameState?.playerSubmission != null

  const handleSubmit = useCallback(
    (answer: string | number) => {
      if (alreadySubmitted || !questionId) return
      socket.emit("player:submit_answer", { questionId, answer })
    },
    [alreadySubmitted, questionId]
  )

  if (!gameState) return null

  const timerSeconds = gameState.questionTimerSeconds ?? 0

  const round = gameState.currentRound
  const questionIndex = gameState.currentQuestionIndex
  const submissionCount = ctx?.submissionCount

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        {isFinale ? (
          <div className="text-center">
            <Badge variant="destructive" className="text-sm px-4 py-1">
              SUDDEN DEATH
            </Badge>
          </div>
        ) : round && (
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest">
              {round.title} · Question {questionIndex + 1}
            </p>
            {submissionCount && (
              <p className="text-xs text-muted-foreground">
                {submissionCount.count}/{submissionCount.total} answered
              </p>
            )}
          </div>
        )}

        <Timer
          remainingMs={timerRemainingMs ?? 0}
          totalMs={timerSeconds * 1000}
        />

        <Card className={isFinale ? "ring-2 ring-destructive/50" : ""}>
          <CardContent className="space-y-6 pt-2">
            {gameState.questionText && (
              <p className="text-center text-lg font-medium text-foreground">{gameState.questionText}</p>
            )}
            {gameState.questionImageData && (
              <ImageQuestion imageData={gameState.questionImageData} />
            )}

            {isSpectator ? (
              <div className="text-center py-4">
                <Badge variant="secondary" className="text-base px-4 py-1">
                  Spectating
                </Badge>
              </div>
            ) : alreadySubmitted ? (
              <div className="flex items-center justify-center gap-2 py-4 text-primary animate-in fade-in zoom-in-95 duration-300">
                <Check className="size-6" />
                <span className="text-lg font-medium">Answer Submitted!</span>
              </div>
            ) : (
              <AnswerInput
                answerType={gameState.questionAnswerType ?? ""}
                options={gameState.questionOptions ?? undefined}
                onSubmit={handleSubmit}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default QuestionActive
