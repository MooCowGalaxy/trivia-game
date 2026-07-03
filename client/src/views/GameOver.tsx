import { useContext, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Podium } from "@/components/Podium"
import { Leaderboard } from "@/components/Leaderboard"
import { GameContext } from "@/context/GameContext"
import { AuthContext } from "@/context/AuthContext"
import { socket } from "@/socket"
import { CheckCircle2, Clipboard, XCircle } from "lucide-react"

type VerifyResponse = {
  ok: boolean
  valid?: boolean
  username?: string
  rank?: number
  error?: string
}

export function GameOver() {
  const ctx = useContext(GameContext)
  const authCtx = useContext(AuthContext)
  const gameState = ctx?.gameState
  const user = authCtx?.user
  const [copied, setCopied] = useState(false)
  const [verifyUsername, setVerifyUsername] = useState("")
  const [verifyCode, setVerifyCode] = useState("")
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)

  if (!gameState) return null

  const leaderboard = ctx?.leaderboard ?? []
  const toEntry = (e: typeof leaderboard[number]) => {
    const player = gameState.players.find((p) => p.id === e.playerId)
    return {
      id: e.playerId,
      name: e.username,
      score: e.score,
      avatar: player?.avatarUrl ?? "",
      connected: player?.connected,
    }
  }

  const allEntries = leaderboard.map(toEntry)
  const topThree = allEntries.slice(0, 3)
  const winner = topThree[0]
  const winnerVerification = gameState.winnerVerification
  const isHost = !!user && gameState.hostDiscordId === user.discordId

  const copyCode = async () => {
    if (!winnerVerification) return
    try {
      await navigator.clipboard.writeText(winnerVerification.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const verifyWinnerCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (!verifyUsername.trim() || !verifyCode.trim() || verifyLoading) return

    setVerifyLoading(true)
    setVerifyResult(null)
    socket.emit(
      "host:verify_winner_code",
      {
        username: verifyUsername.trim(),
        code: verifyCode.trim().toLowerCase(),
      },
      (res: VerifyResponse) => {
        setVerifyLoading(false)
        setVerifyResult(res)
      }
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-2xl mx-auto space-y-8 animate-in fade-in duration-700">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
            Game Over
          </h1>
          {winner && (
            <p className="text-lg text-muted-foreground animate-in fade-in duration-1000">
              <Badge variant="default" className="text-base px-4 py-1">
                {winner.name} wins!
              </Badge>
            </p>
          )}
        </div>

        <div
          className="animate-in fade-in zoom-in-95 duration-700"
          style={{ animationDelay: "200ms", animationFillMode: "both" }}
        >
          <Podium players={topThree} />
        </div>

        {winnerVerification && (
          <Card
            className="border-primary/40 bg-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationDelay: "300ms", animationFillMode: "both" }}
          >
            <CardHeader>
              <CardTitle>Your Private Winner Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-primary/30 bg-background px-3 py-2 text-center text-2xl font-bold tracking-[0.25em] text-primary">
                  {winnerVerification.code}
                </code>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={copyCode}
                  title="Copy code"
                >
                  <Clipboard className="size-4" />
                  <span className="sr-only">Copy code</span>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Keep this private. To claim your win, send this code from the Discord account named {user?.username}.
              </p>
              {copied && (
                <p className="text-sm text-primary">Copied.</p>
              )}
            </CardContent>
          </Card>
        )}

        {isHost && (
          <Card
            className="animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationDelay: "350ms", animationFillMode: "both" }}
          >
            <CardHeader>
              <CardTitle>Verify Winner Code</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={verifyWinnerCode} className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
                  <Input
                    placeholder="Discord username"
                    value={verifyUsername}
                    onChange={(e) => setVerifyUsername(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <Input
                    placeholder="8-char code"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    maxLength={8}
                  />
                  <Button
                    type="submit"
                    disabled={!verifyUsername.trim() || !verifyCode.trim() || verifyLoading}
                  >
                    {verifyLoading ? "Checking..." : "Check"}
                  </Button>
                </div>
                {verifyResult && (
                  <div className="flex items-center gap-2 text-sm">
                    {verifyResult.ok && verifyResult.valid ? (
                      <>
                        <CheckCircle2 className="size-4 text-primary" />
                        <span>
                          Valid for {verifyResult.username} (rank #{verifyResult.rank}).
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="size-4 text-red-400" />
                        <span className="text-red-300">
                          {verifyResult.error ?? "No matching winner code."}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        <Card
          className="animate-in fade-in slide-in-from-bottom-4 duration-700"
          style={{ animationDelay: "400ms", animationFillMode: "both" }}
        >
          <CardHeader>
            <CardTitle>Final Standings</CardTitle>
          </CardHeader>
          <CardContent>
            <Leaderboard entries={allEntries} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default GameOver
