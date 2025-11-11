/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DROPBOX_ACCESS_TOKEN: string
  readonly VITE_DROPBOX_REFRESH_TOKEN: string
  readonly VITE_DROPBOX_APP_KEY: string
  readonly VITE_DROPBOX_APP_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
