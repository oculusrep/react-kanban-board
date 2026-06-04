import DropboxService from './dropboxService';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert } from '../lib/supabaseHelpers';

type EntityType = 'property' | 'client' | 'contact' | 'deal';

/**
 * Service to sync property names with Dropbox folder names
 */
export class DropboxPropertySyncService {
  private dropboxService: DropboxService;

  constructor(dropboxService: DropboxService) {
    this.dropboxService = dropboxService;
  }

  /**
   * Generic method to sync entity name to Dropbox folder
   * Works for property, client, contact, deal
   *
   * If no `dropbox_mapping` row exists for this entity, falls back to the
   * conventional folder path (/Salesforce Documents/{Properties|Accounts|Opportunities|Contacts}/{oldName}).
   * If a folder is found there, the mapping row is inserted and the rename proceeds.
   * Salesforce-migrated records frequently have folders but no mapping row.
   *
   * @returns success=true on rename or no-op; success=false with a user-facing `error` on any failure
   *          (no linked folder, source missing, name conflict, RLS failure, Dropbox API error)
   */
  async syncEntityName(
    entityId: string,
    entityType: EntityType,
    oldName: string,
    newName: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('🔵 syncEntityName called:', { entityId, entityType, oldName, newName });

    try {
      if (oldName === newName) {
        console.log('⏭️  Names are the same, skipping sync');
        return { success: true };
      }

      // Look up the existing mapping (may be absent for Salesforce-migrated records)
      const { data: mapping } = await supabase
        .from('dropbox_mapping')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .maybeSingle();

      let oldPath: string;
      let mappingExists = false;

      if (mapping?.dropbox_folder_path) {
        oldPath = mapping.dropbox_folder_path;
        mappingExists = true;
        console.log('✅ Found mapping:', oldPath);
      } else {
        // Auto-heal: try the conventional path for this entity type
        oldPath = this.dropboxService.buildEntityFolderPath(entityType, oldName);
        console.log('🔎 No mapping row; probing conventional path:', oldPath);

        const exists = await this.dropboxService.folderExists(oldPath);
        if (!exists) {
          return {
            success: false,
            error: `No Dropbox folder linked to this ${entityType}. Upload a file in OVIS first to create one.`
          };
        }
        console.log('✅ Auto-heal: found folder at conventional path');
      }

      // Build the new path, preserving the parent directory
      const pathParts = oldPath.split('/');
      const basePath = pathParts.slice(0, -1).join('/');
      const cleanNewName = newName
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const newPath = `${basePath}/${cleanNewName}`;

      // Already named correctly in Dropbox (path-equal after clean) — just ensure mapping is current
      if (oldPath === newPath) {
        console.log('⏭️  Folder already at target path; ensuring mapping is current');
        if (!mappingExists) {
          await this.insertMapping(entityType, entityId, newPath);
        }
        return { success: true };
      }

      console.log('🔄 Dropbox sync:', { oldPath, newPath, entityType, entityId });

      // When mapping was already known, the stored path could be stale — verify source still exists.
      // (Auto-heal path already confirmed existence, no need to re-check.)
      if (mappingExists) {
        const sourceExists = await this.dropboxService.folderExists(oldPath);
        if (!sourceExists) {
          return {
            success: false,
            error: 'Dropbox folder not found at the linked path. It may have been renamed or moved manually in Dropbox.'
          };
        }
      }

      // Conflict check on target
      const targetExists = await this.dropboxService.folderExists(newPath);
      if (targetExists) {
        return {
          success: false,
          error: `A folder named "${cleanNewName}" already exists in this location. Please rename or remove the existing folder first.`
        };
      }

      await this.dropboxService.renameFolder(oldPath, newPath);

      // Persist the new path
      if (mappingExists) {
        const { error: updateError } = await supabase
          .from('dropbox_mapping')
          .update({
            dropbox_folder_path: newPath,
            last_verified_at: new Date().toISOString()
          })
          .eq('entity_type', entityType)
          .eq('entity_id', entityId);

        if (updateError) {
          console.error('Failed to update folder mapping:', updateError);
          return {
            success: false,
            error: 'Renamed folder in Dropbox but failed to update the OVIS mapping. Try the retry button.'
          };
        }
      } else {
        const insertResult = await this.insertMapping(entityType, entityId, newPath);
        if (!insertResult.success) {
          return {
            success: false,
            error: 'Renamed folder in Dropbox but failed to record the mapping in OVIS.'
          };
        }
      }

      console.log('✅ Successfully synced entity name to Dropbox:', { entityType, entityId, oldPath, newPath });
      return { success: true };

    } catch (error: any) {
      console.error('Error syncing entity name to Dropbox:', error);

      let errorMessage = 'Failed to sync folder name to Dropbox.';
      if (error.error?.error?.['.tag'] === 'to/conflict') {
        errorMessage = 'A folder with that name already exists in Dropbox.';
      } else if (error.error?.error?.['.tag'] === 'from_lookup/not_found') {
        errorMessage = 'Original folder not found in Dropbox.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  }

  // sf_id has a UNIQUE constraint; mirror the placeholder format used by useDropboxFiles for auto-created folders.
  private async insertMapping(
    entityType: EntityType,
    entityId: string,
    folderPath: string
  ): Promise<{ success: boolean; error?: string }> {
    const placeholderSfId = `AUTO-${entityId.substring(0, 13)}`;

    const { error } = await supabase
      .from('dropbox_mapping')
      .insert(prepareInsert({
        entity_type: entityType,
        entity_id: entityId,
        dropbox_folder_path: folderPath,
        sf_id: placeholderSfId,
        sfdb_file_found: false,
        last_verified_at: new Date().toISOString()
      }));

    if (error) {
      console.error('Failed to insert dropbox_mapping row:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  /**
   * Convenience method for syncing property names (legacy - for backwards compatibility)
   */
  async syncPropertyName(propertyId: string, oldName: string, newName: string) {
    return this.syncEntityName(propertyId, 'property', oldName, newName);
  }

  /**
   * Convenience method for syncing client names
   */
  async syncClientName(clientId: string, oldName: string, newName: string) {
    return this.syncEntityName(clientId, 'client', oldName, newName);
  }

  /**
   * Convenience method for syncing contact names
   */
  async syncContactName(contactId: string, oldName: string, newName: string) {
    return this.syncEntityName(contactId, 'contact', oldName, newName);
  }

  /**
   * Convenience method for syncing deal names
   */
  async syncDealName(dealId: string, oldName: string, newName: string) {
    return this.syncEntityName(dealId, 'deal', oldName, newName);
  }

  /**
   * Check if entity name matches Dropbox folder name
   * Returns true if in sync, false if out of sync
   *
   * @param entityId - UUID of the entity
   * @param entityType - Type of entity
   * @param entityName - Current entity name
   * @returns Sync status
   */
  async checkSyncStatus(
    entityId: string,
    entityType: EntityType,
    entityName: string
  ): Promise<{ inSync: boolean; currentFolderName?: string }> {
    try {
      // Get the Dropbox folder mapping for this entity
      const { data: mapping, error: mappingError } = await supabase
        .from('dropbox_mapping')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      if (mappingError || !mapping) {
        // No mapping - consider it "in sync" (nothing to sync to)
        return { inSync: true };
      }

      // Extract folder name from path
      const folderPath = mapping.dropbox_folder_path;
      const folderName = folderPath.split('/').pop() || '';

      // Clean entity name same way we build folder paths
      const cleanEntityName = entityName
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const inSync = folderName === cleanEntityName;

      return { inSync, currentFolderName: folderName };

    } catch (error) {
      console.error('Error checking sync status:', error);
      return { inSync: true }; // Assume in sync on error to avoid showing false warnings
    }
  }
}

// Create singleton instance
let syncServiceInstance: DropboxPropertySyncService | null = null;

export function getDropboxPropertySyncService(): DropboxPropertySyncService {
  if (!syncServiceInstance) {
    // Initialize Dropbox service
    const accessToken = import.meta.env.VITE_DROPBOX_ACCESS_TOKEN;
    const refreshToken = import.meta.env.VITE_DROPBOX_REFRESH_TOKEN;
    const appKey = import.meta.env.VITE_DROPBOX_APP_KEY;
    const appSecret = import.meta.env.VITE_DROPBOX_APP_SECRET;

    const dropboxService = new DropboxService(accessToken, refreshToken, appKey, appSecret);
    syncServiceInstance = new DropboxPropertySyncService(dropboxService);
  }

  return syncServiceInstance;
}
