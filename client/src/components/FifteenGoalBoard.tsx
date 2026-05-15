import { useEffect, useRef, useState } from "react"
import { FifteenBoard } from "@/components/FifteenBoard"
import { cn } from "@/lib/utils"

const SOLVED_BOARD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]
const DEMO_MOVE_COUNT = 5

interface FifteenGoalBoardProps {
  className?: string
  animated?: boolean
}

export function FifteenGoalBoard({ className, animated = false }: FifteenGoalBoardProps) {
  const [board, setBoard] = useState(SOLVED_BOARD)
  const [visible, setVisible] = useState(true)
  const timeoutsRef = useRef<number[]>([])

  useEffect(() => {
    if (!animated) {
      setBoard(SOLVED_BOARD)
      setVisible(true)
      return
    }

    let cancelled = false

    const schedule = (callback: () => void, delayMs: number) => {
      const timeout = window.setTimeout(() => {
        if (!cancelled) callback()
      }, delayMs)
      timeoutsRef.current.push(timeout)
    }

    const runCycle = () => {
      const demo = createDemoBoard()
      setVisible(false)
      schedule(() => setBoard(demo.board), 250)
      schedule(() => setVisible(true), 450)

      let elapsed = 1_000
      for (const tile of demo.undoTiles) {
        schedule(() => {
          setBoard((current) => moveTileByValue(current, tile))
        }, elapsed)
        elapsed += 300
      }

      schedule(() => setVisible(false), elapsed + 2_400)
      schedule(runCycle, elapsed + 3_000)
    }

    runCycle()

    return () => {
      cancelled = true
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout))
      timeoutsRef.current = []
    }
  }, [animated])

  return (
    <FifteenBoard
      board={board}
      className={cn(
        "w-44 [--fifteen-gap:0.25rem] transition-opacity duration-300 sm:w-52",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      tileClassName="text-sm font-semibold sm:text-base"
      emptyClassName="border-slate-700/50"
      ariaLabel="Solved Fifteen board"
    />
  )
}

function createDemoBoard(): { board: number[]; undoTiles: number[] } {
  const board = [...SOLVED_BOARD]
  const movedTiles: number[] = []
  let previousEmptyIndex: number | null = null

  for (let i = 0; i < DEMO_MOVE_COUNT; i++) {
    const emptyIndex = board.indexOf(0)
    const legalMoves = getAdjacentIndexes(emptyIndex).filter(
      (index) => index !== previousEmptyIndex
    )
    const choices = legalMoves.length > 0 ? legalMoves : getAdjacentIndexes(emptyIndex)
    const moveIndex = choices[Math.floor(Math.random() * choices.length)]!
    const tile = board[moveIndex]!

    previousEmptyIndex = emptyIndex
    movedTiles.push(tile)
    swap(board, emptyIndex, moveIndex)
  }

  return {
    board,
    undoTiles: movedTiles.reverse(),
  }
}

function moveTileByValue(board: number[], tile: number): number[] {
  const next = [...board]
  const tileIndex = next.indexOf(tile)
  const emptyIndex = next.indexOf(0)
  if (!getAdjacentIndexes(emptyIndex).includes(tileIndex)) return next
  swap(next, emptyIndex, tileIndex)
  return next
}

function getAdjacentIndexes(index: number): number[] {
  const row = Math.floor(index / 4)
  const col = index % 4
  const adjacent: number[] = []

  if (row > 0) adjacent.push(index - 4)
  if (row < 3) adjacent.push(index + 4)
  if (col > 0) adjacent.push(index - 1)
  if (col < 3) adjacent.push(index + 1)

  return adjacent
}

function swap(board: number[], a: number, b: number): void {
  const tile = board[a]!
  board[a] = board[b]!
  board[b] = tile
}
