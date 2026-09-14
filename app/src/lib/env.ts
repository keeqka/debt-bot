export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}

/** True once real Supabase keys are provided; until then the app runs on mock data. */
export const isBackendConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
