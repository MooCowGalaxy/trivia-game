/**
 * Truncates a leaderboard for display when there are more than 20 entries.
 *
 * If the current player is in the top 10: shows top 10 + ellipsis.
 * If not: shows top 7 + ellipsis + one above player + player + one below + ellipsis (if more).
 *
 * Returns the full list unchanged when there are 20 or fewer entries.
 */

export type TruncatedItem<T> =
  | { type: "entry"; entry: T; rank: number }
  | { type: "ellipsis"; key: string }

export function truncateLeaderboard<T extends { id: string }>(
  entries: T[],
  currentUserId: string | null,
): TruncatedItem<T>[] {
  // No truncation for 20 or fewer
  if (entries.length <= 20) {
    return entries.map((entry, i) => ({ type: "entry", entry, rank: i + 1 }))
  }

  const playerIndex = currentUserId
    ? entries.findIndex((e) => e.id === currentUserId)
    : -1

  // Player in top 10 (or not found): show top 10 + ellipsis
  if (playerIndex < 0 || playerIndex < 10) {
    const items: TruncatedItem<T>[] = entries
      .slice(0, 10)
      .map((entry, i) => ({ type: "entry", entry, rank: i + 1 }))
    items.push({ type: "ellipsis", key: "ellipsis-bottom" })
    return items
  }

  // Player outside top 10: top 7 + ellipsis + context around player + ellipsis
  const items: TruncatedItem<T>[] = entries
    .slice(0, 7)
    .map((entry, i) => ({ type: "entry", entry, rank: i + 1 }))

  items.push({ type: "ellipsis", key: "ellipsis-mid" })

  // One above, the player, one below
  const contextStart = Math.max(7, playerIndex - 1)
  const contextEnd = Math.min(entries.length - 1, playerIndex + 1)

  for (let i = contextStart; i <= contextEnd; i++) {
    items.push({ type: "entry", entry: entries[i]!, rank: i + 1 })
  }

  if (contextEnd < entries.length - 1) {
    items.push({ type: "ellipsis", key: "ellipsis-bottom" })
  }

  return items
}
