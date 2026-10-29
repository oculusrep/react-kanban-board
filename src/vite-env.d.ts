/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // No VITE_DROPBOX_*: anything VITE_ is public. Dropbox goes through dropbox-proxy.
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
