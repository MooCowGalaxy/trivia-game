import { Eye, LogIn } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { useGameState } from "@/hooks/useGameState"
import { Button } from "@/components/ui/button"

export function SpectatorBanner() {
  const { user, login, devMode } = useAuth()
  const { gameState } = useGameState()

  if (!user || !gameState) return null

  const isGuest = !!user.isGuest
  const isLobby = gameState.currentState === "LOBBY"
  const gameInProgress = !isLobby

  const handleLogin = () => {
    // Clear guest token so the auth flow starts fresh
    sessionStorage.removeItem("devToken")
    if (devMode) {
      // In dev mode, reload so they see the login form
      window.location.reload()
    } else {
      login()
    }
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 backdrop-blur-sm px-4 py-2.5 shadow-lg">
      <Eye className="size-4 text-amber-400 shrink-0" />
      <div className="text-sm">
        <span className="font-medium text-amber-300">Spectating</span>
        {isGuest && gameInProgress && (
          <span className="text-amber-400/70 ml-1">
            (game in progress, new players cannot join)
          </span>
        )}
        {!isGuest && gameInProgress && (
          <span className="text-amber-400/70 ml-1">
            - you joined after the game started
          </span>
        )}
      </div>
      {isGuest && isLobby && (
        <Button
          variant="outline"
          size="sm"
          className="ml-1 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
          onClick={handleLogin}
        >
          <LogIn className="size-3.5 mr-1.5" />
          Log in to play
        </Button>
      )}
    </div>
  )
}
