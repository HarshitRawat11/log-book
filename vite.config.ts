import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Stamp the build so Settings can show which version is actually running.
 *
 * Worth the four lines: with registerType 'prompt', a phone keeps serving the
 * old bundle until the update pill is tapped, and "the screen looks wrong" and
 * "I am on last week's build" are indistinguishable without this.
 */
function buildStamp() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * The COMMIT time, not the build time - and that difference is load-bearing.
 *
 * This was `new Date().toISOString()`, which made every build unique. Because
 * a `define` is substituted at transform time, that fresh timestamp changed
 * the hash of every app chunk on every build, even with no source change at
 * all: two builds of one commit produced entirely different filenames.
 *
 * Which quietly defeated the whole point of splitting the bundle. The vendor
 * chunks stayed put - they come from node_modules and are not transformed with
 * defines - but every route chunk was re-downloaded on every deploy regardless
 * of whether a line of it had changed.
 *
 * Keyed to the commit, rebuilding the same commit is byte-identical, and a
 * deploy only moves the chunks that actually changed.
 */
function commitTime() {
  try {
    return execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim()
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Which node_modules package a module belongs to, or null for our own code.
 * Ids use forward slashes on every platform, including Windows.
 */
function packageOf(id: string): string | null {
  const after = id.split('node_modules/')[1]
  if (!after) return null
  const parts = after.split('/')
  return parts[0]!.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]!
}

const REACT_PKGS = ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler']

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(buildStamp()),
    __BUILD_TIME__: JSON.stringify(commitTime()),
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Pin the two stable vendor groups into their own chunks.
         *
         * This is about update size, not download size - Workbox precaches
         * everything either way. Left to itself the bundler folded Dexie and
         * Supabase in alongside whichever component first pulled them, so
         * editing that component changed the hash of a 326kB chunk and the
         * phone re-fetched all of it. Pinned, our code and our dependencies
         * have independent hashes, and a normal deploy only moves the former.
         *
         * Recharts is deliberately absent: only Progress imports it, so it
         * lands in that route's chunk, which is exactly where it should be.
         */
        manualChunks(id: string) {
          const pkg = packageOf(id)
          if (!pkg) return
          if (REACT_PKGS.includes(pkg)) return 'vendor-react'
          if (pkg === 'dexie' || pkg === 'dexie-react-hooks' || pkg.startsWith('@supabase/'))
            return 'vendor-data'
        },
      },
    },
  },
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
        name: 'log-book',
        short_name: 'log-book',
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
