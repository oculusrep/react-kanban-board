import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Where a site submit's files live in Dropbox.
 *
 * Resolution: the site submit's OWN folder if one has been created
 * (/Salesforce Documents/Site Submits/{name} - {id8}); otherwise its PROPERTY folder,
 * which is how every site submit worked before site_submit became a Dropbox entity.
 * `source` says which one you got, and is null when neither exists.
 *
 * Use this anywhere that needs ONE destination folder for "this site's files" (e.g. a
 * generated research export). The Files tab does not use it to pick a folder — it shows
 * Property, Site Submit and Deal as three separate sections — only to explain the empty
 * Site Submit section.
 *
 * Lookups go through get_dropbox_folder_path (SECURITY DEFINER), the same fallback
 * useDropboxFiles uses, so this resolves identically for internal and portal users.
 */
export type SiteSubmitFolderSource = 'site_submit' | 'property';

export interface ResolvedSiteSubmitFolder {
  path: string | null;
  source: SiteSubmitFolderSource | null;
}

async function lookupFolderPath(entityType: string, entityId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_dropbox_folder_path', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) {
    console.error(`get_dropbox_folder_path(${entityType}) failed:`, error);
    return null;
  }
  return (data as string | null) || null;
}

/** Non-hook form, for callers outside React render (services, handlers). */
export async function resolveSiteSubmitDropboxFolder(
  siteSubmitId: string | null | undefined,
  propertyId: string | null | undefined
): Promise<ResolvedSiteSubmitFolder> {
  if (siteSubmitId) {
    const own = await lookupFolderPath('site_submit', siteSubmitId);
    if (own) return { path: own, source: 'site_submit' };
  }
  if (propertyId) {
    const property = await lookupFolderPath('property', propertyId);
    if (property) return { path: property, source: 'property' };
  }
  return { path: null, source: null };
}

/**
 * @param refreshKey Any value that changes when a folder may have been created — e.g. the
 *   site submit section's folderPath — so the resolution re-runs after a first upload.
 */
export function useSiteSubmitDropboxFolder(
  siteSubmitId: string | null | undefined,
  propertyId: string | null | undefined,
  refreshKey?: unknown
): ResolvedSiteSubmitFolder & { loading: boolean } {
  const [resolved, setResolved] = useState<ResolvedSiteSubmitFolder>({ path: null, source: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    resolveSiteSubmitDropboxFolder(siteSubmitId, propertyId)
      .then((r) => {
        if (!cancelled) setResolved(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteSubmitId, propertyId, refreshKey]);

  return { ...resolved, loading };
}
