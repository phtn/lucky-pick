// A draw is held in Manila, so it is read in Manila's time wherever the reader
// is: "9:00 PM" must mean the hour the balls drop, not a local one.
const drawFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Manila'
})
const drawDayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Manila'
})

/**
 * A ticket's draw from its stored `drawDate` (`YYYY-MM-DD`) and `drawTime`
 * (`HH:mm`), both Manila wall-clock. An em dash for a ticket bought before
 * draws were recorded on tickets.
 */
export const formatDraw = (drawDate: string | null, drawTime: string | null) => {
  if (drawDate === null) return '—'
  // Noon stands in for a missing time so the date cannot slip a day.
  const at = new Date(`${drawDate}T${drawTime ?? '12:00'}:00+08:00`)
  if (Number.isNaN(at.getTime())) return drawDate
  return (drawTime === null ? drawDayFormatter : drawFormatter).format(at)
}
