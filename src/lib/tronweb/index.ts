/**
 * The secret-free half of the TRON surface, importable from anywhere. The
 * env-backed client lives in `./client` and is Worker-only — import it by that
 * path, explicitly, so a browser import of this barrel can never pull an API key
 * into the bundle.
 */
export { isTronAddress } from './address'
