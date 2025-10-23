import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    headers: {
      'Accept': 'application/json'
    }
  }
})
