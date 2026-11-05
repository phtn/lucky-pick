const SURROUNDING_QUOTES = /^(['"])([\s\S]*)\1$/

/**
 * Read an environment value as the Worker actually receives it.
 *
 * `wrangler dev` parses `.dev.vars` as a dotenv file, so the quotes that made a
 * value one line are stripped before the Worker sees it. `wrangler secret put`
 * stores exactly the bytes it is handed, so that same value copied out of an
 * env line arrives in production as `"AIza…"`, quotes and all. Nothing
 * downstream recognises the difference — a quoted API key is simply invalid —
 * and the failure appears only on the deployed Worker, which is the hardest
 * place to read it. Strip the wrapper here so both paths agree.
 */
export function readEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()

  if (!trimmed) {
    return undefined
  }

  const unquoted = trimmed.replace(SURROUNDING_QUOTES, '$2').trim()

  return unquoted.length > 0 ? unquoted : undefined
}

/** `readEnvValue` for a `process.env` entry, which is where the Worker's secrets land. */
export function readEnvSecret(name: string): string | undefined {
  return readEnvValue(process.env[name])
}
