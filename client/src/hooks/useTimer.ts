import { useEffect, useRef, useState } from "react"

interface UseTimerOptions {
  serverRemainingMs: number | null
  totalDurationMs?: number
}

interface UseTimerReturn {
  remainingMs: number
  remainingSeconds: number
  progress: number
}

export function useTimer({
  serverRemainingMs,
  totalDurationMs,
}: UseTimerOptions): UseTimerReturn {
  const [remainingMs, setRemainingMs] = useState(serverRemainingMs ?? 0)
  const totalRef = useRef(totalDurationMs ?? serverRemainingMs ?? 0)
  const lastSyncRef = useRef(Date.now())
  const lastServerValueRef = useRef(serverRemainingMs)

  // Update total when a new larger value comes in (start of a new question)
  useEffect(() => {
    if (totalDurationMs != null) {
      totalRef.current = totalDurationMs
    }
  }, [totalDurationMs])

  // Re-sync when server sends a new value
  useEffect(() => {
    if (serverRemainingMs == null) {
      setRemainingMs(0)
      return
    }

    // Detect if this is a new timer (value jumped up significantly)
    if (
      lastServerValueRef.current == null ||
      serverRemainingMs > (lastServerValueRef.current ?? 0) + 1000
    ) {
      totalRef.current = totalDurationMs ?? serverRemainingMs
    }

    lastServerValueRef.current = serverRemainingMs
    lastSyncRef.current = Date.now()
    setRemainingMs(serverRemainingMs)
  }, [serverRemainingMs, totalDurationMs])

  // Local tick every 100ms for smooth countdown
  useEffect(() => {
    if (serverRemainingMs == null || serverRemainingMs <= 0) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastSyncRef.current
      const current = Math.max(0, (lastServerValueRef.current ?? 0) - elapsed)
      setRemainingMs(current)

      if (current <= 0) {
        clearInterval(interval)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [serverRemainingMs])

  const total = totalRef.current || 1
  const progress = Math.max(0, Math.min(1, remainingMs / total))
  const remainingSeconds = Math.ceil(remainingMs / 1000)

  return { remainingMs, remainingSeconds, progress }
}
