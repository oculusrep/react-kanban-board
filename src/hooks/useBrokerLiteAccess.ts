import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from './usePermissions';
import { supabase } from '../lib/supabaseClient';
import { mapLayerService, MapLayer } from '../services/mapLayerService';
import { RolePermissions } from '../types/permissions';

/**
 * Opt-in visibility for the broker_lite role. Every other role passes these
 * checks unconditionally, so the toggles only ever narrow broker_lite.
 *
 * Which deals and site submits are readable is enforced by RLS
 * (restricted_visible_deal_ids / restricted_visible_site_submit_ids); this hook
 * only decides what the UI offers.
 */
export function useBrokerLiteAccess() {
  const { user, userRole, userTableId } = useAuth();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const restricted = userRole === 'broker_lite';
  const seesAllSiteSubmits = !restricted || hasPermission('can_view_site_submits');
  const seesAllCustomLayers = !restricted || hasPermission('can_view_all_custom_layers');
  const authUserId = user?.id ?? null;

  // RLS decides which records are visible; this only asks whether any are.
  const [hasVisibleSiteSubmits, setHasVisibleSiteSubmits] = useState<boolean | null>(null);

  useEffect(() => {
    if (!restricted || seesAllSiteSubmits) return;
    let cancelled = false;
    // A broker on an account with no site submits yet still needs the tools to add one.
    Promise.all([
      supabase.from('site_submit').select('id').limit(1),
      userTableId
        ? supabase.from('client_broker').select('id').eq('user_id', userTableId).eq('is_active', true).limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]).then(([submits, accounts]) => {
      if (cancelled) return;
      if (submits.error) console.error('Error checking site submit access:', submits.error);
      if (accounts.error) console.error('Error checking broker accounts:', accounts.error);
      setHasVisibleSiteSubmits((submits.data ?? []).length > 0 || (accounts.data ?? []).length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [restricted, seesAllSiteSubmits, userTableId]);

  const canAccess = useCallback(
    (permission: keyof RolePermissions) => !restricted || hasPermission(permission),
    [restricted, hasPermission],
  );

  const canSeeAnySiteSubmits = seesAllSiteSubmits || hasVisibleSiteSubmits === true;

  /** Limits custom layers to the user's own and those shared with them. */
  const filterCustomLayers = useCallback(
    async (layers: MapLayer[]): Promise<MapLayer[]> => {
      if (seesAllCustomLayers) return layers;
      const sharedIds = userTableId
        ? await mapLayerService.getSharedLayerIdsForUser(userTableId)
        : new Set<string>();
      return layers.filter(
        (layer) => (!!authUserId && layer.created_by_id === authUserId) || sharedIds.has(layer.id),
      );
    },
    [seesAllCustomLayers, userTableId, authUserId],
  );

  return {
    restricted,
    loading: permissionsLoading || (restricted && !seesAllSiteSubmits && hasVisibleSiteSubmits === null),
    canAccess,
    seesAllSiteSubmits,
    canSeeAnySiteSubmits,
    filterCustomLayers,
  };
}
