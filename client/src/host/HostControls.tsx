import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useGameState } from "@/hooks/useGameState"
import { socket } from "@/socket"
import { HostDashboard } from "@/host/HostDashboard"

type AckResponse = { ok: boolean; error?: string }

export function HostControls() {
  const { gameState, submissionCount } = useGameState()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const emitAction = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      setError(null)
      setLoading(true)
      socket.emit(event, payload, (res: AckResponse) => {
        setLoading(false)
        if (!res.ok) {
          setError(res.error ?? "Action failed")
        }
      })
    },
    []
  )

  if (!gameState) {
    return <p className="text-sm text-muted-foreground">No game loaded.</p>
  }

  const state = gameState.currentState

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Host Controls</h3>

      {state === "LOBBY" && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => emitAction("host:start_game")}
        >
          Start Game
        </Button>
      )}

      {state === "ROUND_INTRO" && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => emitAction("host:start_round")}
        >
          Begin Round
        </Button>
      )}

      {state === "QUESTION_ACTIVE" && submissionCount && (
        <p className="text-sm text-muted-foreground text-center py-2">
          {submissionCount.count}/{submissionCount.total} answered
        </p>
      )}

      {state === "QUESTION_REVEAL" && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => emitAction("host:next_question")}
        >
          Next Question
        </Button>
      )}

      {state === "ROUND_RESULTS" && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => emitAction("host:next_round")}
        >
          Next Round
        </Button>
      )}

      {state === "SPEED_MATH_ACTIVE" && <HostDashboard />}

      {state === "FINALE_INTRO" && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => emitAction("host:start_finale")}
        >
          Start Finale
        </Button>
      )}

      {state === "FINALE_QUESTION" && submissionCount && (
        <p className="text-sm text-muted-foreground text-center py-2">
          {submissionCount.count}/{submissionCount.total} answered
        </p>
      )}

      {state === "FINALE_REVEAL" && gameState.finaleState?.winnerId && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => emitAction("host:end_game")}
        >
          End Game
        </Button>
      )}

      {state === "FINALE_REVEAL" && !gameState.finaleState?.winnerId && (
        <Button
          className="w-full"
          disabled={loading}
          onClick={() => emitAction("host:next_finale_question")}
        >
          Next Question
        </Button>
      )}

      {state === "GAME_OVER" && (
        <p className="text-sm text-muted-foreground text-center py-2 font-semibold">
          Game Over
        </p>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-400/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
