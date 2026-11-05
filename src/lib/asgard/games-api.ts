/** The console's games API: the grid itself, and the writes against one cell. */
export const ASGARD_GAMES_ENDPOINT = '/api/asgard/games'

/** What a write to the games endpoint is asking for. */
export type AsgardGamesWrite =
  | { kind: 'seed' }
  | { kind: 'game'; gameId: string; enabled: boolean }
  | { kind: 'betType'; gameId: string; betType: number; enabled?: boolean; ticketCost?: number; stakes?: number[] }
