/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // No VITE_DROPBOX_*: anything VITE_ is public. Dropbox goes through dropbox-proxy.
  // No VITE_GOOGLE_GEOCODING_API_KEY: geocoding goes through the `geocode` edge function.
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
