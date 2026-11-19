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

/**
 * Akamai blocks PCSO for datacenter (and likely non-Philippine) networks, so
 * from Convex the page has to be fetched through a scraping API that sends it
 * from a residential connection. The proxy is a URL template with `{url}`
 * where the target goes, e.g.
 *
 *   https://api.scraperapi.com/?api_key=KEY&country_code=ph&url={url}
 *   https://api.zenrows.com/v1/?apikey=KEY&premium_proxy=true&proxy_country=ph&url={url}
 *   https://app.scrapingbee.com/api/v1/?api_key=KEY&premium_proxy=true&country_code=ph&url={url}
 *
 * Without one, PCSO is fetched directly (which works from a residential
 * network, e.g. a local script, but not from Convex).
 */
export function pcsoRequestUrl(proxyTemplate: string | undefined): { url: string; proxied: boolean } {
  const template = proxyTemplate?.trim()
  if (!template) return { url: PCSO_RESULTS_URL, proxied: false }
  if (!template.includes('{url}')) throw new Error('PCSO_PROXY_URL must contain a {url} placeholder for the PCSO address.')
  return { url: template.replace('{url}', encodeURIComponent(PCSO_RESULTS_URL)), proxied: true }
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
  const { issues, records } = parseRawResults(rows.join('\n'))
  const bad = new Set(issues.map(issue => issue.line))
  return {
    text: rows.filter((_, index) => !bad.has(index + 1)).join('\n'),
    /** Every draw the page lists, new or already stored. */
    draws: records.filter(item => !bad.has(item.line)).map(item => ({ game: item.game, date: item.record.date })),
    rows: rows.length,
    rejected: issues.map(issue => ({ row: rows[issue.line - 1] ?? '', message: issue.message })),
  }
}
