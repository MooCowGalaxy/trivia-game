import { useCallback, useContext, useRef, useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FifteenBoard } from "@/components/FifteenBoard"
import { Timer } from "@/components/Timer"
import { GameContext } from "@/context/GameContext"
import { useAuth } from "@/hooks/useAuth"
import { socket } from "@/socket"

const BOARD_SIZE = 4
const SOLVED_BOARD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]

type AckResponse = { ok: boolean; reason?: string; error?: string }

export function FifteenActive() {
  const ctx = useContext(GameContext)
  const { user } = useAuth()
  const gameState = ctx?.gameState
  const fifteenState = gameState?.fifteenState
  const timerRemainingMs = ctx?.timerRemainingMs
  const timerSeconds = gameState?.currentRound?.timerSeconds ?? 120
  const initialBoard = fifteenState?.initialBoard ?? []
  const boardKey = initialBoard.join(",")

  if (!fifteenState) return null

  return (
    <FifteenPuzzle
      key={boardKey}
      initialBoard={initialBoard}
      completed={fifteenState.completed}
      completedCount={ctx?.fifteenProgress?.completedCount ?? fifteenState.completedCount}
      canSubmit={!!user && gameState?.players.some((player) => player.id === user.discordId)}
      timerRemainingMs={timerRemainingMs}
      timerSeconds={timerSeconds}
    />
  )
}

interface FifteenPuzzleProps {
  initialBoard: number[]
  completed: boolean
  completedCount: number
  canSubmit: boolean
  timerRemainingMs: number | null | undefined
  timerSeconds: number
}

function FifteenPuzzle({
  initialBoard,
  completed: serverCompleted,
  completedCount,
  canSubmit,
  timerRemainingMs,
  timerSeconds,
}: FifteenPuzzleProps) {
  const [board, setBoard] = useState<number[]>(initialBoard)
  const [moves, setMoves] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittedKeyRef = useRef<string | null>(null)
  const boardKey = initialBoard.join(",")

  const completed = serverCompleted || submitted

  const submitSolve = useCallback(
    (nextMoves: number[]) => {
      if (completed || submitting || submittedKeyRef.current === boardKey) return

      submittedKeyRef.current = boardKey
      setSubmitting(true)
      const packed = packMoves(nextMoves)

      socket.emit(
        "player:fifteen_solve",
        { moves: packed, moveCount: nextMoves.length },
        (res: AckResponse) => {
          setSubmitting(false)
          if (res.ok) {
            setSubmitted(true)
            setError(null)
          } else {
            setError(res.reason ?? res.error ?? "Solve rejected")
          }
        }
      )
    },
    [boardKey, completed, submitting]
  )

  const moveTile = useCallback(
    (tileIndex: number) => {
      if (completed || submitting) return

      const emptyIndex = board.indexOf(0)
      if (!areAdjacent(tileIndex, emptyIndex)) return

      const nextBoard = [...board]
      nextBoard[emptyIndex] = board[tileIndex]!
      nextBoard[tileIndex] = 0
      const nextMoves = [...moves, tileIndex]

      setBoard(nextBoard)
      setMoves(nextMoves)
      setError(null)

      if (canSubmit && isSolved(nextBoard)) {
        submitSolve(nextMoves)
      }
    },
    [board, canSubmit, completed, moves, submitSolve, submitting]
  )

  const resetBoard = useCallback(() => {
    if (completed || submitting) return
    setBoard(initialBoard)
    setMoves([])
    setError(null)
    submittedKeyRef.current = null
  }, [completed, initialBoard, submitting])

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="mx-auto w-full max-w-2xl space-y-5 animate-in fade-in duration-300">
        <Timer
          remainingMs={timerRemainingMs ?? 0}
          totalMs={timerSeconds * 1000}
        />

        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary" className="text-sm">
            {formatSolvedCount(completedCount)}
          </Badge>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={resetBoard}
            disabled={completed || submitting || moves.length === 0}
            aria-label="Reset puzzle"
            title="Reset puzzle"
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-5 p-5 sm:p-6">
            {!canSubmit && (
              <div className="rounded-md border border-blue-300/20 bg-blue-300/10 px-4 py-3 text-center text-sm text-blue-100">
                You are spectating, so your solve will not count. You can still
                play the puzzle here.
              </div>
            )}

            <FifteenBoard
              board={board}
              className="w-full max-w-[min(82vw,28rem)]"
              tileClassName="text-2xl font-bold sm:text-3xl"
              completed={completed}
              isInteractive={!completed && !submitting}
              canMoveTile={(index) => areAdjacent(index, board.indexOf(0))}
              onTileClick={moveTile}
            />

            <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">
              Arrange the tiles from 1 through 15, with the empty space in the
              bottom-right corner.
            </p>

            <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">
              Click or tap a tile next to the empty space to slide it. Only
              tiles directly above, below, left, or right of the empty space can
              move.
            </p>

            <div className="min-h-8 text-center">
              {completed ? (
                <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                  <Check className="size-4" />
                  Solved
                </p>
              ) : submitting ? (
                <p className="text-sm text-muted-foreground">Verifying...</p>
              ) : error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {moves.length} moves
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function areAdjacent(a: number, b: number): boolean {
  const rowA = Math.floor(a / BOARD_SIZE)
  const colA = a % BOARD_SIZE
  const rowB = Math.floor(b / BOARD_SIZE)
  const colB = b % BOARD_SIZE
  return Math.abs(rowA - rowB) + Math.abs(colA - colB) === 1
}

function isSolved(board: number[]): boolean {
  return board.length === SOLVED_BOARD.length && board.every((tile, index) => tile === SOLVED_BOARD[index])
}

function formatSolvedCount(count: number): string {
  return count === 1
    ? "1 player has solved the puzzle"
    : `${count} players have solved the puzzle`
}

function packMoves(moves: number[]): string {
  const bytes = new Uint8Array(Math.ceil(moves.length / 2))

  moves.forEach((move, index) => {
    const byteIndex = Math.floor(index / 2)
    if (index % 2 === 0) {
      bytes[byteIndex] = move << 4
    } else {
      bytes[byteIndex] |= move
    }
  })

  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

export default FifteenActive
