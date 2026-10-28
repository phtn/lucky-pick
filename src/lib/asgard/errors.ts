/**
 * An aborted in-flight request is the expected outcome of a remount, not
 * something to surface.
 */
export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

export const readErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.length > 0 ? error.message : fallback
