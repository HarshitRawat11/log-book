import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isConfigured, supabaseAnonKey, supabaseUrl } from './env'

/**
 * The Supabase client.
 *
 * Null when credentials are absent, so the app can render a "not configured"
 * screen instead of crashing. Every call site must handle null - which is
 * also a useful forcing function, since Phase 2 onwards must tolerate the
 * network being gone anyway.
 */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // PKCE rather than the implicit flow. The magic link then carries a
        // one-time ?code= instead of putting an access token in the URL
        // fragment, where it would land in history and referrer headers.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // Let the client exchange the ?code= automatically on load. The
        // /auth/callback route only has to wait for the resulting session.
        detectSessionInUrl: true,
      },
    })
  : null

/** Where the magic link should send the browser back to. */
export function authRedirectTo(): string {
  return `${window.location.origin}/auth/callback`
}
