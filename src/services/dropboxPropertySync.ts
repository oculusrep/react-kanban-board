import DropboxService from './dropboxService';
import { supabase } from '../lib/supabaseClient';

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
   * @param entityId - UUID of the entity
   * @param entityType - Type of entity
   * @param oldName - Previous entity name
   * @param newName - New entity name
   * @returns Object with success status and optional error
   */
  async syncEntityName(
    entityId: string,
    entityType: 'property' | 'client' | 'contact' | 'deal',
    oldName: string,
    newName: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('🔵 syncEntityName called:', { entityId, entityType, oldName, newName });

    try {
      // Skip if names are the same
      if (oldName === newName) {
        console.log('⏭️  Names are the same, skipping sync');
        return { success: true };
      }

      // Get the Dropbox folder mapping for this entity
      console.log('📂 Fetching Dropbox folder mapping...');
      const { data: mapping, error: mappingError } = await supabase
        .from('dropbox_folder_mapping')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      if (mappingError) {
        console.error('❌ Error fetching mapping:', mappingError);
      }

      if (mappingError || !mapping) {
        // No mapping exists - this is okay, entity might not have a Dropbox folder yet
        console.log('⚠️  No Dropbox folder mapping found for:', entityType, entityId);
        return { success: true };
      }

      console.log('✅ Found mapping:', mapping);

      const oldPath = mapping.dropbox_folder_path;

      // Build new path by replacing the old folder name with the new name
      // Preserve the base path structure from the old path
      const pathParts = oldPath.split('/');
      const basePath = pathParts.slice(0, -1).join('/'); // Everything except the last part
      const cleanNewName = newName
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      const newPath = `${basePath}/${cleanNewName}`;

      console.log('🔄 Dropbox sync:', { oldPath, newPath, entityType, entityId });

      // Check if folder exists at old path
      const folderExists = await this.dropboxService.folderExists(oldPath);

      if (!folderExists) {
        console.warn('Dropbox folder does not exist at:', oldPath);
        return {
          success: false,
          error: 'Dropbox folder not found. The folder may have been deleted or moved.'
        };
      }

      // Rename the folder in Dropbox
      await this.dropboxService.renameFolder(oldPath, newPath);

      // Update the mapping table with the new path
      const { error: updateError } = await supabase
        .from('dropbox_folder_mapping')
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
          error: 'Updated Dropbox folder but failed to update database mapping.'
        };
      }

      console.log('✅ Successfully synced entity name to Dropbox:', {
        entityType,
        entityId,
        oldPath,
        newPath
      });

      return { success: true };

    } catch (error: any) {
      console.error('Error syncing property name to Dropbox:', error);

      // Parse Dropbox-specific errors
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
    entityType: 'property' | 'client' | 'contact' | 'deal',
    entityName: string
  ): Promise<{ inSync: boolean; currentFolderName?: string }> {
    try {
      // Get the Dropbox folder mapping for this entity
      const { data: mapping, error: mappingError } = await supabase
        .from('dropbox_folder_mapping')
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
