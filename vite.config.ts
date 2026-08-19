import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// A human-readable identity for this build, surfaced in Settings → App version.
// Without it there is no way to tell a refresh that worked from one that silently
// served the cached app again.
function buildId(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  try {
    return `${stamp} · ${execSync('git rev-parse --short HEAD').toString().trim()}`
  } catch {
    return stamp // not a git checkout — still better than nothing
  }
}

// Base path: '/' locally, '/<repo>/' on GitHub Pages (set VITE_BASE in the deploy workflow).
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a health log holds unsaved slider positions and
      // a half-written dictation, and a worker that reloads the page the moment a
      // new build lands would throw both away. src/lib/appUpdate.ts surfaces the
      // waiting version as a banner and a Settings button instead, and he presses it.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Health Tracker',
        short_name: 'Health',
        description: 'Personal health, gut, infection and nutrition tracker',
        theme_color: '#f4eedf',
        background_color: '#f4eedf',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff2: self-hosted Cormorant Garamond + Jost must precache for the
        // offline PWA guarantee, same as everything else here. jpg: the Home/
        // Insights brand imagery (src/assets) is JPEG, not PNG, for compression.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  optimizeDeps: {
    // Prebundle sql.js so its CJS default export is exposed correctly to the browser.
    include: ['sql.js'],
  },
})
