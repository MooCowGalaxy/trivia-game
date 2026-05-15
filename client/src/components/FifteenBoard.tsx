import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

interface FifteenBoardProps {
  board: number[]
  className?: string
  tileClassName?: string
  emptyClassName?: string
  completed?: boolean
  isInteractive?: boolean
  canMoveTile?: (index: number) => boolean
  onTileClick?: (index: number) => void
  ariaLabel?: string
}

export function FifteenBoard({
  board,
  className,
  tileClassName,
  emptyClassName,
  completed = false,
  isInteractive = false,
  canMoveTile,
  onTileClick,
  ariaLabel = "Fifteen board",
}: FifteenBoardProps) {
  const tiles = Array.from({ length: 16 }, (_, tile) => tile)

  return (
    <div
      className={cn(
        "relative mx-auto aspect-square rounded-lg bg-slate-950 shadow-inner [--fifteen-gap:0.5rem]",
        className
      )}
      aria-label={ariaLabel}
    >
      {tiles.map((tile) => {
        const index = board.indexOf(tile)
        if (index === -1) return null

        const movable = tile !== 0 && !!canMoveTile?.(index)
        const commonClassName = cn(
          "absolute flex items-center justify-center rounded-md border transition-[transform,background-color,border-color] duration-150 ease-out",
          tile === 0
            ? cn("border-transparent bg-transparent", emptyClassName)
            : cn(
                "border-slate-600/60 bg-slate-700 text-slate-100 shadow-sm",
                completed ? "bg-slate-600" : "",
                movable && isInteractive
                  ? "hover:bg-slate-600 hover:border-blue-300/40"
                  : "",
                tileClassName
              )
        )
        const style = getTileStyle(index)

        if (isInteractive && tile !== 0) {
          return (
            <button
              key={tile}
              type="button"
              onClick={() => onTileClick?.(index)}
              disabled={!movable}
              className={commonClassName}
              style={style}
              aria-label={`Tile ${tile}`}
            >
              {tile}
            </button>
          )
        }

        return (
          <div
            key={tile}
            className={commonClassName}
            style={style}
            aria-label={tile === 0 ? "Empty space" : `Tile ${tile}`}
          >
            {tile !== 0 && tile}
          </div>
        )
      })}
    </div>
  )
}

function getTileStyle(index: number): CSSProperties {
  const row = Math.floor(index / 4)
  const col = index % 4

  return {
    width: "calc((100% - var(--fifteen-gap) * 3) / 4)",
    height: "calc((100% - var(--fifteen-gap) * 3) / 4)",
    top: 0,
    left: 0,
    transform: `translate(calc(${col} * (100% + var(--fifteen-gap))), calc(${row} * (100% + var(--fifteen-gap))))`,
  }
}
