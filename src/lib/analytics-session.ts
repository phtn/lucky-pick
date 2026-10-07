import { createContext } from 'octane'
import type { Draw, GameMode, Player, Ticket } from './lotto'

export interface AnalyticsSession {
  tickets: Ticket[]
  players: Player[]
  draws: Draw[]
  mode: GameMode
}

// The root layout owns the live session across route changes. An Octane
// context also updates analytics when the session changes on the same route.
export const AnalyticsSessionContext = createContext<AnalyticsSession | null>(null)
