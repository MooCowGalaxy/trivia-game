import { useContext } from "react"
import { Badge } from "@/components/ui/badge"
import { FifteenGoalBoard } from "@/components/FifteenGoalBoard"
import { GameContext } from "@/context/GameContext"

const ROUND_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  exact_number: "Exact Number",
  fermi: "Fermi Estimation",
  text: "Text Answer",
  speed_math: "Speed Math",
  fifteen: "Fifteen",
  flow_connect: "Flow Connect",
  pipe_rotation: "Pipe Rotation",
  rush_hour: "Rush Hour",
  nurikabe: "Nurikabe",
  pattern: "Multiple Choice",
  image: "Image Round",
}

export function RoundIntro() {
  const ctx = useContext(GameContext)
  const round = ctx?.gameState?.currentRound

  if (!round) return null

  const typeLabel = round.typeLabel ?? ROUND_TYPE_LABELS[round.type] ?? round.type
  const isFifteen = round.type === "fifteen"
  const isFlowConnect = round.type === "flow_connect"
  const isPipeRotation = round.type === "pipe_rotation"
  const isRushHour = round.type === "rush_hour"
  const isNurikabe = round.type === "nurikabe"

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto text-center space-y-6 animate-in fade-in zoom-in-95 duration-700">
        <Badge variant="secondary" className="text-sm">
          {typeLabel}
        </Badge>

        <div className="space-y-2">
          <p className="text-lg text-muted-foreground font-medium uppercase tracking-widest animate-in fade-in slide-in-from-bottom-2 duration-500">
            Round {round.roundNumber}
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
            {round.title}
          </h1>
        </div>

        {round.description && (
          <p className="text-muted-foreground text-lg max-w-md mx-auto animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {round.description}
          </p>
        )}

        {isFifteen && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <FifteenGoalBoard animated />
            <div className="mx-auto max-w-lg space-y-2 text-muted-foreground">
              <p className="text-base">
                Arrange the tiles in reading order from 1 through 15, with the
                empty space in the bottom-right corner.
              </p>
              <p className="text-sm">
                Click or tap any tile directly above, below, left, or right of
                the empty space to slide that tile into the empty space.
              </p>
            </div>
          </div>
        )}

        {isFlowConnect && (
          <div className="mx-auto max-w-lg space-y-2 text-muted-foreground animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <p className="text-base">
              Connect each pair of matching dots with a path, and fill every
              square on the board.
            </p>
            <p className="text-sm">
              Drag from a dot to draw its path. Crossing another path will cut
              that path, and lifting your finger or mouse leaves the connection
              where it ends.
            </p>
          </div>
        )}

        {isPipeRotation && (
          <div className="mx-auto max-w-lg space-y-2 text-muted-foreground animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <p className="text-base">
              Rotate the pipe tiles until the source has a connected route to
              every marked terminal.
            </p>
            <p className="text-sm">
              Click or tap a tile to rotate it clockwise. The blue flow shows
              which pipes are currently reachable from the source.
            </p>
          </div>
        )}

        {isRushHour && (
          <div className="mx-auto max-w-lg space-y-2 text-muted-foreground animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <p className="text-base">
              Slide the red car to the exit on the right side of the board.
            </p>
            <p className="text-sm">
              Drag vehicles along their lane. Cars cannot turn, overlap, or
              move through other vehicles.
            </p>
          </div>
        )}

        {isNurikabe && (
          <div className="mx-auto max-w-lg space-y-2 text-muted-foreground animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <p className="text-base">
              Fill every square as either black or white while matching each
              numbered white area.
            </p>
            <p className="text-sm">
              Click a tile to cycle it between Black, White, and Blank. Clues
              and locked cells cannot be modified.
            </p>
          </div>
        )}

        <p
          className="text-sm text-muted-foreground animate-pulse opacity-0"
          style={{ animation: "fadeIn 700ms ease-out 1500ms forwards, pulse 2s cubic-bezier(0.4,0,0.6,1) 2200ms infinite" }}
        >
          Waiting for the host to start the round...
        </p>
      </div>
    </div>
  )
}

export default RoundIntro
