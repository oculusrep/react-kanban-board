import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

/**
 * Can the current user see the 7-Eleven / Speedway map layer?
 *
 * Source of truth is the DB function user_has_seven_eleven_access(), which is
 * also the RLS predicate on seven_eleven_store. True when EITHER:
 *   - can_view_7eleven_layer is on (user override, else role), or
 *   - the user is an active broker on the 7-Eleven client (client_broker).
 * Asking the DB keeps the UI gate and the data gate from drifting apart.
 */
const cache = new Map<string, Promise<boolean>>();

function fetchAccess(key: string): Promise<boolean> {
  let p = cache.get(key);
  if (!p) {
    p = Promise.resolve(supabase.rpc('user_has_seven_eleven_access')).then(({ data, error }) => {
      if (error) {
        console.error('user_has_seven_eleven_access failed:', error);
        cache.delete(key);
        return false;
      }
      return data === true;
    });
    cache.set(key, p);
  }
  return p;
}

export function useSevenElevenAccess(): boolean {
  const { userTableId } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (!userTableId) {
      setHasAccess(false);
      return;
    }
    let cancelled = false;
    fetchAccess(userTableId).then((ok) => {
      if (!cancelled) setHasAccess(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [userTableId]);

  return hasAccess;
}
