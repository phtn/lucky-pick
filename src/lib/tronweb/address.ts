import { isAddress } from 'tronweb/utils'

/**
 * Full base58check validation: the 34-character base58 shape *and* the trailing
 * double-SHA256 checksum. Pure — no node host and no API key — so this is the one
 * part of the TRON surface safe to import from browser code.
 *
 * Imported from `tronweb/utils`, not the package root: the root entry pulls in
 * the protocol buffers and axios, which an address check has no use for. (Under
 * Bun the root entry does not even load — its generated protobuf files throw
 * `proto is not defined`.)
 *
 * Convex cannot reach this module (`convex/` typechecks as its own project and
 * runs in its own runtime), so `isTronAddressShape` in `convex/utils.ts` repeats
 * the shape half of the check on the write path. A value has to clear both.
 */
export const isTronAddress = (address: string): boolean => isAddress(address)
