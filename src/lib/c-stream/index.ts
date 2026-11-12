/**
 * state-compression.ts
 *
 * A reusable browser-side state compression toolkit.
 *
 * Features:
 * - JSON compression / decompression
 * - Base64URL encoding
 * - URL state sharing
 * - Compressed localStorage
 * - Compressed sessionStorage
 * - Expiring storage
 * - Generic TypeScript support
 */

export type CompressionFormat = 'gzip' | 'deflate' | 'deflate-raw'

export interface CompressionOptions {
  format?: CompressionFormat
  maxDecompressedBytes?: number
}

const DEFAULT_FORMAT: CompressionFormat = 'gzip'
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024

const VERSION = 1

// --------------------------------------------------
// 1. Base64URL utilities
// --------------------------------------------------

export function encodeBase64URL(bytes: Uint8Array): string {
  let binary = ''

  const CHUNK_SIZE = 0x8000

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeBase64URL(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    throw new Error('Invalid Base64URL string.')
  }

  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')

  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)

  const binary = atob(padded)

  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

// --------------------------------------------------
// 2. Compression utilities
// --------------------------------------------------

async function transform(
  bytes: Uint8Array,
  format: CompressionFormat,
  mode: 'compress' | 'decompress'
): Promise<Uint8Array<ArrayBuffer>> {
  const Stream = mode === 'compress' ? CompressionStream : DecompressionStream

  const stream = new Blob([bytes as BlobPart]).stream()

  const transformed = stream.pipeThrough(new Stream(format))

  return new Uint8Array(await new Response(transformed).arrayBuffer())
}

// --------------------------------------------------
// 3. Pack JSON
// --------------------------------------------------

export async function pack<T>(value: T, options: CompressionOptions = {}): Promise<string> {
  const format = options.format ?? DEFAULT_FORMAT

  const json = JSON.stringify(value)

  if (json === undefined) {
    throw new Error('Value cannot be serialized to JSON.')
  }

  const bytes = new TextEncoder().encode(json)

  const compressed = await transform(bytes, format, 'compress')

  return encodeBase64URL(compressed)
}

// --------------------------------------------------
// 4. Unpack JSON
// --------------------------------------------------

export async function unpack<T>(payload: string, options: CompressionOptions = {}): Promise<T> {
  const format = options.format ?? DEFAULT_FORMAT

  const maxSize = options.maxDecompressedBytes ?? DEFAULT_MAX_SIZE

  const compressed = decodeBase64URL(payload)

  const decompressed = await transform(compressed, format, 'decompress')

  if (decompressed.byteLength > maxSize) {
    throw new Error('Decompressed payload exceeds size limit.')
  }

  const json = new TextDecoder('utf-8', {
    fatal: true
  }).decode(decompressed)

  return JSON.parse(json) as T
}

// --------------------------------------------------
// 5. URL state management
// --------------------------------------------------

export async function createShareURL<T>(value: T, parameter = 'state', baseURL = location.href): Promise<string> {
  const url = new URL(baseURL)

  url.searchParams.set(parameter, await pack(value))

  return url.href
}

export async function readShareURL<T>(
  parameter = 'state',
  options: CompressionOptions = {},
  source = location.href
): Promise<T | null> {
  const url = new URL(source)

  const payload = url.searchParams.get(parameter)

  if (!payload) return null

  return unpack<T>(payload, options)
}

export async function copyShareURL<T>(value: T, parameter = 'state'): Promise<string> {
  const url = await createShareURL(value, parameter)

  await navigator.clipboard.writeText(url)

  return url
}

export function removeShareURLParameter(parameter = 'state', source = location.href): string {
  const url = new URL(source)

  url.searchParams.delete(parameter)

  return url.href
}

// --------------------------------------------------
// 6. Compressed browser storage
// --------------------------------------------------

interface StorageEnvelope<T> {
  version: number
  value: T
  expiresAt?: number
}

export class CompressedStorage {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly prefix = 'app:',
    private readonly options: CompressionOptions = {}
  ) {}

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const envelope: StorageEnvelope<T> = {
      version: VERSION,
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined
    }

    const payload = await pack(envelope, this.options)

    this.storage.setItem(this.prefix + key, payload)
  }

  async get<T>(key: string): Promise<T | null> {
    const payload = this.storage.getItem(this.prefix + key)

    if (!payload) return null

    const envelope = await unpack<StorageEnvelope<T>>(payload, this.options)

    if (envelope.version !== VERSION) {
      this.remove(key)
      return null
    }

    if (envelope.expiresAt !== undefined && envelope.expiresAt <= Date.now()) {
      this.remove(key)
      return null
    }

    return envelope.value
  }

  remove(key: string): void {
    this.storage.removeItem(this.prefix + key)
  }

  clear(): void {
    const keys: string[] = []

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)

      if (key?.startsWith(this.prefix)) {
        keys.push(key)
      }
    }

    keys.forEach((key) => this.storage.removeItem(key))
  }

  has(key: string): boolean {
    return this.storage.getItem(this.prefix + key) !== null
  }

  keys(): string[] {
    const result: string[] = []

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)

      if (key?.startsWith(this.prefix)) {
        result.push(key.slice(this.prefix.length))
      }
    }

    return result
  }

  get size(): number {
    let total = 0

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)

      if (key?.startsWith(this.prefix)) {
        total += key.length

        total += this.storage.getItem(key)?.length ?? 0
      }
    }

    return total
  }
}

// --------------------------------------------------
// 7. Convenient storage instances
// --------------------------------------------------

export const localState = new CompressedStorage(localStorage, 'app:')

export const sessionState = new CompressedStorage(sessionStorage, 'session:')

// --------------------------------------------------
// 8. Shortened values
// --------------------------------------------------

export async function shorten<T>(value: T): Promise<string> {
  return pack(value)
}

export async function restore<T>(shortValue: string): Promise<T> {
  return unpack<T>(shortValue)
}

// --------------------------------------------------
// 9. Download compressed JSON
// --------------------------------------------------

export async function downloadCompressed<T>(value: T, filename = 'state.json.gz'): Promise<void> {
  const json = JSON.stringify(value, null, 2)

  if (json === undefined) {
    throw new Error('Value cannot be serialized.')
  }

  const bytes = new TextEncoder().encode(json)

  const compressed = await transform(bytes, 'gzip', 'compress')

  const blob = new Blob([compressed], {
    type: 'application/gzip'
  })

  const url = URL.createObjectURL(blob)

  try {
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
