import { useEffect, useMemo, useState } from 'octane'
import { convexClient } from '@/lib/convex-client'
import { resolveGameSettings, type GameSettings, type GameSettingsMap } from '@/lib/game-settings'
import { api } from '../../convex/_generated/api'

/**
 * The game grid the house configured: which games are on sale, which bet types
 * each sells, what a ticket costs and the stakes a player may choose between.
 *
 * Subscribed directly rather than through `useConvexQuery`, which answers only
 * a signed-in viewer: the prices are what the board is drawn from, so a visitor
 * who has never signed in needs them too. `api.games.q.list` is open for the
 * same reason.
 *
 * A deployment whose `games` table has never been seeded answers with nothing
 * and every reader falls back to the static config in `src/lib/games.ts` — the
 * behaviour the app had before the table existed. A failed read keeps the last
 * answer rather than replacing real prices with defaults mid-session.
 */
export function useGameSettings(): GameSettingsMap {
  const [rows, setRows] = useState<GameSettings[] | undefined>(undefined)

  useEffect(() => {
    if (!convexClient) return undefined

    const unsubscribe = convexClient.onUpdate(
      api.games.q.list,
      {},
      (value) => {
        setRows(
          value.map((row) => ({
            gameId: row.gameId,
            enabled: row.enabled,
            order: row.order,
            betTypes: row.betTypes.map((bet) => ({
              betType: bet.betType,
              enabled: bet.enabled,
              ticketCost: bet.ticketCost,
              stakes: bet.stakes
            }))
          }))
        )
      },
      (error) => {
        // Non-fatal: the static config still describes every game, so the board
        // stays playable. Logged rather than thrown for the same reason
        // `useConvexQuery` does it — one failed read must not blank the app.
        console.error('Game settings query failed', error)
      }
    )

    return unsubscribe
  }, [])

  // Keyed on the rows themselves, so a game's settings object stays identical
  // between renders that changed nothing.
  return useMemo(() => resolveGameSettings(rows), [rows])
}
