import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGameState } from "@/hooks/useGameState"
import { HostControls } from "@/host/HostControls"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

export function HostOverlay() {
  const [collapsed, setCollapsed] = useState(false)
  const { gameState } = useGameState()

  const currentState = gameState?.currentState ?? "UNKNOWN"

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 max-w-sm">
      <Button
        size="sm"
        variant="outline"
        className="backdrop-blur-xl bg-card/80"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Badge variant="secondary" className="mr-2">
          {currentState}
        </Badge>
        Host
        {collapsed ? (
          <ChevronUp className="size-4 ml-1" />
        ) : (
          <ChevronDown className="size-4 ml-1" />
        )}
      </Button>

      <div
        className={cn(
          "w-80 rounded-xl border border-border backdrop-blur-xl bg-card/80 p-4 shadow-xl transition-all duration-300",
          collapsed
            ? "max-h-0 opacity-0 overflow-hidden p-0 border-0"
            : "max-h-[80vh] opacity-100 overflow-auto"
        )}
      >
        <HostControls />
      </div>
    </div>
  )
}
