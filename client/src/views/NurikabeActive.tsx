import { useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { Check, Minus, RotateCcw, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PuzzleSolvedCelebration } from "@/components/PuzzleSolvedCelebration"
import { Timer } from "@/components/Timer"
import {
  GameContext,
  type NurikabeCellColor,
  type NurikabeClue,
  type NurikabeInitialCell,
  type NurikabeLockedCell,
} from "@/context/GameContext"
import { useAuth } from "@/hooks/useAuth"
import { socket } from "@/socket"

type AckResponse = { ok: boolean; reason?: string; error?: string }
type CellState = NurikabeInitialCell
type RuleStatus = "met" | "pending" | "violated"

interface CellCoord {
  row: number
  col: number
}

interface BoardLayout {
  cssWidth: number
  cssHeight: number
  boardWidth: number
  boardHeight: number
  cell: number
  xOffset: number
  yOffset: number
}

export function NurikabeActive() {
  const ctx = useContext(GameContext)
  const { user } = useAuth()
  const gameState = ctx?.gameState
  const nurikabeState = gameState?.nurikabeState
  const timerRemainingMs = ctx?.timerRemainingMs
  const timerSeconds = gameState?.currentRound?.timerSeconds ?? 120
  const puzzleKey = nurikabeState
    ? `${nurikabeState.rows}:${nurikabeState.cols}:${nurikabeState.clues.map((clue) => `${clue.row}-${clue.col}-${clue.size}`).join("|")}`
    : ""

  if (!nurikabeState) return null

  return (
    <NurikabePuzzle
      key={puzzleKey}
      rows={nurikabeState.rows}
      cols={nurikabeState.cols}
      initial={nurikabeState.initial}
      clues={nurikabeState.clues}
      lockedCells={nurikabeState.lockedCells}
      completed={nurikabeState.completed}
      completedCount={ctx?.nurikabeProgress?.completedCount ?? nurikabeState.completedCount}
      canSubmit={!!user && gameState?.players.some((player) => player.id === user.discordId)}
      timerRemainingMs={timerRemainingMs}
      timerSeconds={timerSeconds}
    />
  )
}

interface NurikabePuzzleProps {
  rows: number
  cols: number
  initial: NurikabeInitialCell[][]
  clues: NurikabeClue[]
  lockedCells: NurikabeLockedCell[]
  completed: boolean
  completedCount: number
  canSubmit: boolean
  timerRemainingMs: number | null | undefined
  timerSeconds: number
}

function NurikabePuzzle({
  rows,
  cols,
  initial,
  clues,
  lockedCells,
  completed: serverCompleted,
  completedCount,
  canSubmit,
  timerRemainingMs,
  timerSeconds,
}: NurikabePuzzleProps) {
  const [board, setBoard] = useState<CellState[][]>(() => cloneGrid(initial))
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<CellCoord | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const submittedKeyRef = useRef<string | null>(null)
  const completed = serverCompleted || submitted
  const lockedKeys = useMemo(() => {
    const locked = new Set<string>()
    for (const clue of clues) locked.add(coordKey(clue))
    for (const cell of lockedCells) locked.add(coordKey(cell))
    return locked
  }, [clues, lockedCells])
  const analysis = useMemo(
    () => analyzeBoard(board, clues, lockedCells, rows, cols),
    [board, clues, cols, lockedCells, rows]
  )

  useEffect(() => {
    drawBoard(canvasRef.current, rows, cols, board, clues, lockedCells, hoveredCell)
  }, [board, clues, cols, hoveredCell, lockedCells, rows])

  useEffect(() => {
    const handleResize = () => {
      drawBoard(canvasRef.current, rows, cols, board, clues, lockedCells, hoveredCell)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [board, clues, cols, hoveredCell, lockedCells, rows])

  const submitSolve = useCallback(
    (nextBoard: CellState[][]) => {
      if (!canSubmit || completed || submitting) return
      const validation = validateSolvedBoard(nextBoard, clues, lockedCells, rows, cols)
      if (!validation.solved) return

      const payload = nextBoard.map((row) =>
        row.map((cell) => (cell === "black" ? "black" : "white") as NurikabeCellColor)
      )
      const key = JSON.stringify(payload)
      if (submittedKeyRef.current === key) return
      submittedKeyRef.current = key
      setSubmitting(true)

      socket.emit("player:nurikabe_solve", { board: payload }, (res: AckResponse) => {
        setSubmitting(false)
        if (res.ok) {
          setSubmitted(true)
          setError(null)
        } else {
          setError(res.reason ?? res.error ?? "Solve rejected")
        }
      })
    },
    [canSubmit, clues, cols, completed, lockedCells, rows, submitting]
  )

  const cycleCell = useCallback(
    (row: number, col: number) => {
      const key = `${row},${col}`
      if (lockedKeys.has(key) || completed || submitting) return
      setBoard((current) => {
        const value = nextCellState(current[row]![col]!)
        if (current[row]?.[col] === value) return current
        const next = current.map((line) => [...line])
        next[row]![col] = value
        setError(null)
        submitSolve(next)
        return next
      })
    },
    [completed, lockedKeys, submitSolve, submitting]
  )

  const handleCanvasClick = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      if (completed || submitting) return
      const coord = getCanvasCoord(event.currentTarget, event.clientX, event.clientY, rows, cols)
      if (!coord) return
      cycleCell(coord.row, coord.col)
    },
    [cols, completed, cycleCell, rows, submitting]
  )

  const handleCanvasMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      if (completed || submitting) {
        setHoveredCell(null)
        return
      }
      const coord = getCanvasCoord(event.currentTarget, event.clientX, event.clientY, rows, cols)
      if (!coord || lockedKeys.has(coordKey(coord))) {
        setHoveredCell(null)
        return
      }
      setHoveredCell((current) => {
        if (current?.row === coord.row && current.col === coord.col) return current
        return coord
      })
    },
    [cols, completed, lockedKeys, rows, submitting]
  )

  const handleCanvasMouseLeave = useCallback(() => {
    setHoveredCell(null)
  }, [])

  const resetBoard = useCallback(() => {
    if (completed || submitting) return
    setBoard(cloneGrid(initial))
    setError(null)
    submittedKeyRef.current = null
  }, [completed, initial, submitting])

  return (
    <div className="flex min-h-svh items-center justify-center p-3 sm:p-4">
      <div className="mx-auto w-full max-w-4xl space-y-3 animate-in fade-in duration-300">
        <Timer remainingMs={timerRemainingMs ?? 0} totalMs={timerSeconds * 1000} />

        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary" className="text-sm">
            {formatSolvedCount(completedCount)}
          </Badge>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={resetBoard}
            disabled={completed || submitting}
            aria-label="Reset puzzle"
            title="Reset puzzle"
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>

        <Card>
          <CardContent className="relative space-y-4 overflow-hidden p-3 sm:p-4">
            <PuzzleSolvedCelebration show={completed} />

            {!canSubmit && (
              <div className="rounded-md border border-blue-300/20 bg-blue-300/10 px-4 py-3 text-center text-sm text-blue-100">
                You are spectating, so your solve will not count. You can still
                play the puzzle here.
              </div>
            )}

            <div className="mx-auto grid max-w-3xl items-stretch gap-5 md:grid-cols-[minmax(0,1fr)_13rem]">
              <div
                className="relative w-full"
                style={{ aspectRatio: `${cols} / ${rows}` }}
              >
                <canvas
                  ref={canvasRef}
                  className="block size-full cursor-pointer rounded-md bg-slate-950 shadow-inner"
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={handleCanvasMouseLeave}
                  aria-label="Nurikabe puzzle"
                />
              </div>

              <div className="flex h-full min-h-40 flex-col justify-between rounded-md border border-slate-700/70 bg-slate-900/50 p-4">
                <div className="space-y-3">
                  <RuleRow status={analysis.allFilled ? "met" : "pending"} label="No blank tiles remain" />
                  <RuleRow status={analysis.islandsStatus} label="White areas match numbers" />
                  <RuleRow status={analysis.blackStatus} label="Black cells are all connected" />
                  <RuleRow status={analysis.hasTwoByTwoBlack ? "violated" : "met"} label="No 2x2 blocks of black cells" />
                </div>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <p>Click a tile to cycle it between Black, White, and Blank.</p>
                  <p>Clues and locked cells cannot be modified.</p>
                </div>
              </div>
            </div>

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
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RuleRow({ status, label }: { status: RuleStatus; label: string }) {
  const icon = status === "met"
    ? <Check className="size-4" />
    : status === "violated"
      ? <X className="size-4" />
      : <Minus className="size-4" />
  const color = status === "met"
    ? "text-emerald-300"
    : status === "violated"
      ? "text-red-300"
      : "text-slate-500"

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={color}>{icon}</span>
      <span className="text-slate-200">{label}</span>
    </div>
  )
}

function drawBoard(
  canvas: HTMLCanvasElement | null,
  rows: number,
  cols: number,
  board: CellState[][],
  clues: NurikabeClue[],
  lockedCells: NurikabeLockedCell[],
  hoveredCell: CellCoord | null
): void {
  if (!canvas) return
  const layout = prepareCanvas(canvas, rows, cols)
  if (!layout) return
  const { ctx, cssWidth, cssHeight, boardWidth, boardHeight, cell, xOffset, yOffset } = layout
  const clueByKey = new Map(clues.map((clue) => [coordKey(clue), clue]))
  const clueStatusByKey = getEnclosedClueStatuses(board, clues, rows, cols)
  const lockedKeys = new Set(lockedCells.map(coordKey))

  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = "#0b0f14"
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  ctx.save()
  roundRect(ctx, xOffset, yOffset, boardWidth, boardHeight, 10)
  ctx.clip()
  ctx.fillStyle = "#9aa5b1"
  ctx.fillRect(xOffset, yOffset, boardWidth, boardHeight)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      drawCell(
        ctx,
        xOffset + col * cell,
        yOffset + row * cell,
        cell,
        board[row]![col]!,
        clueByKey.get(`${row},${col}`),
        clueStatusByKey.get(`${row},${col}`),
        lockedKeys.has(`${row},${col}`),
        hoveredCell?.row === row && hoveredCell.col === col
      )
    }
  }
  ctx.restore()
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  state: CellState,
  clue: NurikabeClue | undefined,
  clueStatus: "correct" | "incorrect" | undefined,
  lockedBlack: boolean,
  hovered: boolean
): void {
  if (state === "empty") {
    ctx.fillStyle = "#9aa5b1"
    ctx.fillRect(x, y, cell, cell)
    drawGridLine(ctx, x, y, cell)
    if (hovered) drawCellHover(ctx, x, y, cell)
    return
  }

  ctx.fillStyle = state === "white" ? "#f7f1df" : "#07111f"
  ctx.fillRect(x, y, cell, cell)
  drawGridLine(ctx, x, y, cell)

  if (lockedBlack) {
    drawLockIcon(ctx, x + cell / 2, y + cell / 2, cell)
  }

  if (hovered) drawCellHover(ctx, x, y, cell)

  if (clue) {
    ctx.fillStyle = clueStatus === "correct"
      ? "#15803d"
      : clueStatus === "incorrect"
        ? "#b91c1c"
        : "#020617"
    ctx.font = `800 ${Math.max(11, cell * 0.3)}px Inter, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(String(clue.size), x + cell / 2, y + cell / 2 + 0.5)
  }
}

function drawGridLine(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
  ctx.strokeStyle = "rgba(15,23,42,0.42)"
  ctx.lineWidth = Math.max(1, cell * 0.014)
  ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
}

function drawCellHover(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
  ctx.fillStyle = "rgba(125,211,252,0.22)"
  ctx.fillRect(x, y, cell, cell)
  ctx.strokeStyle = "rgba(186,230,253,0.95)"
  ctx.lineWidth = Math.max(2, cell * 0.028)
  ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4)
}

function drawLockIcon(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, cell: number): void {
  const width = cell * 0.22
  const height = cell * 0.16
  const bodyX = centerX - width / 2
  const bodyY = centerY - height * 0.1
  const radius = Math.max(2, cell * 0.035)

  ctx.strokeStyle = "rgba(226,232,240,0.62)"
  ctx.fillStyle = "rgba(226,232,240,0.08)"
  ctx.lineWidth = Math.max(1.5, cell * 0.024)

  ctx.beginPath()
  ctx.arc(centerX, bodyY, width * 0.32, Math.PI, Math.PI * 2)
  ctx.stroke()

  roundRect(ctx, bodyX, bodyY, width, height, radius)
  ctx.fill()
  ctx.stroke()
}

function getEnclosedClueStatuses(
  board: CellState[][],
  clues: NurikabeClue[],
  rows: number,
  cols: number
): Map<string, "correct" | "incorrect"> {
  const clueByKey = new Map(clues.map((clue) => [coordKey(clue), clue]))
  const statuses = new Map<string, "correct" | "incorrect">()

  for (const region of getRegions(board, "white", rows, cols)) {
    if (!isWhiteRegionEnclosed(board, region, rows, cols)) continue
    const regionClues = region
      .map((cell) => clueByKey.get(coordKey(cell)))
      .filter((clue): clue is NurikabeClue => clue !== undefined)
    if (regionClues.length === 0) continue

    const correct = regionClues.length === 1 && region.length === regionClues[0]!.size
    for (const clue of regionClues) {
      statuses.set(coordKey(clue), correct ? "correct" : "incorrect")
    }
  }

  return statuses
}

function isWhiteRegionEnclosed(
  board: CellState[][],
  region: CellCoord[],
  rows: number,
  cols: number
): boolean {
  return region.every((cell) =>
    neighbors(cell, rows, cols).every((neighbor) => board[neighbor.row]?.[neighbor.col] !== "empty")
  )
}

function prepareCanvas(canvas: HTMLCanvasElement, rows: number, cols: number): (BoardLayout & { ctx: CanvasRenderingContext2D }) | null {
  const rect = canvas.getBoundingClientRect()
  const cssWidth = rect.width
  const cssHeight = rect.height
  if (cssWidth <= 0 || cssHeight <= 0) return null
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(cssWidth * dpr)
  canvas.height = Math.floor(cssHeight * dpr)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const pad = Math.max(8, Math.min(cssWidth, cssHeight) * 0.025)
  const boardSize = Math.min(cssWidth - pad * 2, cssHeight - pad * 2)
  const cell = boardSize / Math.max(rows, cols)
  const boardWidth = cols * cell
  const boardHeight = rows * cell
  return {
    ctx,
    cssWidth,
    cssHeight,
    boardWidth,
    boardHeight,
    cell,
    xOffset: (cssWidth - boardWidth) / 2,
    yOffset: (cssHeight - boardHeight) / 2,
  }
}

function getCanvasCoord(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  rows: number,
  cols: number
): CellCoord | null {
  const rect = canvas.getBoundingClientRect()
  const pad = Math.max(8, Math.min(rect.width, rect.height) * 0.025)
  const boardSize = Math.min(rect.width - pad * 2, rect.height - pad * 2)
  const cell = boardSize / Math.max(rows, cols)
  const width = cols * cell
  const height = rows * cell
  const xOffset = (rect.width - width) / 2
  const yOffset = (rect.height - height) / 2
  const x = clientX - rect.left - xOffset
  const y = clientY - rect.top - yOffset
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  return {
    row: Math.floor(y / cell),
    col: Math.floor(x / cell),
  }
}

function nextCellState(cell: CellState): CellState {
  if (cell === "empty") return "white"
  if (cell === "white") return "black"
  return "white"
}

function analyzeBoard(
  board: CellState[][],
  clues: NurikabeClue[],
  lockedCells: NurikabeLockedCell[],
  rows: number,
  cols: number
) {
  return validateSolvedBoard(board, clues, lockedCells, rows, cols)
}

function validateSolvedBoard(
  board: CellState[][],
  clues: NurikabeClue[],
  lockedCells: NurikabeLockedCell[],
  rows: number,
  cols: number
) {
  const allFilled = board.every((row) => row.every((cell) => cell !== "empty"))
  const islandsValid = allFilled && areWhiteIslandsValid(board, clues, rows, cols)
  const blackConnected = allFilled && getRegions(board, "black", rows, cols).length === 1
  const hasTwoByTwoBlack = hasBlackTwoByTwo(board, rows, cols)
  const islandsViolated = hasWhiteIslandViolation(board, clues, rows, cols)
  const locksValid = lockedCells.every((cell) => board[cell.row]?.[cell.col] === cell.color) &&
    clues.every((clue) => board[clue.row]?.[clue.col] === "white")
  return {
    allFilled,
    islandsValid,
    islandsStatus: getRuleStatus(islandsValid, islandsViolated || (allFilled && !islandsValid)),
    blackConnected,
    blackStatus: getRuleStatus(blackConnected, allFilled && !blackConnected),
    hasTwoByTwoBlack,
    solved: allFilled && islandsValid && blackConnected && !hasTwoByTwoBlack && locksValid,
  }
}

function getRuleStatus(met: boolean, violated: boolean): RuleStatus {
  if (met) return "met"
  if (violated) return "violated"
  return "pending"
}

function areWhiteIslandsValid(
  board: CellState[][],
  clues: NurikabeClue[],
  rows: number,
  cols: number
): boolean {
  const clueByKey = new Map(clues.map((clue) => [coordKey(clue), clue]))
  const regions = getRegions(board, "white", rows, cols)
  if (regions.length !== clues.length) return false
  return regions.every((region) => {
    const regionClues = region
      .map((cell) => clueByKey.get(coordKey(cell)))
      .filter((clue): clue is NurikabeClue => clue !== undefined)
    return regionClues.length === 1 && region.length === regionClues[0]!.size
  })
}

function hasWhiteIslandViolation(
  board: CellState[][],
  clues: NurikabeClue[],
  rows: number,
  cols: number
): boolean {
  const clueByKey = new Map(clues.map((clue) => [coordKey(clue), clue]))
  return getRegions(board, "white", rows, cols).some((region) => {
    const regionClues = region
      .map((cell) => clueByKey.get(coordKey(cell)))
      .filter((clue): clue is NurikabeClue => clue !== undefined)
    if (regionClues.length > 1) return true
    return regionClues.length === 1 && region.length > regionClues[0]!.size
  })
}

function getRegions(
  board: CellState[][],
  color: NurikabeCellColor,
  rows: number,
  cols: number
): CellCoord[][] {
  const visited = new Set<string>()
  const regions: CellCoord[][] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (board[row]?.[col] !== color) continue
      const start = { row, col }
      const startKey = coordKey(start)
      if (visited.has(startKey)) continue
      const region: CellCoord[] = []
      const queue = [start]
      visited.add(startKey)
      while (queue.length > 0) {
        const current = queue.shift()!
        region.push(current)
        for (const neighbor of neighbors(current, rows, cols)) {
          const key = coordKey(neighbor)
          if (visited.has(key) || board[neighbor.row]?.[neighbor.col] !== color) continue
          visited.add(key)
          queue.push(neighbor)
        }
      }
      regions.push(region)
    }
  }
  return regions
}

function hasBlackTwoByTwo(board: CellState[][], rows: number, cols: number): boolean {
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      if (
        board[row]?.[col] === "black" &&
        board[row]?.[col + 1] === "black" &&
        board[row + 1]?.[col] === "black" &&
        board[row + 1]?.[col + 1] === "black"
      ) {
        return true
      }
    }
  }
  return false
}

function neighbors(cell: CellCoord, rows: number, cols: number): CellCoord[] {
  return [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row, col: cell.col + 1 },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
  ].filter((next) => next.row >= 0 && next.row < rows && next.col >= 0 && next.col < cols)
}

function cloneGrid<T>(grid: T[][]): T[][] {
  return grid.map((row) => [...row])
}

function coordKey(cell: CellCoord): string {
  return `${cell.row},${cell.col}`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function formatSolvedCount(count: number): string {
  return count === 1
    ? "1 player has solved the puzzle"
    : `${count} players have solved the puzzle`
}

export default NurikabeActive
