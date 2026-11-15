import { YouTubeClient } from './client'

let youtube: YouTubeClient | null = null

const createYouTubeClient = () => {
  if (!youtube) {
    youtube = new YouTubeClient({
      apiKey: process.env.YOUTUBE_API_KEY!,
      timeout: 15000
    })
  }
  return youtube
}
