import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useGameState } from "@/hooks/useGameState"
import { useAuth } from "@/hooks/useAuth"
import { socket } from "@/socket"
import { HostDashboard } from "@/host/HostDashboard"
import { Ban, UserX } from "lucide-react"

type AckResponse = { ok: boolean; error?: string; username?: string; banned?: boolean }
type ModerationTarget = {
  playerId: string
  username: string
  banUsername: boolean
}

export function HostControls() {
  const {
    gameState,
    submissionCount,
    fifteenProgress,
    flowConnectProgress,
    pipeRotationProgress,
    rushHourProgress,
    nurikabeProgress,
  } = useGameState()
  const { user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [moderationTarget, setModerationTarget] =
    useState<ModerationTarget | null>(null)

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

  const confirmModeration = useCallback(() => {
    if (!moderationTarget) return
    setError(null)
    setLoading(true)
    socket.emit(
      "host:kick_player",
      {
        playerId: moderationTarget.playerId,
        banUsername: moderationTarget.banUsername,
      },
      (res: AckResponse) => {
        setLoading(false)
        if (!res.ok) {
          setError(res.error ?? "Action failed")
          return
        }
        setModerationTarget(null)
      }
    )
  }, [moderationTarget])

  if (!gameState) {
    return <p className="text-sm text-muted-foreground">No game loaded.</p>
  }

  const state = gameState.currentState
  const moderationPlayers = gameState.players.filter(
    (player) => player.id !== user?.discordId
  )

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

      {state === "FIFTEEN_ACTIVE" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center py-2">
            {formatSolvedCount(
              fifteenProgress?.completedCount ??
                gameState.fifteenState?.completedCount ??
                0
            )}
          </p>
          <Button
            className="w-full"
            variant="outline"
            disabled={loading}
            onClick={() => emitAction("host:end_fifteen_round")}
          >
            End Round
          </Button>
        </div>
      )}

      {state === "FLOW_CONNECT_ACTIVE" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center py-2">
            {formatSolvedCount(
              flowConnectProgress?.completedCount ??
                gameState.flowConnectState?.completedCount ??
                0
            )}
          </p>
          <Button
            className="w-full"
            variant="outline"
            disabled={loading}
            onClick={() => emitAction("host:end_flow_connect_round")}
          >
            End Round
          </Button>
        </div>
      )}

      {state === "PIPE_ROTATION_ACTIVE" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center py-2">
            {formatSolvedCount(
              pipeRotationProgress?.completedCount ??
                gameState.pipeRotationState?.completedCount ??
                0
            )}
          </p>
          <Button
            className="w-full"
            variant="outline"
            disabled={loading}
            onClick={() => emitAction("host:end_pipe_rotation_round")}
          >
            End Round
          </Button>
        </div>
      )}

      {state === "RUSH_HOUR_ACTIVE" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center py-2">
            {formatSolvedCount(
              rushHourProgress?.completedCount ??
                gameState.rushHourState?.completedCount ??
                0
            )}
          </p>
          <Button
            className="w-full"
            variant="outline"
            disabled={loading}
            onClick={() => emitAction("host:end_rush_hour_round")}
          >
            End Round
          </Button>
        </div>
      )}

      {state === "NURIKABE_ACTIVE" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center py-2">
            {formatSolvedCount(
              nurikabeProgress?.completedCount ??
                gameState.nurikabeState?.completedCount ??
                0
            )}
          </p>
          <Button
            className="w-full"
            variant="outline"
            disabled={loading}
            onClick={() => emitAction("host:end_nurikabe_round")}
          >
            End Round
          </Button>
        </div>
      )}

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

      {moderationPlayers.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Moderation
          </h4>
          <div className="space-y-1.5">
            {moderationPlayers.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-2 rounded-lg border border-border/80 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {player.username}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  title={`Kick ${player.username}`}
                  onClick={() =>
                    setModerationTarget({
                      playerId: player.id,
                      username: player.username,
                      banUsername: false,
                    })
                  }
                >
                  <UserX className="size-3" />
                  <span className="sr-only">Kick {player.username}</span>
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="destructive"
                  title={`Kick and ban ${player.username}`}
                  onClick={() =>
                    setModerationTarget({
                      playerId: player.id,
                      username: player.username,
                      banUsername: true,
                    })
                  }
                >
                  <Ban className="size-3" />
                  <span className="sr-only">Kick and ban {player.username}</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-400/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <Dialog
        open={!!moderationTarget}
        onOpenChange={(open) => {
          if (!open) setModerationTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moderationTarget?.banUsername ? "Kick and ban player" : "Kick player"}
            </DialogTitle>
            <DialogDescription>
              {moderationTarget?.banUsername
                ? `${moderationTarget.username} will be removed and this username will be blocked from rejoining.`
                : `${moderationTarget?.username ?? "This player"} will be removed from the game.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setModerationTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={moderationTarget?.banUsername ? "destructive" : "default"}
              disabled={loading}
              onClick={confirmModeration}
            >
              {loading ? "Working..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatSolvedCount(count: number): string {
  return count === 1
    ? "1 player has solved the puzzle"
    : `${count} players have solved the puzzle`
}
