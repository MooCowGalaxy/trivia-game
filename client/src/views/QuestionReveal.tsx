import { useContext } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ImageQuestion } from "@/components/ImageQuestion"
import { AnimatedLeaderboard } from "@/components/AnimatedLeaderboard"
import { GameContext } from "@/context/GameContext"
import { Check, X } from "lucide-react"

export function QuestionReveal() {
  const ctx = useContext(GameContext)
  const gameState = ctx?.gameState
  const leaderboardUpdate = ctx?.leaderboardUpdate ?? null

  if (!gameState) return null

  const entries = gameState.leaderboard.map((e) => {
    const player = gameState.players.find((p) => p.id === e.playerId)
    return {
      id: e.playerId,
      name: e.username,
      score: e.score,
      avatar: player?.avatarUrl ?? "",
      connected: player?.connected,
    }
  })

  const sub = gameState.playerSubmission

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        {/* Player result */}
        {sub && (() => {
          const isFermi = gameState.questionAnswerType === "fermi"
          const earned = sub.pointsEarned ?? 0
          // For fermi: always show as neutral/positive (proximity-based)
          // For others: show correct/incorrect
          const isPositive = isFermi ? earned > 0 : sub.correct === true

          const bd = sub.pointsBreakdown

          return (
            <div className={`flex flex-col items-center gap-2 rounded-lg border px-5 py-4 ${
              isPositive
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              <div className="flex items-center gap-3">
                {isPositive ? <Check className="size-6" /> : <X className="size-6" />}
                <span className="text-lg font-semibold">
                  {isFermi
                    ? `Your estimate: ${String(sub.answer)}`
                    : sub.correct ? "Correct!" : "Incorrect"}
                </span>
                {!isFermi && (
                  <span className="text-sm text-muted-foreground ml-2">
                    Your answer: {String(sub.answer)}
                  </span>
                )}
              </div>
              {bd && earned > 0 && (
                <div className="text-sm font-medium text-muted-foreground">
                  {isFermi ? (
                    <span>+{earned} pts <span className="text-xs">(proximity bonus)</span></span>
                  ) : bd.speedBonus > 0 ? (
                    <span>+{bd.base} base, +{bd.speedBonus} speed bonus = <span className="text-foreground font-semibold">+{earned} pts</span></span>
                  ) : (
                    <span>+{earned} pts</span>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {!sub && (
          <div className="flex items-center justify-center gap-3 rounded-lg border border-border px-5 py-4 text-muted-foreground">
            <span className="text-lg font-medium">No answer submitted</span>
          </div>
        )}

        {/* Question image + correct answer */}
        <Card>
          {(gameState.questionText || gameState.questionImageData) && (
            <CardContent className="pt-6 space-y-4">
              {gameState.questionText && (
                <p className="text-center text-lg font-medium text-foreground">{gameState.questionText}</p>
              )}
              {gameState.questionImageData && (
                <ImageQuestion imageData={gameState.questionImageData} />
              )}
            </CardContent>
          )}
          {gameState.revealAnswer != null && (
            <>
              <CardHeader className="text-center pt-2">
                <CardTitle className="text-lg text-muted-foreground">
                  Correct Answer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <Badge
                    variant="default"
                    className="text-2xl px-8 py-3 font-bold leading-relaxed"
                  >
                    {String(gameState.revealAnswer)}
                  </Badge>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <AnimatedLeaderboard
              entries={entries}
              leaderboardUpdate={leaderboardUpdate}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default QuestionReveal
