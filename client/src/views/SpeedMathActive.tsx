import { useContext, useState, useCallback, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ImageQuestion } from "@/components/ImageQuestion"
import { Timer } from "@/components/Timer"
import { GameContext } from "@/context/GameContext"
import { socket } from "@/socket"

export function SpeedMathActive() {
  const ctx = useContext(GameContext)
  const speedMathResult = ctx?.speedMathResult
  const timerRemainingMs = ctx?.timerRemainingMs
  const gameState = ctx?.gameState
  const speedMathState = gameState?.speedMathState
  const timerSeconds = gameState?.currentRound?.timerSeconds ?? 60

  const [answer, setAnswer] = useState("")
  const [flashRed, setFlashRed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const completed = speedMathState?.completed ?? false

  // Handle result feedback
  useEffect(() => {
    if (!speedMathResult) return

    if (speedMathResult.completed) {
      setAnswer("")
      return
    }

    if (!speedMathResult.correct) {
      setFlashRed(true)
      setAnswer("")
      const timer = setTimeout(() => setFlashRed(false), 400)
      inputRef.current?.focus()
      return () => clearTimeout(timer)
    }

    // Correct but not completed - clear for next question
    setAnswer("")
    inputRef.current?.focus()
  }, [speedMathResult])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!answer.trim() || !speedMathState || completed) return
      socket.emit("player:speed_math_answer", {
        questionIndex: speedMathState.questionIndex,
        answer: Number(answer),
      })
    },
    [answer, speedMathState, completed]
  )

  if (!speedMathState) return null

  const totalQuestions = speedMathState.totalQuestions
  const currentIndex = speedMathState.questionIndex
  const progressPercent = totalQuestions > 0
    ? ((currentIndex) / totalQuestions) * 100
    : 0

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        <Timer
          remainingMs={timerRemainingMs ?? 0}
          totalMs={timerSeconds * 1000}
        />

        {completed ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="text-4xl">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto text-primary"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-foreground">All Done!</h2>
              <p className="text-muted-foreground">
                Waiting for other players to finish...
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className={flashRed ? "ring-2 ring-destructive transition-all" : "transition-all"}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Speed Math</span>
                <Badge variant="secondary">
                  Question {currentIndex + 1}/{totalQuestions}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Progress value={progressPercent} className="h-2" />

              {speedMathState.imageData && (
                <ImageQuestion imageData={speedMathState.imageData} />
              )}

              <form onSubmit={handleSubmit} className="flex gap-3">
                <Input
                  ref={inputRef}
                  type="number"
                  inputMode="numeric"
                  placeholder="Your answer..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoFocus
                  className="text-lg"
                />
                <Button type="submit" disabled={!answer.trim()}>
                  Submit
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default SpeedMathActive
