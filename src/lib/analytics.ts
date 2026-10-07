import { GAME_IDS, type GameId } from './games'
import type { GameMode, Player, Ticket } from './lotto'

export function summarizeSession(tickets: Ticket[], players: Player[], mode: GameMode) {
  const byGame = GAME_IDS.map(game => ({ game, total: 0, settled: 0, wins: 0, spent: 0, won: 0, pending: 0 }))
  const rows = new Map(byGame.map(row => [row.game, row]))
  const hits = Array.from({ length: 7 }, (_, hit) => ({ hit, count: 0 }))
  const add = (ticket: Ticket) => {
    const row = rows.get(ticket.game as GameId)!
    row.total++
    row.spent += ticket.cost
    if (ticket.status === 'pending') row.pending++
    else {
      row.settled++
      hits[ticket.hits].count++
      if (ticket.status === 'won') {
        row.wins++
        row.won += ticket.prizeWon ?? 0
      }
    }
  }
  if (mode === 'solo') tickets.forEach(add)
  else players.forEach(player => player.tickets.forEach(add))
  const totals = byGame.reduce((sum, row) => ({
    total: sum.total + row.total, settled: sum.settled + row.settled,
    wins: sum.wins + row.wins, spent: sum.spent + row.spent,
    won: sum.won + row.won, pending: sum.pending + row.pending,
  }), { total: 0, settled: 0, wins: 0, spent: 0, won: 0, pending: 0 })
  return { ...totals, net: totals.won - totals.spent,
    rate: totals.settled ? totals.wins / totals.settled * 100 : 0, byGame, hits }
}
