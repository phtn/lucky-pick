import { RNGManager, generateId, type SeedPair } from '@beastjs/use-rng/standalone'

/**
 * Every draw and every machine-picked bet comes out of one seeded generator.
 *
 * The manager holds a client seed, a server seed, and a nonce that steps once
 * per value taken. A number is a SHA-512 over `clientSeed|serverSeed|nonce`, so
 * a result is reproducible from its seed pair and never from the clock — the
 * same commitment scheme a provably-fair house publishes after a round.
 */
const manager = new RNGManager()

export type { SeedPair }

/** The seed pair a draw was taken from, recorded alongside its numbers. */
export interface DrawSeed {
  clientSeed: string
  serverSeed: string
  /** Nonce the first ball was drawn at; the six balls consume nonce..nonce+5. */
  nonce: number
  /** How many values the draw took, so a verifier knows where it ended. */
  rolls: number
}

/** The live seed pair, for display or for recording against a result. */
export function currentSeedPair(): SeedPair {
  return manager.getSeedPair()
}

/** Fresh client and server seeds, nonce back to zero. Starts a new "round". */
export function rotateSeeds(): SeedPair {
  manager.generateSeeds()
  return manager.getSeedPair()
}

/** Let a player set their own client seed, the usual provably-fair courtesy. */
export function setClientSeed(clientSeed: string): SeedPair {
  const { serverSeed } = manager.getSeedPair()
  manager.setSeeds(clientSeed || generateId(), serverSeed, 0)
  return manager.getSeedPair()
}

/** An unbiased integer in `[min, max]`, stepping the nonce once. */
export function randomInt(min: number, max: number): Promise<number> {
  return manager.rollInt(min, max)
}

/** A uniform index into an array of `length`. */
export async function randomIndex(length: number): Promise<number> {
  return manager.rollInt(0, length - 1)
}

/**
 * `count` distinct numbers from 1..pool, ascending.
 *
 * A partial Fisher-Yates: only the first `count` slots are settled, so a pick
 * costs `count` hashes rather than one per number in the pool, and a 2500-bet
 * batch stays inside a frame budget instead of stalling the tap.
 */
export async function randomPick(count: number, pool: number): Promise<number[]> {
  const bag = Array.from({ length: pool }, (_, i) => i + 1)
  const take = Math.min(count, pool)
  for (let i = 0; i < take; i++) {
    const j = await manager.rollInt(i, pool - 1)
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag.slice(0, take).sort((a, b) => a - b)
}

/**
 * `size` independent picks. The picks run concurrently — each one reserves its
 * nonces before awaiting, so the values stay distinct and reproducible in order
 * — which roughly halves the wait on a large bulk buy.
 */
export function randomPicks(size: number, count: number, pool: number): Promise<number[][]> {
  return Promise.all(Array.from({ length: size }, () => randomPick(count, pool)))
}

/**
 * Six balls in the order the drum spat them out, with the seed pair they came
 * from so the draw can be re-derived later.
 */
export async function drawBalls(pool: number): Promise<{ numbers: number[]; seed: DrawSeed }> {
  const { clientSeed, serverSeed, nonce } = manager.getSeedPair()
  const bag = Array.from({ length: pool }, (_, i) => i + 1)
  for (let i = 0; i < 6; i++) {
    const j = await manager.rollInt(i, pool - 1)
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return { numbers: bag.slice(0, 6), seed: { clientSeed, serverSeed, nonce, rolls: 6 } }
}

/** A pick split half even, half odd — the same generator, drawn from two bags. */
export async function evenOddPick(count: number, pool: number): Promise<number[]> {
  const evens = Array.from({ length: pool }, (_, i) => i + 1).filter((n) => n % 2 === 0)
  const odds = Array.from({ length: pool }, (_, i) => i + 1).filter((n) => n % 2 === 1)
  const pick: number[] = []
  const needEven = Math.floor(count / 2)
  for (let i = 0; i < needEven && evens.length; i++) {
    pick.push(evens.splice(await randomIndex(evens.length), 1)[0])
  }
  for (let i = pick.length; i < count && odds.length; i++) {
    pick.push(odds.splice(await randomIndex(odds.length), 1)[0])
  }
  return pick.sort((a, b) => a - b)
}

/** The rollover a no-winner draw adds: the base plus up to 20% on top. */
export async function randomRollover(rollover: number): Promise<number> {
  const spread = Math.floor(rollover * 0.2)
  return rollover + (spread > 0 ? await manager.rollInt(0, spread) : 0)
}
