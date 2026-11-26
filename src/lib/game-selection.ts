import { createContext, useContext } from 'octane'
import type { GameResults } from '@/hooks/use-recent-game-results'
import type { GameSettingsMap } from './game-settings'
import type { GameId } from './games'

interface GameSelection {
  gameId: GameId
  getGameId: () => GameId
  selectGame: (game: GameId) => void
  gameSettings: GameSettingsMap
  sellableGames: GameId[]
  recentResults: GameResults
  jackpots: Partial<Record<GameId, number>>
}

export const GameSelectionContext = createContext<GameSelection | null>(null)

export function useGameSelection(): GameSelection {
  const selection = useContext(GameSelectionContext)
  if (!selection) throw new Error('Game selection requires the app layout.')
  return selection
}
