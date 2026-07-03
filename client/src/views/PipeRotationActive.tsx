import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PuzzleSolvedCelebration } from "@/components/PuzzleSolvedCelebration"
import { Timer } from "@/components/Timer"
import { GameContext, type PipeCoordinate, type PipeTile } from "@/context/GameContext"
import { useAuth } from "@/hooks/useAuth"
import { socket } from "@/socket"

type AckResponse = { ok: boolean; reason?: string; error?: string }
interface PipeRotationAnimation {
  fromMask: number
  fromAngle: number
  toAngle: number
  startedAt: number
  durationMs: number
}

const NORTH = 1
const EAST = 2
const SOUTH = 4
const WEST = 8
const ROTATION_ANIMATION_MS = 150
const PIPE_DIRECTIONS = [
  { bit: NORTH, opposite: SOUTH, dr: -1, dc: 0 },
  { bit: EAST, opposite: WEST, dr: 0, dc: 1 },
  { bit: SOUTH, opposite: NORTH, dr: 1, dc: 0 },
  { bit: WEST, opposite: EAST, dr: 0, dc: -1 },
]

export function PipeRotationActive() {
  const ctx = useContext(GameContext)
  const { user } = useAuth()
  const gameState = ctx?.gameState
  const pipeState = gameState?.pipeRotationState
  const timerRemainingMs = ctx?.timerRemainingMs
  const timerSeconds = gameState?.currentRound?.timerSeconds ?? 120

  if (!pipeState) return null

  return (
    <PipeRotationPuzzle
      rows={pipeState.rows}
      cols={pipeState.cols}
      source={pipeState.source}
      terminals={pipeState.terminals}
      tiles={pipeState.tiles}
      completed={pipeState.completed}
      completedCount={ctx?.pipeRotationProgress?.completedCount ?? pipeState.completedCount}
      canSubmit={!!user && gameState?.players.some((player) => player.id === user.discordId)}
      timerRemainingMs={timerRemainingMs}
      timerSeconds={timerSeconds}
    />
  )
}

interface PipeRotationPuzzleProps {
  rows: number
  cols: number
  source: PipeCoordinate
  terminals: PipeCoordinate[]
  tiles: PipeTile[]
  completed: boolean
  completedCount: number
  canSubmit: boolean
  timerRemainingMs: number | null | undefined
  timerSeconds: number
}

function PipeRotationPuzzle({
  rows,
  cols,
  source,
  terminals,
  tiles,
  completed: serverCompleted,
  completedCount,
  canSubmit,
  timerRemainingMs,
  timerSeconds,
}: PipeRotationPuzzleProps) {
  const initialMasks = useMemo(
    () => tilesToMasks(rows, cols, tiles),
    [cols, rows, tiles]
  )
  const [masks, setMasks] = useState<number[]>(initialMasks)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const masksRef = useRef<number[]>(initialMasks)
  const animationsRef = useRef<Map<number, PipeRotationAnimation>>(new Map())
  const animationFrameRef = useRef<number | null>(null)
  const renderBoardRef = useRef<(now?: number) => void>(() => {})
  const submittedKeyRef = useRef<string | null>(null)
  const completed = serverCompleted || submitted

  const renderBoard = useCallback(
    (now = performance.now()) => {
      let hasActiveAnimation = false
      for (const [index, animation] of animationsRef.current) {
        if (now - animation.startedAt >= animation.durationMs) {
          animationsRef.current.delete(index)
        } else {
          hasActiveAnimation = true
        }
      }

      drawPipeBoard(
        canvasRef.current,
        rows,
        cols,
        masksRef.current,
        source,
        terminals,
        animationsRef.current,
        now
      )

      if (hasActiveAnimation) {
        if (animationFrameRef.current === null) {
          animationFrameRef.current = requestAnimationFrame((nextNow) => {
            animationFrameRef.current = null
            renderBoardRef.current(nextNow)
          })
        }
      } else {
        animationFrameRef.current = null
      }
    },
    [cols, rows, source, terminals]
  )

  useEffect(() => {
    renderBoardRef.current = renderBoard
  }, [renderBoard])

  const requestRender = useCallback(() => {
    if (animationFrameRef.current !== null) return
    animationFrameRef.current = requestAnimationFrame((now) => {
      animationFrameRef.current = null
      renderBoard(now)
    })
  }, [renderBoard])

  useEffect(() => {
    masksRef.current = masks
    renderBoard()
  }, [masks, renderBoard])

  useEffect(() => {
    const handleResize = () => {
      renderBoard()
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [renderBoard])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const submitSolve = useCallback(
    (nextMasks: number[]) => {
      if (!canSubmit || completed || submitting) return
      const key = nextMasks.join(",")
      if (submittedKeyRef.current === key) return
      submittedKeyRef.current = key
      setSubmitting(true)

      socket.emit("player:pipe_rotation_solve", { masks: nextMasks }, (res: AckResponse) => {
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

  const rotateAt = useCallback(
    (coord: PipeCoordinate) => {
      if (completed || submitting) return
      const index = coord.row * cols + coord.col
      const current = masksRef.current
      const now = performance.now()
      const existingAnimation = animationsRef.current.get(index)
      const next = [...current]

      animationsRef.current.set(index, {
        fromMask: existingAnimation?.fromMask ?? current[index]!,
        fromAngle: getPipeRotationAngle(existingAnimation, now),
        toAngle: (existingAnimation?.toAngle ?? 0) + Math.PI / 2,
        startedAt: now,
        durationMs: ROTATION_ANIMATION_MS,
      })

      next[index] = rotateMaskClockwise(next[index]!)
      masksRef.current = next
      setMasks(next)
      setError(null)
      if (isPipeSolved(rows, cols, source, terminals, next)) {
        submitSolve(next)
      }
      requestRender()
    },
    [cols, completed, requestRender, rows, source, submitting, submitSolve, terminals]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const coord = getCanvasGridCoord(event, rows, cols)
      if (!coord) return
      rotateAt(coord)
    },
    [cols, rows, rotateAt]
  )

  const resetBoard = useCallback(() => {
    if (completed || submitting) return
    animationsRef.current.clear()
    masksRef.current = initialMasks
    setMasks(initialMasks)
    setError(null)
    submittedKeyRef.current = null
    requestRender()
  }, [completed, initialMasks, requestRender, submitting])

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="mx-auto w-full max-w-2xl space-y-5 animate-in fade-in duration-300">
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
          <CardContent className="relative space-y-5 overflow-hidden p-5 sm:p-6">
            <PuzzleSolvedCelebration show={completed} />

            {!canSubmit && (
              <div className="rounded-md border border-blue-300/20 bg-blue-300/10 px-4 py-3 text-center text-sm text-blue-100">
                You are spectating, so your solve will not count. You can still
                play the puzzle here.
              </div>
            )}

            <div className="relative mx-auto aspect-square w-full max-w-[min(82vw,30rem)]">
              <canvas
                ref={canvasRef}
                className="block size-full touch-none rounded-md bg-slate-950 shadow-inner"
                onPointerDown={handlePointerDown}
                aria-label="Pipe Rotation puzzle"
              />
            </div>

            <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">
              Tap tiles to rotate them clockwise. Create a connected route from
              the green source to every numbered terminal.
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
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function tilesToMasks(rows: number, cols: number, tiles: PipeTile[]): number[] {
  const masks = Array<number>(rows * cols).fill(0)
  for (const tile of tiles) {
    masks[tile.row * cols + tile.col] = tile.initialMask
  }
  return masks
}

function drawPipeBoard(
  canvas: HTMLCanvasElement | null,
  rows: number,
  cols: number,
  masks: number[],
  source: PipeCoordinate,
  terminals: PipeCoordinate[],
  animations: Map<number, PipeRotationAnimation> = new Map(),
  now = performance.now()
): void {
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const cssSize = Math.min(rect.width, rect.height)
  if (cssSize <= 0) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(cssSize * dpr)
  canvas.height = Math.floor(cssSize * dpr)
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssSize, cssSize)
  ctx.fillStyle = "#030712"
  ctx.fillRect(0, 0, cssSize, cssSize)

  const cell = cssSize / Math.max(rows, cols)
  const xOffset = (cssSize - cols * cell) / 2
  const yOffset = (cssSize - rows * cell) / 2
  const pipeWidth = cell * 0.22
  const reachableCells = getReachablePipeCells(rows, cols, source, masks)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = xOffset + col * cell
      const y = yOffset + row * cell
      const index = row * cols + col
      const mask = masks[index] ?? 0
      const animation = animations.get(index)

      ctx.fillStyle = "#111827"
      ctx.strokeStyle = "rgba(148,163,184,0.2)"
      ctx.lineWidth = 1
      roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, 7)
      ctx.fill()
      ctx.stroke()

      drawPipeSegments(
        ctx,
        x,
        y,
        cell,
        pipeWidth,
        animation?.fromMask ?? mask,
        false,
        getPipeRotationAngle(animation, now)
      )
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!reachableCells.has(coordKey({ row, col }))) continue
      const x = xOffset + col * cell
      const y = yOffset + row * cell
      const index = row * cols + col
      const mask = masks[index] ?? 0
      const animation = animations.get(index)
      drawPipeSegments(
        ctx,
        x,
        y,
        cell,
        pipeWidth * 0.58,
        animation?.fromMask ?? mask,
        true,
        getPipeRotationAngle(animation, now)
      )
    }
  }

  drawMarker(ctx, xOffset, yOffset, cell, source, "#22c55e", "S", true)
  terminals.forEach((terminal, index) => {
    drawMarker(
      ctx,
      xOffset,
      yOffset,
      cell,
      terminal,
      reachableCells.has(coordKey(terminal)) ? "#86efac" : "#facc15",
      String(index + 1),
      reachableCells.has(coordKey(terminal))
    )
  })
}

function drawPipeSegments(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  pipeWidth: number,
  mask: number,
  flowing: boolean,
  rotationAngle = 0
): void {
  const cx = x + cell / 2
  const cy = y + cell / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, cell, cell)
  ctx.clip()
  if (rotationAngle !== 0) {
    ctx.translate(cx, cy)
    ctx.rotate(rotationAngle)
    ctx.translate(-cx, -cy)
  }

  if (flowing) {
    ctx.strokeStyle = "#7dd3fc"
    ctx.shadowColor = "rgba(125,211,252,0.24)"
    ctx.shadowBlur = Math.max(2, cell * 0.035)
  } else {
    ctx.strokeStyle = "#64748b"
    ctx.shadowBlur = 0
  }

  ctx.lineWidth = pipeWidth
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  ctx.beginPath()
  ctx.arc(cx, cy, pipeWidth * 0.52, 0, Math.PI * 2)
  ctx.stroke()

  for (const dir of [
    { bit: NORTH, x: cx, y },
    { bit: EAST, x: x + cell, y: cy },
    { bit: SOUTH, x: cx, y: y + cell },
    { bit: WEST, x, y: cy },
  ]) {
    if ((mask & dir.bit) === 0) continue
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(dir.x, dir.y)
    ctx.stroke()
  }

  ctx.restore()
}

function getPipeRotationAngle(
  animation: PipeRotationAnimation | undefined,
  now: number
): number {
  if (!animation) return 0
  const progress = Math.min(1, Math.max(0, (now - animation.startedAt) / animation.durationMs))
  return animation.fromAngle + easeOutCubic(progress) * (animation.toAngle - animation.fromAngle)
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  xOffset: number,
  yOffset: number,
  cell: number,
  coord: PipeCoordinate,
  color: string,
  label: string,
  reached = false
): void {
  const cx = xOffset + coord.col * cell + cell / 2
  const cy = yOffset + coord.row * cell + cell / 2
  ctx.beginPath()
  ctx.fillStyle = "#020617"
  ctx.arc(cx, cy, cell * 0.24, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = Math.max(2, cell * 0.045)
  ctx.strokeStyle = color
  ctx.stroke()
  if (reached) {
    ctx.beginPath()
    ctx.strokeStyle = "rgba(125,211,252,0.55)"
    ctx.lineWidth = Math.max(2, cell * 0.035)
    ctx.arc(cx, cy, cell * 0.31, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = color
  ctx.font = `700 ${Math.max(11, cell * 0.24)}px Inter, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, cx, cy + 0.5)
}

function getCanvasGridCoord(
  event: React.PointerEvent<HTMLCanvasElement>,
  rows: number,
  cols: number
): PipeCoordinate | null {
  const rect = event.currentTarget.getBoundingClientRect()
  const size = Math.min(rect.width, rect.height)
  const cell = size / Math.max(rows, cols)
  const xOffset = (size - cols * cell) / 2
  const yOffset = (size - rows * cell) / 2
  const x = event.clientX - rect.left - xOffset
  const y = event.clientY - rect.top - yOffset
  if (x < 0 || y < 0 || x >= cols * cell || y >= rows * cell) return null
  return {
    row: Math.floor(y / cell),
    col: Math.floor(x / cell),
  }
}

function isPipeSolved(
  rows: number,
  cols: number,
  source: PipeCoordinate,
  terminals: PipeCoordinate[],
  masks: number[]
): boolean {
  if (masks.length !== rows * cols) return false
  const reachable = getReachablePipeCells(rows, cols, source, masks)
  return terminals.every((terminal) => reachable.has(coordKey(terminal)))
}

function getReachablePipeCells(
  rows: number,
  cols: number,
  source: PipeCoordinate,
  masks: number[]
): Set<string> {
  const reachable = new Set<string>([coordKey(source)])
  const queue = [source]

  while (queue.length > 0) {
    const current = queue.shift()!
    const mask = masks[current.row * cols + current.col] ?? 0
    for (const dir of PIPE_DIRECTIONS) {
      if ((mask & dir.bit) === 0) continue
      const next = { row: current.row + dir.dr, col: current.col + dir.dc }
      if (next.row < 0 || next.col < 0 || next.row >= rows || next.col >= cols) continue
      const nextMask = masks[next.row * cols + next.col] ?? 0
      if ((nextMask & dir.opposite) === 0) continue
      const key = coordKey(next)
      if (reachable.has(key)) continue
      reachable.add(key)
      queue.push(next)
    }
  }

  return reachable
}

function rotateMaskClockwise(mask: number): number {
  let rotated = 0
  if ((mask & NORTH) !== 0) rotated |= EAST
  if ((mask & EAST) !== 0) rotated |= SOUTH
  if ((mask & SOUTH) !== 0) rotated |= WEST
  if ((mask & WEST) !== 0) rotated |= NORTH
  return rotated
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

function coordKey(coord: PipeCoordinate): string {
  return `${coord.row},${coord.col}`
}

function formatSolvedCount(count: number): string {
  return count === 1
    ? "1 player has solved the puzzle"
    : `${count} players have solved the puzzle`
}

export default PipeRotationActive
