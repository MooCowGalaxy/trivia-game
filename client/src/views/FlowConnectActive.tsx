import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PuzzleSolvedCelebration } from "@/components/PuzzleSolvedCelebration"
import { Timer } from "@/components/Timer"
import { GameContext, type FlowCoordinate, type FlowEndpoint } from "@/context/GameContext"
import { useAuth } from "@/hooks/useAuth"
import { socket } from "@/socket"

type AckResponse = { ok: boolean; reason?: string; error?: string }
type FlowPathMap = Record<number, FlowCoordinate[]>

interface FlowSubmittedPath {
  color: number
  cells: FlowCoordinate[]
}

interface DragState {
  color: number
  basePaths: FlowPathMap
  path: FlowCoordinate[]
}

const FLOW_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#06b6d4",
]

export function FlowConnectActive() {
  const ctx = useContext(GameContext)
  const { user } = useAuth()
  const gameState = ctx?.gameState
  const flowState = gameState?.flowConnectState
  const timerRemainingMs = ctx?.timerRemainingMs
  const timerSeconds = gameState?.currentRound?.timerSeconds ?? 120
  const puzzleKey = flowState
    ? `${flowState.size}:${flowState.endpoints.map((e) => `${e.color}-${e.start.row}-${e.start.col}-${e.end.row}-${e.end.col}`).join("|")}`
    : ""

  if (!flowState) return null

  return (
    <FlowConnectPuzzle
      key={puzzleKey}
      size={flowState.size}
      colorCount={flowState.colorCount}
      endpoints={flowState.endpoints}
      completed={flowState.completed}
      completedCount={ctx?.flowConnectProgress?.completedCount ?? flowState.completedCount}
      canSubmit={!!user && gameState?.players.some((player) => player.id === user.discordId)}
      timerRemainingMs={timerRemainingMs}
      timerSeconds={timerSeconds}
    />
  )
}

interface FlowConnectPuzzleProps {
  size: number
  colorCount: number
  endpoints: FlowEndpoint[]
  completed: boolean
  completedCount: number
  canSubmit: boolean
  timerRemainingMs: number | null | undefined
  timerSeconds: number
}

function FlowConnectPuzzle({
  size,
  colorCount,
  endpoints,
  completed: serverCompleted,
  completedCount,
  canSubmit,
  timerRemainingMs,
  timerSeconds,
}: FlowConnectPuzzleProps) {
  const initialPaths = useMemo(() => createInitialPaths(endpoints), [endpoints])
  const [committedPaths, setCommittedPaths] = useState<FlowPathMap>(initialPaths)
  const [previewPaths, setPreviewPaths] = useState<FlowPathMap>(initialPaths)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const submittedPathsRef = useRef<string | null>(null)

  const completed = serverCompleted || submitted
  const committedGrid = useMemo(
    () => buildGridFromPaths(committedPaths, endpoints, size),
    [committedPaths, endpoints, size]
  )
  const previewGrid = useMemo(
    () => buildGridFromPaths(previewPaths, endpoints, size),
    [previewPaths, endpoints, size]
  )
  const fillProgress = getFillProgress(previewGrid, endpoints)

  useEffect(() => {
    drawFlowBoard(canvasRef.current, previewGrid, previewPaths, endpoints, colorCount)
  }, [colorCount, endpoints, previewGrid, previewPaths])

  useEffect(() => {
    const handleResize = () => {
      drawFlowBoard(canvasRef.current, previewGrid, previewPaths, endpoints, colorCount)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [colorCount, endpoints, previewGrid, previewPaths])

  const submitSolve = useCallback(
    (paths: FlowPathMap) => {
      if (!canSubmit || completed || submitting) return

      const payload = serializePaths(paths, colorCount)
      const pathsKey = JSON.stringify(payload)
      if (submittedPathsRef.current === pathsKey) return
      submittedPathsRef.current = pathsKey
      setSubmitting(true)

      socket.emit("player:flow_connect_solve", { paths: payload }, (res: AckResponse) => {
        setSubmitting(false)
        if (res.ok) {
          setSubmitted(true)
          setError(null)
        } else {
          setError(res.reason ?? res.error ?? "Solve rejected")
        }
      })
    },
    [canSubmit, colorCount, completed, submitting]
  )

  const commitPath = useCallback(
    (drag: DragState) => {
      const nextPaths = applyPath(drag.basePaths, drag.path, drag.color, endpoints)
      const nextGrid = buildGridFromPaths(nextPaths, endpoints, size)
      setCommittedPaths(nextPaths)
      setPreviewPaths(nextPaths)
      setError(null)

      if (isFilled(nextGrid)) {
        submitSolve(nextPaths)
      }
    },
    [endpoints, size, submitSolve]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (completed || submitting) return
      const coord = getCanvasCoord(event, size)
      if (!coord) return
      const color = committedGrid[coord.row]?.[coord.col] ?? 0
      if (color === 0) return

      event.currentTarget.setPointerCapture(event.pointerId)
      const resumePath = buildResumePath(committedPaths, coord, color, endpoints)
      const drag: DragState = {
        color,
        basePaths: clonePaths(committedPaths),
        path: resumePath,
      }
      setDragState(drag)
      setPreviewPaths(applyPath(drag.basePaths, drag.path, drag.color, endpoints))
      setError(null)
    },
    [committedGrid, committedPaths, completed, endpoints, size, submitting]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragState || completed || submitting) return
      const coord = getCanvasCoord(event, size)
      if (!coord) return

      const last = dragState.path[dragState.path.length - 1]!
      if (sameCoord(coord, last)) return
      if (!areAdjacent(coord, last)) return
      if (isEndpointOfOtherColor(coord, dragState.color, endpoints)) return

      const existingIndex = dragState.path.findIndex((cell) => sameCoord(cell, coord))
      if (existingIndex < 0 && pathHasBothEndpoints(dragState.path, dragState.color, endpoints)) {
        return
      }
      const path =
        existingIndex >= 0
          ? dragState.path.slice(0, existingIndex + 1)
          : [...dragState.path, coord]
      const nextDrag = { ...dragState, path }
      setDragState(nextDrag)
      setPreviewPaths(applyPath(nextDrag.basePaths, path, dragState.color, endpoints))
    },
    [completed, dragState, endpoints, size, submitting]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragState) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      commitPath(dragState)
      setDragState(null)
    },
    [commitPath, dragState]
  )

  const resetBoard = useCallback(() => {
    if (completed || submitting) return
    setCommittedPaths(initialPaths)
    setPreviewPaths(initialPaths)
    setDragState(null)
    setError(null)
    submittedPathsRef.current = null
  }, [completed, initialPaths, submitting])

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
                className="block size-full touch-none bg-slate-950 shadow-inner"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                aria-label="Flow Connect puzzle"
              />
              <FlowFillBorder progress={fillProgress} verified={completed} />
            </div>

            <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">
              Connect each pair of matching dots with a path, and fill every
              square on the board.
            </p>

            <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">
              Drag from a dot or path to extend it. Crossing another path cuts
              that connection, and backing up during the same drag restores what
              was underneath.
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

function createInitialPaths(endpoints: FlowEndpoint[]): FlowPathMap {
  const paths: FlowPathMap = {}
  for (const endpoint of endpoints) {
    paths[endpoint.color] = []
  }
  return paths
}

function FlowFillBorder({ progress, verified }: { progress: number; verified: boolean }) {
  const pathLength = 150
  const dashOffset = pathLength * (1 - clamp(progress, 0, 1))
  const stroke = verified ? "rgba(74,222,128,0.98)" : "rgba(255,255,255,0.95)"

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M 50 0 H 100 V 100 H 50"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={pathLength}
        strokeDasharray={pathLength}
        strokeDashoffset={dashOffset}
        className="transition-[stroke-dashoffset,stroke] duration-200 ease-out"
      />
      <path
        d="M 50 0 H 0 V 100 H 50"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={pathLength}
        strokeDasharray={pathLength}
        strokeDashoffset={dashOffset}
        className="transition-[stroke-dashoffset,stroke] duration-200 ease-out"
      />
    </svg>
  )
}

function applyPath(
  basePaths: FlowPathMap,
  path: FlowCoordinate[],
  color: number,
  endpoints: FlowEndpoint[]
): FlowPathMap {
  const nextPaths = clonePaths(basePaths)
  const pathKeys = new Set(path.map(coordKey))

  for (const [rawColor, existingPath] of Object.entries(basePaths)) {
    const existingColor = Number(rawColor)
    if (existingColor === color) continue
    if (!existingPath.some((coord) => pathKeys.has(coordKey(coord)))) continue
    nextPaths[existingColor] = cutPath(existingPath, pathKeys, existingColor, endpoints)
  }

  nextPaths[color] = [...path]
  return nextPaths
}

function buildResumePath(
  paths: FlowPathMap,
  coord: FlowCoordinate,
  color: number,
  endpoints: FlowEndpoint[]
): FlowCoordinate[] {
  if (isEndpointOfColor(coord, color, endpoints)) return [coord]

  const currentPath = paths[color] ?? []
  const index = currentPath.findIndex((cell) => sameCoord(cell, coord))
  if (index < 0) return [coord]

  const endpoint = endpoints.find((entry) => entry.color === color)
  if (!endpoint) return currentPath.slice(0, index + 1)

  const startsAtEndpoint =
    currentPath.length > 0 &&
    (sameCoord(currentPath[0]!, endpoint.start) || sameCoord(currentPath[0]!, endpoint.end))
  const endsAtEndpoint =
    currentPath.length > 0 &&
    (sameCoord(currentPath[currentPath.length - 1]!, endpoint.start) ||
      sameCoord(currentPath[currentPath.length - 1]!, endpoint.end))

  if (endsAtEndpoint && (!startsAtEndpoint || currentPath.length - 1 - index < index)) {
    return currentPath.slice(index).reverse()
  }

  return currentPath.slice(0, index + 1)
}

function buildGridFromPaths(
  paths: FlowPathMap,
  endpoints: FlowEndpoint[],
  size: number
): number[][] {
  const grid = Array.from({ length: size }, () => Array<number>(size).fill(0))

  for (const endpoint of endpoints) {
    grid[endpoint.start.row]![endpoint.start.col] = endpoint.color
    grid[endpoint.end.row]![endpoint.end.col] = endpoint.color
  }

  for (const [rawColor, path] of Object.entries(paths)) {
    const color = Number(rawColor)
    for (const coord of path) {
      if (isEndpointOfOtherColor(coord, color, endpoints)) continue
      grid[coord.row]![coord.col] = color
    }
  }

  return grid
}

function cutPath(
  path: FlowCoordinate[],
  cutCells: Set<string>,
  color: number,
  endpoints: FlowEndpoint[]
): FlowCoordinate[] {
  const endpoint = endpoints.find((entry) => entry.color === color)
  if (!endpoint) return []

  const segments: FlowCoordinate[][] = []
  let current: FlowCoordinate[] = []
  for (const coord of path) {
    if (cutCells.has(coordKey(coord))) {
      if (current.length > 0) segments.push(current)
      current = []
    } else {
      current.push(coord)
    }
  }
  if (current.length > 0) segments.push(current)

  const endpointSegments = segments
    .map((segment) => ({
      segment,
      endpointCount: segment.filter(
        (coord) => sameCoord(coord, endpoint.start) || sameCoord(coord, endpoint.end)
      ).length,
    }))
    .filter((entry) => entry.endpointCount > 0)

  if (endpointSegments.length === 0) {
    return []
  }

  const survivor = endpointSegments
    .slice()
    .sort((a, b) => b.segment.length - a.segment.length)[0]!
    .segment
  return normalizePathFromEndpoint(survivor, endpoint)
}

function normalizePathFromEndpoint(path: FlowCoordinate[], endpoint: FlowEndpoint): FlowCoordinate[] {
  if (path.length === 0) return path
  const first = path[0]!
  const last = path[path.length - 1]!
  const firstIsEndpoint = sameCoord(first, endpoint.start) || sameCoord(first, endpoint.end)
  const lastIsEndpoint = sameCoord(last, endpoint.start) || sameCoord(last, endpoint.end)
  if (!firstIsEndpoint && lastIsEndpoint) {
    return [...path].reverse()
  }
  return path
}

function serializePaths(paths: FlowPathMap, colorCount: number): FlowSubmittedPath[] {
  return Array.from({ length: colorCount }, (_, index) => {
    const color = index + 1
    return {
      color,
      cells: (paths[color] ?? []).map((coord) => ({ ...coord })),
    }
  })
}

function drawFlowBoard(
  canvas: HTMLCanvasElement | null,
  grid: number[][],
  paths: FlowPathMap,
  endpoints: FlowEndpoint[],
  colorCount: number
): void {
  if (!canvas || grid.length === 0) return

  const rect = canvas.getBoundingClientRect()
  const cssSize = rect.width
  if (cssSize <= 0) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(cssSize * dpr)
  canvas.height = Math.floor(cssSize * dpr)

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssSize, cssSize)

  const size = grid.length
  const cell = cssSize / size
  const strokeWidth = cell * 0.36

  ctx.fillStyle = "#020617"
  ctx.fillRect(0, 0, cssSize, cssSize)

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)"
  ctx.lineWidth = 1
  for (let i = 1; i < size; i++) {
    const pos = i * cell
    ctx.beginPath()
    ctx.moveTo(pos, 0)
    ctx.lineTo(pos, cssSize)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, pos)
    ctx.lineTo(cssSize, pos)
    ctx.stroke()
  }

  for (let color = 1; color <= colorCount; color++) {
    const path = paths[color] ?? []
    ctx.strokeStyle = getFlowColor(color)
    ctx.fillStyle = getFlowColor(color)
    ctx.lineWidth = strokeWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    for (let i = 1; i < path.length; i++) {
      const previous = path[i - 1]!
      const current = path[i]!
      if (!areAdjacent(previous, current)) continue
      const from = getCellCenter(previous.row, previous.col, cell)
      const to = getCellCenter(current.row, current.col, cell)
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
  }

  for (const endpoint of endpoints) {
    for (const coord of [endpoint.start, endpoint.end]) {
      const center = getCellCenter(coord.row, coord.col, cell)
      ctx.beginPath()
      ctx.fillStyle = getFlowColor(endpoint.color)
      ctx.arc(center.x, center.y, cell * 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = Math.max(2, cell * 0.04)
      ctx.strokeStyle = "rgba(248, 250, 252, 0.9)"
      ctx.stroke()
    }
  }
}

function getCanvasCoord(
  event: React.PointerEvent<HTMLCanvasElement>,
  size: number
): FlowCoordinate | null {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  return {
    row: Math.min(size - 1, Math.floor((y / rect.height) * size)),
    col: Math.min(size - 1, Math.floor((x / rect.width) * size)),
  }
}

function getCellCenter(row: number, col: number, cell: number): { x: number; y: number } {
  return {
    x: col * cell + cell / 2,
    y: row * cell + cell / 2,
  }
}

function getFlowColor(color: number): string {
  return FLOW_COLORS[(color - 1) % FLOW_COLORS.length]!
}

function isEndpointOfColor(coord: FlowCoordinate, color: number, endpoints: FlowEndpoint[]): boolean {
  return endpoints.some(
    (endpoint) =>
      endpoint.color === color &&
      (sameCoord(coord, endpoint.start) || sameCoord(coord, endpoint.end))
  )
}

function isEndpointOfOtherColor(coord: FlowCoordinate, color: number, endpoints: FlowEndpoint[]): boolean {
  return endpoints.some(
    (endpoint) =>
      endpoint.color !== color &&
      (sameCoord(coord, endpoint.start) || sameCoord(coord, endpoint.end))
  )
}

function pathHasBothEndpoints(path: FlowCoordinate[], color: number, endpoints: FlowEndpoint[]): boolean {
  const endpoint = endpoints.find((entry) => entry.color === color)
  if (!endpoint) return false
  return path.some((coord) => sameCoord(coord, endpoint.start)) &&
    path.some((coord) => sameCoord(coord, endpoint.end))
}

function areAdjacent(a: FlowCoordinate, b: FlowCoordinate): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1
}

function sameCoord(a: FlowCoordinate, b: FlowCoordinate): boolean {
  return a.row === b.row && a.col === b.col
}

function coordKey(coord: FlowCoordinate): string {
  return `${coord.row},${coord.col}`
}

function clonePaths(paths: FlowPathMap): FlowPathMap {
  return Object.fromEntries(
    Object.entries(paths).map(([color, path]) => [
      color,
      path.map((coord) => ({ ...coord })),
    ])
  )
}

function isFilled(grid: number[][]): boolean {
  return grid.every((row) => row.every((cell) => cell > 0))
}

function getFillProgress(grid: number[][], endpoints: FlowEndpoint[]): number {
  const filledCells = grid.reduce(
    (total, row) => total + row.filter((cell) => cell > 0).length,
    0
  )
  const endpointCells = endpoints.length * 2
  const fillableCells = grid.length * grid.length - endpointCells
  if (fillableCells <= 0) return 1
  return clamp((filledCells - endpointCells) / fillableCells, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatSolvedCount(count: number): string {
  return count === 1
    ? "1 player has solved the puzzle"
    : `${count} players have solved the puzzle`
}

export default FlowConnectActive
