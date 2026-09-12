import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate'. autoUpdate can swap the app shell out from
      // under you mid-session; in the middle of a set that is not acceptable.
      // We show a dismissible pill instead and reload when told to.
      registerType: 'prompt',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The Supabase REST API must never be served from cache: stale reads
        // would fight the outbox reconcile. Network only, no runtime caching.
        navigateFallbackDenylist: [/^\/auth\/callback/],
      },
      manifest: {
        name: 'gymlog',
        short_name: 'gymlog',
        description: 'Personal gym and diet tracker',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0f14',
        theme_color: '#0b0f14',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        // Lets us verify the service worker in `npm run dev` rather than
        // discovering registration problems only after a build.
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
