import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      config.supabase.url,
      config.supabase.serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return supabaseInstance;
}

export const supabase = getSupabaseClient();

export default supabase;
