/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { god, member, staff } from './lib/testIdentities'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const lottoPage = { game: 'lotto' as const, paginationOpts: { numItems: 100, cursor: null } }

const row = (...cells: string[]) => `<tr>${cells.map(cell => `\n\t\t\t<td>${cell}</td>`).join('')}\n\t\t</tr>`
const page = (...rows: string[]) => `<html><body><form>
<table class="Grid search-lotto-result-table" cellspacing="0" rules="all" border="1" id="cphContainer_cpContent_GridView1">
  <tr><th scope="col">LOTTO GAME</th><th scope="col">COMBINATIONS</th><th scope="col">DRAW DATE</th><th scope="col">JACKPOT (PHP)</th><th scope="col">WINNERS</th></tr>
  ${rows.join('\n')}
</table></form></body></html>`

const html = page(
  row('Lotto 6/42', '16-28-35-29-31-36', '11/17/2099', '23,013,429.70', '0'),
  row('3D Lotto 9PM', '0-4-4', '11/18/2099', '4,500.00', '127'),
  row('Megalotto 6/45', '11-18-45-04-14-08', '11/18/2099', '26,266,796.56', '0'),
  // PCSO repeats rows on the default page; these are deduped.
  row('3D Lotto 9PM', '0-4-4', '11/18/2099', '4,500.00', '127'),
  // Rows the importer can't accept are skipped instead of blocking the batch.
  row('Pick 5 Lotto', '1-2-3-4-5', '11/18/2099', '1,000.00', '0'),
)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('nightly sync imports PCSO rows once, skipping bad and repeated rows', async () => {
  const fetchMock = vi.fn(async () => new Response(html, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const t = convexTest(schema, modules)

  expect(await t.action(internal.pcsoSync.fetchLatest, {})).toEqual({
    rows: 5, added: 3, skipped: 1, rejected: 1,
    byGame: expect.arrayContaining([{ game: 'lotto', added: 1 }, { game: '3d', added: 1 }, { game: 'mega', added: 1 }]),
  })
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
  expect((init.headers as Record<string, string>)['Sec-Fetch-Mode']).toBe('navigate')

  const [stored] = (await t.query(api.resultsImport.list, lottoPage)).page
  expect(stored).toMatchObject({ id: 'lotto:2099-11-17:daily', numbers: [16, 28, 35, 29, 31, 36], jackpotCents: 2_301_342_970 })
  const doc = await t.run(ctx => ctx.db.query('historicalResults').withIndex('by_drawId', q => q.eq('drawId', 'lotto:2099-11-17:daily')).unique())
  expect(doc?.importedBy).toBe('system:pcso')

  // A second night with the same page adds nothing.
  expect(await t.action(internal.pcsoSync.fetchLatest, {})).toMatchObject({ added: 0, skipped: 4 })
})

test('nightly sync fails loudly when PCSO blocks the request or changes layout', async () => {
  const t = convexTest(schema, modules)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Access Denied', { status: 403, statusText: 'Forbidden' })))
  await expect(t.action(internal.pcsoSync.fetchLatest, {})).rejects.toThrow('PCSO responded 403')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>maintenance</html>', { status: 200 })))
  await expect(t.action(internal.pcsoSync.fetchLatest, {})).rejects.toThrow('table not found')
})

test('staff can run the sync on demand; everyone else is refused before PCSO is fetched', async () => {
  const fetchMock = vi.fn(async () => new Response(html, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const t = convexTest(schema, modules)

  for (const who of [member('player', 'player@example.com'), { subject: 'outsider', issuer: 'https://other.example' }]) {
    await expect(t.withIdentity(who).action(api.pcsoSync.syncNow, {})).rejects.toThrow('Unauthorized.')
  }
  await expect(t.action(api.pcsoSync.syncNow, {})).rejects.toThrow('Unauthorized.')
  expect(fetchMock).not.toHaveBeenCalled()

  expect(await t.withIdentity(god).action(api.pcsoSync.syncNow, {})).toMatchObject({ added: 3, rejected: 1 })
  expect(await t.withIdentity(staff).action(api.pcsoSync.syncNow, {})).toMatchObject({ added: 0, skipped: 4 })
  const doc = await t.run(ctx => ctx.db.query('historicalResults').withIndex('by_drawId', q => q.eq('drawId', 'lotto:2099-11-17:daily')).unique())
  expect(doc?.importedBy).toBe('system:pcso-manual')

  // A PCSO failure reaches the operator with its own message.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Access Denied', { status: 403, statusText: 'Forbidden' })))
  await expect(t.withIdentity(god).action(api.pcsoSync.syncNow, {})).rejects.toThrow('PCSO responded 403')
})

test('with PCSO_PROXY_URL set, the page is fetched through the scraping proxy', async () => {
  vi.stubEnv('PCSO_PROXY_URL', 'https://proxy.example/?api_key=secret&country_code=ph&url={url}')
  const fetchMock = vi.fn(async () => new Response(html, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const t = convexTest(schema, modules)

  expect(await t.action(internal.pcsoSync.fetchLatest, {})).toMatchObject({ added: 3 })
  expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
    'https://proxy.example/?api_key=secret&country_code=ph&url=https%3A%2F%2Fwww.pcso.gov.ph%2FSearchLottoResult.aspx'
  )

  // A proxy failure names the proxy and never echoes its key-bearing URL.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429, statusText: 'Too Many Requests' })))
  const error = await t.action(internal.pcsoSync.fetchLatest, {}).catch((e: Error) => e)
  expect(String(error)).toContain('via the scraping proxy) responded 429')
  expect(String(error)).not.toContain('secret')

  vi.stubEnv('PCSO_PROXY_URL', 'https://proxy.example/?api_key=secret')
  await expect(t.action(internal.pcsoSync.fetchLatest, {})).rejects.toThrow('{url} placeholder')
})

test('a direct 403 says to configure the scraping proxy', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Access Denied', { status: 403, statusText: 'Forbidden' })))
  const t = convexTest(schema, modules)
  await expect(t.action(internal.pcsoSync.fetchLatest, {})).rejects.toThrow('set PCSO_PROXY_URL')
})
