import { parseRawResults } from './results-import'

export const PCSO_RESULTS_URL = 'https://www.pcso.gov.ph/SearchLottoResult.aspx'

// PCSO sits behind Akamai, which rejects requests that don't look like a
// top-level Chrome navigation. The Sec-Fetch-* headers are the part it checks.
export const PCSO_BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

const ENTITIES: Record<string, string> = { amp: '&', nbsp: ' ', lt: '<', gt: '>', quot: '"', '#39': "'", '#8369': '₱' }

const cellText = (html: string) => html
  .replace(/<[^>]*>/g, '')
  .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
  .replace(/\s+/g, ' ')
  .trim()

/**
 * Pull the results grid (game, combination, date, jackpot, winners) out of the
 * SearchLottoResult page as raw tab-separated rows — the same shape an admin
 * pastes into the analytics importer.
 */
export function extractPcsoRows(html: string): string[] {
  const table = /<table[^>]*id="[^"]*GridView1"[^>]*>([\s\S]*?)<\/table>/i.exec(html)
  if (!table) throw new Error('PCSO results table not found; the page layout may have changed.')
  const rows: string[] = []
  for (const [, row] of table[1]!.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => cellText(cell!))
    if (cells.length === 5 && cells.every(Boolean)) rows.push(cells.join('\t'))
  }
  return rows
}

/**
 * Keep only rows the raw-results parser accepts, so one odd row (a new game,
 * a postponed draw with no numbers) doesn't block the whole nightly import.
 */
export function pcsoImportText(html: string) {
  const rows = extractPcsoRows(html)
  const { issues } = parseRawResults(rows.join('\n'))
  const bad = new Set(issues.map(issue => issue.line))
  return {
    text: rows.filter((_, index) => !bad.has(index + 1)).join('\n'),
    rows: rows.length,
    rejected: issues.map(issue => ({ row: rows[issue.line - 1] ?? '', message: issue.message })),
  }
}
