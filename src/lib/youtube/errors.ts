export interface YouTubeApiErrorDetail {
  message?: string
  domain?: string
  reason?: string
  location?: string
  locationType?: string
}

export class YouTubeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: YouTubeApiErrorDetail[]
  ) {
    super(message)
    this.name = 'YouTubeError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class YouTubeNetworkError extends YouTubeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message)
    this.name = 'YouTubeNetworkError'
    if (options?.cause) {
      this.cause = options.cause
    }
  }
}

export class YouTubeTimeoutError extends YouTubeError {
  constructor(timeout: number) {
    super(`YouTube request timed out after ${timeout}ms.`)
    this.name = 'YouTubeTimeoutError'
  }
}

export class YouTubeAbortError extends YouTubeError {
  constructor() {
    super('YouTube request was aborted.')
    this.name = 'YouTubeAbortError'
  }
}
