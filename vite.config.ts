import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base path: '/' locally, '/<repo>/' on GitHub Pages (set VITE_BASE in the deploy workflow).
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Health Tracker',
        short_name: 'Health',
        description: 'Personal health, gut, infection and nutrition tracker',
        theme_color: '#0e1b1a',
        background_color: '#0e1b1a',
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
        // offline PWA guarantee, same as everything else here.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  optimizeDeps: {
    // Prebundle sql.js so its CJS default export is exposed correctly to the browser.
    include: ['sql.js'],
  },
})
