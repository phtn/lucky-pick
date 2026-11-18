import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// 22:00 Asia/Manila (UTC+8, no DST) = 14:00 UTC — an hour after the 9PM draws.
crons.cron('pcso nightly results', '0 14 * * *', internal.pcsoSync.fetchLatest, {})

export default crons
