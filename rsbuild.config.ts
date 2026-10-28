import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rsbuild/core'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { beastOctane } from 'beast-tsrx/rsbuild'
import { beastDevtools } from '@beastjs/devtools/rsbuild'

export default defineConfig({
  source: { entry: { index: './src/main.ts' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  html: { template: './index.html' },
  server: {
    proxy: {
      // Asgard's API lives in the Worker, which this dev server is not. Without
      // this, `/api/asgard/*` falls through to the SPA fallback and the console
      // reads a page where it expects a session. Run `bun run dev:api`
      // alongside `bun run dev` to have something on the other end.
      '/api/asgard': {
        target: 'http://127.0.0.1:8787',
        // The Worker decides whether a request is Asgard's by its Host header,
        // so the original host has to survive the hop.
        changeOrigin: false
      }
    }
  },
  plugins: [
    pluginTailwindcss(),
    beastOctane({ octane: { profile: process.env.NODE_ENV !== 'production' } }),
    beastDevtools()
  ]
})
