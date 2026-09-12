/**
 * Environment configuration.
 *
 * Both values below are PUBLIC by design. Vite inlines every VITE_* variable
 * into the JS bundle, so they are visible to anyone who opens devtools. This
 * is fine and expected: the anon key identifies the project, it does not
 * authorise anything. Row Level Security is what protects the data.
 *
 * The service_role key must never be referenced from this directory, or from
 * anywhere else the bundler can reach.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Whether Supabase credentials are present.
 *
 * Deliberately not a hard throw at module load. A missing .env.local should
 * render an explanatory screen, not a white page with a console error - the
 * white page is what you get on the phone, where there is no console.
 */
export const isConfigured = Boolean(url && anonKey)

export const supabaseUrl = url ?? ''
export const supabaseAnonKey = anonKey ?? ''
