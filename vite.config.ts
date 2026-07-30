import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // `email-reply-parser` optionally requires the native `re2` module and
      // falls back to RegExp on failure. In a browser bundle re2 can't be
      // resolved, and Rollup's runtime stub throws before the library's
      // try/catch catches it. Alias to an empty stub so the require resolves
      // and the RegExp fallback kicks in.
      re2: fileURLToPath(new URL('./src/stubs/re2-stub.js', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'OVIS - Commercial Real Estate Management',
        short_name: 'OVIS',
        description: 'Manage commercial real estate deals, properties, and contacts',
        theme_color: '#002147',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024, // 16 MB — Vercel's production bundle is ~9 MB and growing; bump gives headroom until we code-split
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Don't let the service worker fall back to index.html for cross-origin
        // requests (Google Maps, Supabase, etc.) — those must go to the network.
        navigateFallbackDenylist: [/^https?:\/\//i],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
          // NOTE: Do NOT add a runtimeCaching rule for maps.googleapis.com.
          // Google's Maps JS API bootstrap dynamically loads versioned
          // sub-resources; routing it through a service worker cache causes
          // "Google Maps JavaScript API could not load" + workbox no-response
          // errors. Let Maps requests always go network-only (browser default).
        ]
      }
    })
  ]
});
