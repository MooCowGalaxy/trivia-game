import { useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Check, RotateCcw, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PuzzleSolvedCelebration } from "@/components/PuzzleSolvedCelebration"
import { Timer } from "@/components/Timer"
import { GameContext, type RushHourVehicle } from "@/context/GameContext"
import { useAuth } from "@/hooks/useAuth"
import { socket } from "@/socket"

type AckResponse = { ok: boolean; reason?: string; error?: string }
type RushHourMove = { vehicleId: string; delta: -1 | 1 }

interface DragState {
  vehicleId: string
  orientation: "H" | "V"
  startAxisPx: number
  appliedSteps: number
  pointerId: number
}

const VEHICLE_COLORS: Array<[string, string]> = [
  ["#38bdf8", "#2563eb"],
  ["#34d399", "#059669"],
  ["#fbbf24", "#d97706"],
  ["#a78bfa", "#7c3aed"],
  ["#fb7185", "#e11d48"],
  ["#2dd4bf", "#0f766e"],
  ["#f472b6", "#db2777"],
  ["#c4b5fd", "#8b5cf6"],
  ["#93c5fd", "#3b82f6"],
  ["#bef264", "#65a30d"],
  ["#fdba74", "#ea580c"],
  ["#67e8f9", "#0891b2"],
]

export function RushHourActive() {
  const ctx = useContext(GameContext)
  const { user } = useAuth()
  const gameState = ctx?.gameState
  const rushState = gameState?.rushHourState
  const timerRemainingMs = ctx?.timerRemainingMs
  const timerSeconds = gameState?.currentRound?.timerSeconds ?? 120
  const puzzleKey = rushState
    ? `${rushState.size}:${rushState.vehicles.map((vehicle) => `${vehicle.id}-${vehicle.row}-${vehicle.col}`).join("|")}`
    : ""

  if (!rushState) return null

  return (
    <RushHourPuzzle
      key={puzzleKey}
      size={rushState.size}
      targetId={rushState.targetId}
      exitRow={rushState.exitRow}
      initialVehicles={rushState.vehicles}
      completed={rushState.completed}
      completedCount={ctx?.rushHourProgress?.completedCount ?? rushState.completedCount}
      optimalVehicleMoves={rushState.optimalVehicleMoves}
      canSubmit={!!user && gameState?.players.some((player) => player.id === user.discordId)}
      timerRemainingMs={timerRemainingMs}
      timerSeconds={timerSeconds}
    />
  )
}

interface RushHourPuzzleProps {
  size: number
  targetId: string
  exitRow: number
  initialVehicles: RushHourVehicle[]
  completed: boolean
  completedCount: number
  optimalVehicleMoves: number
  canSubmit: boolean
  timerRemainingMs: number | null | undefined
  timerSeconds: number
}

function RushHourPuzzle({
  size,
  targetId,
  exitRow,
  initialVehicles,
  completed: serverCompleted,
  completedCount,
  optimalVehicleMoves,
  canSubmit,
  timerRemainingMs,
  timerSeconds,
}: RushHourPuzzleProps) {
  const [vehicles, setVehicles] = useState<RushHourVehicle[]>(() => cloneVehicles(initialVehicles))
  const [moveCount, setMoveCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const vehiclesRef = useRef<RushHourVehicle[]>(cloneVehicles(initialVehicles))
  const movesRef = useRef<RushHourMove[]>([])
  const submittedKeyRef = useRef<string | null>(null)
  const completed = serverCompleted || submitted

  const colorByVehicle = useMemo(() => {
    const map = new Map<string, [string, string]>()
    initialVehicles.forEach((vehicle, index) => {
      map.set(vehicle.id, vehicle.isTarget || vehicle.id === targetId ? ["#f87171", "#dc2626"] : VEHICLE_COLORS[index % VEHICLE_COLORS.length]!)
    })
    return map
  }, [initialVehicles, targetId])

  useEffect(() => {
    drawRushHourBoard(canvasRef.current, size, exitRow, targetId, vehicles, colorByVehicle, selectedVehicleId)
  }, [colorByVehicle, exitRow, selectedVehicleId, size, targetId, vehicles])

  useEffect(() => {
    const handleResize = () => {
      drawRushHourBoard(canvasRef.current, size, exitRow, targetId, vehiclesRef.current, colorByVehicle, selectedVehicleId)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [colorByVehicle, exitRow, selectedVehicleId, size, targetId])

  const submitSolve = useCallback(
    (moves: RushHourMove[]) => {
      if (!canSubmit || completed || submitting) return
      const key = JSON.stringify(moves)
      if (submittedKeyRef.current === key) return
      submittedKeyRef.current = key
      setSubmitting(true)

      socket.emit("player:rush_hour_solve", { moves }, (res: AckResponse) => {
        setSubmitting(false)
        if (res.ok) {
          setSubmitted(true)
          setError(null)
        } else {
          setError(res.reason ?? res.error ?? "Solve rejected")
        }
      })
    },
    [canSubmit, completed, submitting]
  )

  const applySingleMove = useCallback(
    (vehicleId: string, delta: -1 | 1) => {
      if (completed || submitting) return false
      const current = vehiclesRef.current
      const vehicle = current.find((entry) => entry.id === vehicleId)
      if (!vehicle) return false
      if (!canMoveVehicle(vehicle, delta, current, size)) return false

      const next = current.map((entry) =>
        entry.id === vehicleId
          ? {
              ...entry,
              row: entry.orientation === "V" ? entry.row + delta : entry.row,
              col: entry.orientation === "H" ? entry.col + delta : entry.col,
            }
          : entry
      )
      const nextMoves = [...movesRef.current, { vehicleId, delta }]
      vehiclesRef.current = next
      movesRef.current = nextMoves
      setVehicles(next)
      setMoveCount(nextMoves.length)
      setError(null)

      if (isRushHourSolved(next, size, targetId)) {
        submitSolve(nextMoves)
      }
      return true
    },
    [completed, size, submitting, submitSolve, targetId]
  )

  const stepDragToward = useCallback(
    (targetSteps: number) => {
      const drag = dragRef.current
      if (!drag) return

      let appliedSteps = drag.appliedSteps
      const direction = Math.sign(targetSteps - appliedSteps) as -1 | 0 | 1
      if (direction === 0) return

      while (appliedSteps !== targetSteps) {
        const delta = Math.sign(targetSteps - appliedSteps) as -1 | 1
        if (!applySingleMove(drag.vehicleId, delta)) break
        appliedSteps += delta
      }

      dragRef.current = { ...drag, appliedSteps }
    },
    [applySingleMove]
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (completed || submitting) return
      const coord = getCanvasGridCoord(event, size)
      if (!coord) return
      const vehicle = findVehicleAt(vehiclesRef.current, coord.row, coord.col)
      if (!vehicle) return

      event.currentTarget.setPointerCapture(event.pointerId)
      const axis = vehicle.orientation === "H" ? event.clientX : event.clientY
      dragRef.current = {
        vehicleId: vehicle.id,
        orientation: vehicle.orientation,
        startAxisPx: axis,
        appliedSteps: 0,
        pointerId: event.pointerId,
      }
      setSelectedVehicleId(vehicle.id)
      setError(null)
    },
    [completed, size, submitting]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current
      if (!drag || completed || submitting) return
      const layout = getRushHourLayout(event.currentTarget, size)
      if (!layout) return
      const axis = drag.orientation === "H" ? event.clientX : event.clientY
      const targetSteps = Math.round((axis - drag.startAxisPx) / layout.cell)
      stepDragToward(targetSteps)
    },
    [completed, size, stepDragToward, submitting]
  )

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }, [])

  const undoMove = useCallback(() => {
    if (completed || submitting || movesRef.current.length === 0) return
    const lastMove = movesRef.current[movesRef.current.length - 1]!
    const reverse: RushHourMove = {
      vehicleId: lastMove.vehicleId,
      delta: (lastMove.delta * -1) as -1 | 1,
    }
    const nextVehicles = applyMoveUnchecked(vehiclesRef.current, reverse)
    const nextMoves = movesRef.current.slice(0, -1)
    vehiclesRef.current = nextVehicles
    movesRef.current = nextMoves
    setVehicles(nextVehicles)
    setMoveCount(nextMoves.length)
    setError(null)
    submittedKeyRef.current = null
  }, [completed, submitting])

  const resetBoard = useCallback(() => {
    if (completed || submitting) return
    const next = cloneVehicles(initialVehicles)
    vehiclesRef.current = next
    movesRef.current = []
    submittedKeyRef.current = null
    dragRef.current = null
    setVehicles(next)
    setMoveCount(0)
    setError(null)
    setSelectedVehicleId(null)
  }, [completed, initialVehicles, submitting])

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="mx-auto w-full max-w-2xl space-y-5 animate-in fade-in duration-300">
        <Timer remainingMs={timerRemainingMs ?? 0} totalMs={timerSeconds * 1000} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {formatSolvedCount(completedCount)}
            </Badge>
            <Badge variant="outline" className="text-sm">
              Optimal: {optimalVehicleMoves} moves
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={undoMove}
              disabled={completed || submitting || moveCount === 0}
              aria-label="Undo move"
              title="Undo move"
            >
              <Undo2 className="size-4" />
            </Button>
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
        </div>

        <Card>
          <CardContent className="relative space-y-5 overflow-hidden p-5 sm:p-6">
            <PuzzleSolvedCelebration show={completed} />

            {!canSubmit && (
              <div className="rounded-md border border-blue-300/20 bg-blue-300/10 px-4 py-3 text-center text-sm text-blue-100">
                You are spectating, so your solve will not count. You can still
                play the puzzle here.
              </div>
            )}

            <div className="relative mx-auto aspect-square w-full max-w-[min(84vw,31rem)]">
              <canvas
                ref={canvasRef}
                className="block size-full touch-none rounded-md bg-slate-950 shadow-inner"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                aria-label="Rush Hour puzzle"
              />
            </div>

            <div className="space-y-2 text-center">
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Drag each vehicle along its lane. Clear the path and slide the
                red car out through the exit on the right.
              </p>
              <p className="text-xs text-muted-foreground">{moveCount} moves</p>
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

function drawRushHourBoard(
  canvas: HTMLCanvasElement | null,
  size: number,
  exitRow: number,
  targetId: string,
  vehicles: RushHourVehicle[],
  colorByVehicle: Map<string, [string, string]>,
  selectedVehicleId: string | null
): void {
  if (!canvas) return
  const layout = prepareCanvas(canvas, size)
  if (!layout) return
  const { ctx, cssSize, boardSize, cell, xOffset, yOffset, exitGutter } = layout

  ctx.clearRect(0, 0, cssSize, cssSize)
  const background = ctx.createLinearGradient(0, 0, cssSize, cssSize)
  background.addColorStop(0, "#020617")
  background.addColorStop(1, "#111827")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, cssSize, cssSize)

  ctx.save()
  ctx.shadowColor = "rgba(15,23,42,0.55)"
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 8
  ctx.fillStyle = "#060b1a"
  roundRect(ctx, xOffset, yOffset, boardSize, boardSize, 14)
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRect(ctx, xOffset, yOffset, boardSize, boardSize, 14)
  ctx.clip()
  ctx.fillStyle = "#050816"
  ctx.fillRect(xOffset, yOffset, boardSize, boardSize)

  ctx.strokeStyle = "rgba(148,163,184,0.2)"
  ctx.lineWidth = 1
  for (let i = 1; i < size; i++) {
    const pos = xOffset + i * cell
    ctx.beginPath()
    ctx.moveTo(pos, yOffset)
    ctx.lineTo(pos, yOffset + boardSize)
    ctx.stroke()

    const y = yOffset + i * cell
    ctx.beginPath()
    ctx.moveTo(xOffset, y)
    ctx.lineTo(xOffset + boardSize, y)
    ctx.stroke()
  }
  ctx.restore()

  drawExit(ctx, xOffset, yOffset, boardSize, cell, exitRow, exitGutter)

  const sortedVehicles = [...vehicles].sort((a, b) => Number(a.id === targetId) - Number(b.id === targetId))
  for (const vehicle of sortedVehicles) {
    drawVehicle(ctx, xOffset, yOffset, cell, vehicle, targetId, colorByVehicle, selectedVehicleId === vehicle.id)
  }

  ctx.strokeStyle = "rgba(255,255,255,0.24)"
  ctx.lineWidth = 2
  roundRect(ctx, xOffset + 1, yOffset + 1, boardSize - 2, boardSize - 2, 14)
  ctx.stroke()
}

function prepareCanvas(canvas: HTMLCanvasElement, size: number) {
  const rect = canvas.getBoundingClientRect()
  const cssSize = Math.min(rect.width, rect.height)
  if (cssSize <= 0) return null
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(cssSize * dpr)
  canvas.height = Math.floor(cssSize * dpr)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const outerPad = Math.max(12, cssSize * 0.055)
  const exitGutter = Math.max(26, cssSize * 0.085)
  const boardSize = cssSize - outerPad * 2 - exitGutter
  const cell = boardSize / size
  const xOffset = outerPad
  const yOffset = (cssSize - boardSize) / 2

  return { ctx, cssSize, boardSize, cell, xOffset, yOffset, exitGutter }
}

function drawExit(
  ctx: CanvasRenderingContext2D,
  xOffset: number,
  yOffset: number,
  boardSize: number,
  cell: number,
  exitRow: number,
  exitGutter: number
): void {
  const exitX = xOffset + boardSize
  const exitY = yOffset + exitRow * cell
  const centerY = exitY + cell / 2

  ctx.save()
  ctx.strokeStyle = "#f87171"
  ctx.lineWidth = Math.max(4, cell * 0.08)
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(exitX - 1, exitY + cell * 0.18)
  ctx.lineTo(exitX - 1, exitY + cell * 0.82)
  ctx.stroke()

  ctx.strokeStyle = "rgba(248,113,113,0.55)"
  ctx.lineWidth = Math.max(2, cell * 0.045)
  ctx.beginPath()
  ctx.moveTo(exitX + exitGutter * 0.2, centerY)
  ctx.lineTo(exitX + exitGutter * 0.72, centerY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(exitX + exitGutter * 0.55, centerY - cell * 0.14)
  ctx.lineTo(exitX + exitGutter * 0.72, centerY)
  ctx.lineTo(exitX + exitGutter * 0.55, centerY + cell * 0.14)
  ctx.stroke()
  ctx.restore()
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  xOffset: number,
  yOffset: number,
  cell: number,
  vehicle: RushHourVehicle,
  targetId: string,
  colorByVehicle: Map<string, [string, string]>,
  selected: boolean
): void {
  const padding = Math.max(5, cell * 0.08)
  const x = xOffset + vehicle.col * cell + padding
  const y = yOffset + vehicle.row * cell + padding
  const width = (vehicle.orientation === "H" ? vehicle.length * cell : cell) - padding * 2
  const height = (vehicle.orientation === "V" ? vehicle.length * cell : cell) - padding * 2
  const colors = colorByVehicle.get(vehicle.id) ?? ["#94a3b8", "#475569"]
  const isTarget = vehicle.id === targetId || vehicle.isTarget

  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.45)"
  ctx.shadowBlur = selected ? 18 : 10
  ctx.shadowOffsetY = selected ? 8 : 5
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height)
  gradient.addColorStop(0, colors[0])
  gradient.addColorStop(1, colors[1])
  ctx.fillStyle = gradient
  roundRect(ctx, x, y, width, height, 10)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = selected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.36)"
  ctx.lineWidth = selected ? 3 : 1.5
  roundRect(ctx, x + 1, y + 1, width - 2, height - 2, 9)
  ctx.stroke()

  ctx.fillStyle = "rgba(255,255,255,0.94)"
  ctx.font = `800 ${Math.max(13, cell * 0.23)}px Inter, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(isTarget ? "EXIT" : vehicle.id, x + width / 2, y + height / 2 + 0.5)
}

function getCanvasGridCoord(
  event: ReactPointerEvent<HTMLCanvasElement>,
  size: number
): { row: number; col: number } | null {
  const layout = getRushHourLayout(event.currentTarget, size)
  if (!layout) return null
  const x = event.clientX - layout.rect.left - layout.xOffset
  const y = event.clientY - layout.rect.top - layout.yOffset
  if (x < 0 || y < 0 || x >= layout.boardSize || y >= layout.boardSize) return null
  return {
    row: Math.floor(y / layout.cell),
    col: Math.floor(x / layout.cell),
  }
}

function getRushHourLayout(canvas: HTMLCanvasElement, size: number) {
  const rect = canvas.getBoundingClientRect()
  const cssSize = Math.min(rect.width, rect.height)
  if (cssSize <= 0) return null
  const outerPad = Math.max(12, cssSize * 0.055)
  const exitGutter = Math.max(26, cssSize * 0.085)
  const boardSize = cssSize - outerPad * 2 - exitGutter
  const cell = boardSize / size
  const xOffset = outerPad
  const yOffset = (cssSize - boardSize) / 2
  return { rect, cssSize, boardSize, cell, xOffset, yOffset, exitGutter }
}

function findVehicleAt(
  vehicles: RushHourVehicle[],
  row: number,
  col: number
): RushHourVehicle | null {
  return vehicles.find((vehicle) =>
    getVehicleCells(vehicle).some((cell) => cell.row === row && cell.col === col)
  ) ?? null
}

function canMoveVehicle(
  vehicle: RushHourVehicle,
  delta: -1 | 1,
  vehicles: RushHourVehicle[],
  size: number
): boolean {
  const front =
    vehicle.orientation === "H"
      ? { row: vehicle.row, col: delta > 0 ? vehicle.col + vehicle.length : vehicle.col - 1 }
      : { row: delta > 0 ? vehicle.row + vehicle.length : vehicle.row - 1, col: vehicle.col }
  if (front.row < 0 || front.row >= size || front.col < 0 || front.col >= size) return false
  const occupant = findVehicleAt(vehicles, front.row, front.col)
  return !occupant || occupant.id === vehicle.id
}

function applyMoveUnchecked(vehicles: RushHourVehicle[], move: RushHourMove): RushHourVehicle[] {
  return vehicles.map((vehicle) =>
    vehicle.id === move.vehicleId
      ? {
          ...vehicle,
          row: vehicle.orientation === "V" ? vehicle.row + move.delta : vehicle.row,
          col: vehicle.orientation === "H" ? vehicle.col + move.delta : vehicle.col,
        }
      : vehicle
  )
}

function isRushHourSolved(
  vehicles: RushHourVehicle[],
  size: number,
  targetId: string
): boolean {
  const target = vehicles.find((vehicle) => vehicle.id === targetId || vehicle.isTarget)
  return !!target && target.col + target.length === size
}

function getVehicleCells(vehicle: RushHourVehicle): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = []
  for (let index = 0; index < vehicle.length; index++) {
    cells.push({
      row: vehicle.row + (vehicle.orientation === "V" ? index : 0),
      col: vehicle.col + (vehicle.orientation === "H" ? index : 0),
    })
  }
  return cells
}

function cloneVehicles(vehicles: RushHourVehicle[]): RushHourVehicle[] {
  return vehicles.map((vehicle) => ({ ...vehicle }))
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

export default RushHourActive
