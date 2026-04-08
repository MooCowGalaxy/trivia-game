import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Leaderboard } from "@/components/Leaderboard"
import { useGameState } from "@/hooks/useGameState"
import { BarChart3 } from "lucide-react"

export function LeaderboardModal() {
  const { gameState, leaderboard } = useGameState()
  const [open, setOpen] = useState(false)

  if (!gameState) return null
  const entries = leaderboard.map((e) => {
    const player = gameState.players.find((p) => p.id === e.playerId)
    return {
      id: e.playerId,
      name: e.username,
      score: e.score,
      avatar: player?.avatarUrl ?? "",
      connected: player?.connected,
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 left-4 z-40 backdrop-blur-xl bg-card/80 shadow-lg"
        >
          <BarChart3 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leaderboard</DialogTitle>
        </DialogHeader>
        <Leaderboard entries={entries} />
      </DialogContent>
    </Dialog>
  )
}
