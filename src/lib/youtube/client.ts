import {
  YouTubeChannel,
  YouTubeChannelListParams,
  YouTubeClientOptions,
  YouTubeListResponse,
  YouTubePlaylist,
  YouTubePlaylistItem,
  YouTubePlaylistItemListParams,
  YouTubePlaylistListParams,
  YouTubeRequestOptions,
  YouTubeSearchParams,
  YouTubeSearchResult,
  YouTubeVideo,
  YouTubeVideoListParams
} from './types'

import { YouTubeAbortError, YouTubeError, YouTubeNetworkError, YouTubeTimeoutError } from './errors'

const DEFAULT_BASE_URL = 'https://www.googleapis.com/youtube/v3'

const DEFAULT_TIMEOUT = 15_000

type QueryValue = string | number | boolean | undefined | null | string[]

export class YouTubeClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeout: number
  private readonly fetcher: typeof globalThis.fetch

  constructor(options: YouTubeClientOptions) {
    if (!options.apiKey?.trim()) {
      throw new Error('A YouTube API key is required.')
    }

    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

    this.timeout = options.timeout ?? DEFAULT_TIMEOUT
    this.fetcher = options.fetch ?? globalThis.fetch

    if (!this.fetcher) {
      throw new Error('Fetch API is not available.')
    }

    if (this.timeout < 0) {
      throw new Error('Timeout cannot be negative.')
    }
  }

  /**
   * Internal request handler.
   */
  private async request<T>(
    endpoint: string,
    params: Record<string, QueryValue> = {},
    options: YouTubeRequestOptions = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`)

    url.searchParams.set('key', this.apiKey)

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue
      }

      if (Array.isArray(value)) {
        if (value.length) {
          url.searchParams.set(key, value.join(','))
        }
        continue
      }

      url.searchParams.set(key, String(value))
    }

    const controller = new AbortController()
    const externalSignal = options.signal

    let timedOut = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const abortFromExternal = () => controller.abort()

    if (externalSignal?.aborted) {
      throw new YouTubeAbortError()
    }

    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

    if (this.timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, this.timeout)
    }

    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const apiError = data?.error

        throw new YouTubeError(
          apiError?.message ?? `YouTube API request failed (${response.status}).`,
          response.status,
          apiError?.errors?.[0]?.reason,
          apiError?.errors
        )
      }

      return data as T
    } catch (error) {
      if (error instanceof YouTubeError) {
        throw error
      }

      if (timedOut) {
        throw new YouTubeTimeoutError(this.timeout)
      }

      if (externalSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new YouTubeAbortError()
      }

      throw new YouTubeNetworkError('Unable to communicate with the YouTube API.', { cause: error })
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }

      externalSignal?.removeEventListener('abort', abortFromExternal)
    }
  }

  /**
   * Search videos, channels, or playlists.
   *
   * API: search.list
   */
  async search(
    params: YouTubeSearchParams,
    options?: YouTubeRequestOptions
  ): Promise<YouTubeListResponse<YouTubeSearchResult>> {
    if (!params.q?.trim()) {
      throw new Error('Search query cannot be empty.')
    }

    return this.request(
      'search',
      {
        part: 'snippet',
        ...params,
        type: params.type
      },
      options
    )
  }

  /**
   * Search videos only.
   */
  async searchVideos(params: Omit<YouTubeSearchParams, 'type'>, options?: YouTubeRequestOptions) {
    return this.search({ ...params, type: 'video' }, options)
  }

  /**
   * Search channels only.
   */
  async searchChannels(params: Omit<YouTubeSearchParams, 'type'>, options?: YouTubeRequestOptions) {
    return this.search({ ...params, type: 'channel' }, options)
  }

  /**
   * Search playlists only.
   */
  async searchPlaylists(params: Omit<YouTubeSearchParams, 'type'>, options?: YouTubeRequestOptions) {
    return this.search({ ...params, type: 'playlist' }, options)
  }

  /**
   * Get videos by ID.
   *
   * API: videos.list
   */
  async getVideos(
    params: YouTubeVideoListParams,
    options?: YouTubeRequestOptions
  ): Promise<YouTubeListResponse<YouTubeVideo>> {
    return this.request(
      'videos',
      {
        part: 'snippet,contentDetails,statistics,status',
        ...params
      },
      options
    )
  }

  async getVideo(id: string, options?: YouTubeRequestOptions): Promise<YouTubeVideo | undefined> {
    const response = await this.getVideos({ id }, options)

    return response.items[0]
  }

  /**
   * Get channels by ID or username.
   *
   * API: channels.list
   */
  async getChannels(
    params: YouTubeChannelListParams,
    options?: YouTubeRequestOptions
  ): Promise<YouTubeListResponse<YouTubeChannel>> {
    return this.request(
      'channels',
      {
        part: 'snippet,contentDetails,statistics',
        ...params
      },
      options
    )
  }

  async getChannel(id: string, options?: YouTubeRequestOptions): Promise<YouTubeChannel | undefined> {
    const response = await this.getChannels({ id }, options)

    return response.items[0]
  }

  /**
   * Get playlists.
   *
   * API: playlists.list
   */
  async getPlaylists(
    params: YouTubePlaylistListParams,
    options?: YouTubeRequestOptions
  ): Promise<YouTubeListResponse<YouTubePlaylist>> {
    return this.request(
      'playlists',
      {
        part: 'snippet,contentDetails,status',
        ...params
      },
      options
    )
  }

  /**
   * Get playlist items.
   *
   * API: playlistItems.list
   */
  async getPlaylistItems(
    params: YouTubePlaylistItemListParams,
    options?: YouTubeRequestOptions
  ): Promise<YouTubeListResponse<YouTubePlaylistItem>> {
    return this.request(
      'playlistItems',
      {
        part: 'snippet,contentDetails',
        ...params
      },
      options
    )
  }

  /**
   * Get uploaded videos from a channel.
   *
   * Resolves the channel's uploads playlist, then fetches
   * its items.
   */
  async getChannelVideos(
    channelId: string,
    params: {
      maxResults?: number
      pageToken?: string
    } = {},
    options?: YouTubeRequestOptions
  ): Promise<YouTubeListResponse<YouTubePlaylistItem>> {
    const channel = await this.getChannel(channelId, options)

    const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads

    if (!uploadsPlaylistId) {
      throw new YouTubeError(`Could not find uploads playlist for channel ${channelId}.`)
    }

    return this.getPlaylistItems(
      {
        playlistId: uploadsPlaylistId,
        ...params
      },
      options
    )
  }
}
