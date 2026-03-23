import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Trophy, Medal, Award } from "lucide-react"

export interface PodiumEntry {
  id: string
  name: string
  score: number
  avatar: string
}

interface PodiumProps {
  players: PodiumEntry[]
}

const podiumConfig = [
  {
    place: 1,
    label: "1st",
    Icon: Trophy,
    color: "text-yellow-400",
    border: "border-yellow-400/50",
    gradient: "bg-gradient-to-t from-yellow-400/20 to-yellow-400/5",
    height: "h-40",
    iconSize: "size-8",
    order: "order-2",
  },
  {
    place: 2,
    label: "2nd",
    Icon: Medal,
    color: "text-gray-300",
    border: "border-gray-300/50",
    gradient: "bg-gradient-to-t from-gray-300/20 to-gray-300/5",
    height: "h-32",
    iconSize: "size-6",
    order: "order-1",
  },
  {
    place: 3,
    label: "3rd",
    Icon: Award,
    color: "text-amber-600",
    border: "border-amber-600/50",
    gradient: "bg-gradient-to-t from-amber-600/20 to-amber-600/5",
    height: "h-24",
    iconSize: "size-6",
    order: "order-3",
  },
]

export function Podium({ players }: PodiumProps) {
  return (
    <div className="flex items-end justify-center gap-4 pt-8 pb-4">
      {podiumConfig.map((config) => {
        const entry = players[config.place - 1]
        if (!entry) return null

        const { Icon } = config

        return (
          <div
            key={config.place}
            className={cn("flex flex-col items-center", config.order)}
          >
            <div className="flex flex-col items-center mb-3">
              <Icon className={cn(config.iconSize, config.color, "mb-2")} />
              <Avatar className="size-14">
                {entry.avatar && (
                  <AvatarImage src={entry.avatar} alt={entry.name} />
                )}
                <AvatarFallback>
                  {entry.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="mt-2 text-sm font-bold truncate max-w-[8rem]">
                {entry.name}
              </span>
              <span className={cn("text-xs font-mono font-bold", config.color)}>
                {entry.score.toLocaleString()}
              </span>
            </div>
            <Card
              className={cn(
                "w-24 sm:w-32 border-2 rounded-t-lg rounded-b-none",
                config.border,
                config.gradient,
                config.height
              )}
            >
              <CardContent className="flex items-center justify-center h-full">
                <span className={cn("text-3xl font-black", config.color)}>
                  {config.label}
                </span>
              </CardContent>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
