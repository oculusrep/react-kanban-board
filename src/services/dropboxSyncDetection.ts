import DropboxService from './dropboxService';
import { supabase } from '../lib/supabaseClient';

/**
 * Service to detect out-of-sync Dropbox folders and suggest matches
 */
export class DropboxSyncDetectionService {
  private dropboxService: DropboxService;

  constructor(dropboxService: DropboxService) {
    this.dropboxService = dropboxService;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate similarity score (0-1) between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - distance / maxLength;
  }

  /**
   * Find folders in a directory that are similar to target name
   */
  async findSimilarFolders(
    targetName: string,
    parentPath: string
  ): Promise<Array<{ name: string; path: string; similarity: number }>> {
    try {
      console.log('🔍 Searching for similar folders to:', targetName, 'in', parentPath);

      // List all folders in the parent directory
      const response = await this.dropboxService.listFolders(parentPath);

      if (!response || !response.entries) {
        console.log('⚠️  No folders found in directory');
        return [];
      }

      // Calculate similarity for each folder
      const candidates = response.entries
        .filter((entry: any) => entry['.tag'] === 'folder')
        .map((folder: any) => {
          const folderName = folder.name;
          const similarity = this.calculateSimilarity(targetName, folderName);

          return {
            name: folderName,
            path: folder.path_display,
            similarity,
            modified: folder.client_modified || folder.server_modified
          };
        })
        .filter((item: any) => item.similarity > 0.5) // Only show 50%+ matches
        .sort((a: any, b: any) => b.similarity - a.similarity);

      console.log(`✅ Found ${candidates.length} similar folders`);
      return candidates;

    } catch (error) {
      console.error('Error finding similar folders:', error);
      return [];
    }
  }

  /**
   * Check all properties for sync status
   */
  async checkAllPropertiesSyncStatus(): Promise<Array<{
    propertyId: string;
    propertyName: string;
    mappedFolderPath: string;
    mappedFolderName: string;
    status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
    lastVerified: string | null;
    sfId: string | null;
  }>> {
    try {
      console.log('🔍 Checking sync status for all properties...');

      // Get all Dropbox mappings for properties (using the mapping table directly)
      const { data: mappings, error } = await supabase
        .from('dropbox_mapping')
        .select('*')
        .eq('entity_type', 'property');

      if (error) {
        console.error('Error fetching mappings:', error);
        return [];
      }

      if (!mappings || mappings.length === 0) {
        console.log('No Dropbox mappings found for properties');
        return [];
      }

      console.log(`📊 Found ${mappings.length} property mappings...`);

      // Get all properties referenced in the mappings
      const propertyIds = mappings.map(m => m.entity_id);
      const { data: properties, error: propError } = await supabase
        .from('property')
        .select('id, property_name')
        .in('id', propertyIds);

      if (propError) {
        console.error('Error fetching properties:', propError);
        return [];
      }

      if (!properties || properties.length === 0) {
        console.log('No properties found');
        return [];
      }

      // Create a map of property ID to property name
      const propertyMap = new Map(properties.map(p => [p.id, p.property_name]));

      console.log(`📊 Checking ${mappings.length} properties...`);

      // Check each mapping's sync status
      const results = await Promise.all(
        mappings.map(async (mapping: any) => {
          const propertyName = propertyMap.get(mapping.entity_id);

          if (!propertyName) {
            console.warn(`Property not found for mapping: ${mapping.entity_id}`);
            return null;
          }

          const mappedPath = mapping.dropbox_folder_path;
          const mappedFolderName = mappedPath.split('/').pop() || '';

          // Check if folder exists
          let folderExists = false;
          try {
            folderExists = await this.dropboxService.folderExists(mappedPath);
          } catch (err) {
            console.warn(`Could not check folder existence for ${mappedPath}`);
          }

          // Determine status
          let status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
          if (!folderExists) {
            status = 'folder_not_found';
          } else if (mappedFolderName !== propertyName) {
            status = 'name_mismatch';
          } else {
            status = 'in_sync';
          }

          return {
            propertyId: mapping.entity_id,
            propertyName: propertyName,
            mappedFolderPath: mappedPath,
            mappedFolderName,
            status,
            lastVerified: mapping.last_verified_at,
            sfId: mapping.sf_id
          };
        })
      );

      // Filter out null results
      const validResults = results.filter(r => r !== null) as Array<{
        propertyId: string;
        propertyName: string;
        mappedFolderPath: string;
        mappedFolderName: string;
        status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
        lastVerified: string | null;
        sfId: string | null;
      }>;

      // Filter to only out-of-sync properties
      const outOfSync = validResults.filter(r => r.status !== 'in_sync');
      console.log(`✅ Found ${outOfSync.length} out-of-sync properties`);

      return validResults;

    } catch (error) {
      console.error('Error checking sync status:', error);
      return [];
    }
  }

  /**
   * Find candidate folders for a property that's out of sync
   */
  async findCandidateFolders(
    propertyName: string,
    oldPath: string,
    lastVerified: string | null
  ): Promise<Array<{
    path: string;
    name: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    similarity?: number;
    modified?: string;
  }>> {
    try {
      console.log('🔍 Finding candidate folders for:', propertyName);

      const candidates: Array<{
        path: string;
        name: string;
        confidence: 'high' | 'medium' | 'low';
        reason: string;
        similarity?: number;
        modified?: string;
      }> = [];

      // Get parent directory from old path
      const parentPath = oldPath.split('/').slice(0, -1).join('/');

      // Strategy 1: Find folders with similar names
      const similarFolders = await this.findSimilarFolders(propertyName, parentPath);

      for (const folder of similarFolders) {
        const percentMatch = Math.round(folder.similarity * 100);
        let confidence: 'high' | 'medium' | 'low';

        if (folder.similarity >= 0.85) {
          confidence = 'high';
        } else if (folder.similarity >= 0.7) {
          confidence = 'medium';
        } else {
          confidence = 'low';
        }

        candidates.push({
          path: folder.path,
          name: folder.name,
          confidence,
          reason: `Name similarity: ${percentMatch}%`,
          similarity: folder.similarity,
          modified: folder.modified
        });
      }

      // Strategy 2: Check timestamp correlation if we have last_verified
      if (lastVerified && similarFolders.length > 0) {
        const verifiedDate = new Date(lastVerified);
        const windowMinutes = 60; // 1 hour window

        for (const folder of similarFolders) {
          if (folder.modified) {
            const modifiedDate = new Date(folder.modified);
            const timeDiff = Math.abs(modifiedDate.getTime() - verifiedDate.getTime());
            const minutesDiff = timeDiff / (1000 * 60);

            if (minutesDiff <= windowMinutes) {
              // Boost confidence if modified around the same time
              const candidate = candidates.find(c => c.path === folder.path);
              if (candidate && candidate.confidence === 'medium') {
                candidate.confidence = 'high';
                candidate.reason += ` (modified around same time)`;
              }
            }
          }
        }
      }

      console.log(`✅ Found ${candidates.length} candidate folders`);
      return candidates;

    } catch (error) {
      console.error('Error finding candidate folders:', error);
      return [];
    }
  }
}

// Singleton instance
let syncDetectionServiceInstance: DropboxSyncDetectionService | null = null;

export function getDropboxSyncDetectionService(): DropboxSyncDetectionService {
  if (!syncDetectionServiceInstance) {
    const accessToken = import.meta.env.VITE_DROPBOX_ACCESS_TOKEN;
    const refreshToken = import.meta.env.VITE_DROPBOX_REFRESH_TOKEN;
    const appKey = import.meta.env.VITE_DROPBOX_APP_KEY;
    const appSecret = import.meta.env.VITE_DROPBOX_APP_SECRET;

    const dropboxService = new DropboxService(accessToken, refreshToken, appKey, appSecret);
    syncDetectionServiceInstance = new DropboxSyncDetectionService(dropboxService);
  }

  return syncDetectionServiceInstance;
}
