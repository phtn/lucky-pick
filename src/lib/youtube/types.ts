export type YouTubeQueryOrder = 'date' | 'rating' | 'relevance' | 'title' | 'videoCount' | 'viewCount'
export type YouTubeEventType = 'completed' | 'live' | 'upcoming'
export type YouTubeResourceType = 'video' | 'channel' | 'playlist'
export type YouTubeSafeSearch = 'moderate' | 'none' | 'strict'
export type YouTubeChannelType = 'any' | 'show'
export type YouTubeVideoCaption = 'any' | 'closedCaption' | 'none'
export type YouTubeVideoDefinition = 'any' | 'high' | 'standard'
export type YouTubeVideoDimension = '2d' | '3d' | 'any'
export type YouTubeVideoDuration = 'any' | 'long' | 'medium' | 'short'
export type YouTubeVideoEmbeddable = 'any' | 'true'
export type YouTubeVideoLicense = 'any' | 'creativeCommon' | 'youTube'
export type YouTubeVideoSyndicated = 'any' | 'true'
export type YouTubeVideoType = 'any' | 'episode' | 'movie'

export type YouTubeThumbnailType = 'default' | 'medium' | 'high' | 'standard' | 'maxres' | 'fhd'
export type YouTubeLiveBroadcastContent = 'live' | 'upcoming' | 'none'
export type YouTubePrivacyStatus = 'public' | 'private' | 'unlisted'

export interface YouTubeSearchParams {
  q: string
  type?: YouTubeResourceType | YouTubeResourceType[]
  maxResults?: number
  pageToken?: string
  order?: YouTubeQueryOrder
  regionCode?: string
  relevanceLanguage?: string
  safeSearch?: YouTubeSafeSearch
  publishedAfter?: string
  publishedBefore?: string
  channelId?: string
  channelType?: YouTubeChannelType
  eventType?: YouTubeEventType
  videoCaption?: YouTubeVideoCaption
  videoCategoryId?: string
  videoDefinition?: YouTubeVideoDefinition
  videoDimension?: YouTubeVideoDimension
  videoDuration?: YouTubeVideoDuration
  videoEmbeddable?: YouTubeVideoEmbeddable
  videoLicense?: YouTubeVideoLicense
  videoSyndicated?: YouTubeVideoSyndicated
  videoType?: YouTubeVideoType
}

export interface YouTubeStatistics {
  viewCount?: string
  likeCount?: string
  commentCount?: string
}

export interface YouTubeContentDetails {
  duration?: string
  dimension?: string
  definition?: string
  caption?: string
  licensedContent?: boolean
  projection?: string
}

export interface YouTubeStatus {
  uploadStatus?: string
  privacyStatus?: YouTubePrivacyStatus
  embeddable?: boolean
  publicStatsViewable?: boolean
}

export interface YouTubeVideo {
  kind: 'youTube#video'
  etag: string
  id: string
  snippet: YouTubeSnippet
  statistics?: YouTubeStatistics
  contentDetails?: YouTubeContentDetails
  status?: YouTubeStatus
}
export interface YouTubeChannel {
  kind: 'youTube#channel'
  etag: string
  id: string
  snippet: YouTubeSnippet
  statistics?: {
    viewCount?: string
    subscriberCount?: string
    hiddenSubscriberCount?: boolean
    videoCount?: string
  }
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string
      likes?: string
      favorites?: string
    }
  }
}

export interface YouTubePlaylist {
  kind: 'youTube#playlist'
  etag: string
  id: string
  snippet: YouTubeSnippet
  contentDetails?: {
    itemCount?: number
  }
  status?: YouTubeStatus
}

export interface YouTubePlaylistItem {
  kind: 'youTube#playlistItem'
  etag: string
  id: string
  snippet: YouTubeSnippet & {
    playlistId: string
    position: number
    resourceId: {
      kind: string
      videoId?: string
      channelId?: string
      playlistId?: string
    }
  }
  contentDetails?: {
    videoId?: string
    videoPublishedAt?: string
  }
}

export interface YouTubeClientOptions {
  apiKey: string
  baseUrl?: string
  timeout?: number
  fetch?: typeof globalThis.fetch
}

export interface YouTubeRequestOptions {
  signal?: AbortSignal
}

export interface YouTubeListParams {
  maxResults?: number
  pageToken?: string
}

export interface YouTubeVideoListParams extends YouTubeListParams {
  id?: string | string[]
  chart?: 'mostPopular'
  myRating?: 'dislike' | 'like'
  regionCode?: string
  videoCategoryId?: string
}

export interface YouTubeChannelListParams extends YouTubeListParams {
  id?: string | string[]
  forUsername?: string
  mine?: boolean
}

export interface YouTubePlaylistListParams extends YouTubeListParams {
  id?: string | string[]
  channelId?: string
}

export interface YouTubePlaylistItemListParams extends YouTubeListParams {
  playlistId: string
  videoId?: string
}
export type YouTubeThumbnailObject = {
  url: string
  width: number
  height: number
}
export type YouTubeThumbnails = Record<YouTubeThumbnailType, YouTubeThumbnailObject>
export type YouTubePageInfo = {
  totalResults: number
  resultsPerPage: number
}

export type YouTubeItemId = {
  kind: string
  videoId?: string
  channelId?: string
  playlistId?: string
}
export interface YouTubeLocalized {
  title: string
  description: string
}
export type YouTubeSnippet = {
  publishedAt: string
  channelId: string
  title: string
  description: string
  thumbnails: YouTubeThumbnails
  channelTitle: string
  liveBroadcastContent?: YouTubeLiveBroadcastContent
  tags?: string[]
  publishTime?: string
  categoryId?: string
  defaultLanguage?: string
  defaultAudioLanguage?: string
  localized?: YouTubeLocalized
}

export type YouTubeItem = {
  kind: string
  etag: string
  id: YouTubeItemId
  snippet: YouTubeSnippet
}

export interface YouTubeSearchResponse {
  kind: string
  etag: string
  regionCode: string
  pageInfo: YouTubePageInfo
  items: YouTubeItem[]
}
