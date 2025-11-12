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

      console.log(`📂 Found ${response.entries.length} total entries in directory`);

      // Calculate similarity for each folder
      const folders = response.entries.filter((entry: any) => entry['.tag'] === 'folder');
      console.log(`📁 Found ${folders.length} folders to analyze`);

      const candidates = folders
        .map((folder: any) => {
          const folderName = folder.name;
          const similarity = this.calculateSimilarity(targetName, folderName);

          // Additional matching strategies for better flexibility
          const targetLower = targetName.toLowerCase();
          const folderLower = folderName.toLowerCase();

          // Boost similarity if one contains the other
          let boostedSimilarity = similarity;
          if (targetLower.includes(folderLower) || folderLower.includes(targetLower)) {
            boostedSimilarity = Math.max(similarity, 0.6);
            console.log(`📍 Substring match found: "${folderName}" (boosted from ${similarity.toFixed(2)} to ${boostedSimilarity.toFixed(2)})`);
          }

          // Additional boost for starting with the same prefix (first 5 chars)
          if (targetLower.substring(0, 5) === folderLower.substring(0, 5)) {
            boostedSimilarity = Math.max(boostedSimilarity, 0.5);
          }

          console.log(`  📊 "${folderName}": similarity=${similarity.toFixed(2)}, boosted=${boostedSimilarity.toFixed(2)}`);

          return {
            name: folderName,
            path: folder.path_display,
            similarity: boostedSimilarity,
            modified: folder.client_modified || folder.server_modified
          };
        })
        .filter((item: any) => item.similarity > 0.3) // Lowered from 0.5 to 0.3 (30% match)
        .sort((a: any, b: any) => b.similarity - a.similarity);

      console.log(`✅ Found ${candidates.length} similar folders (threshold: 30%)`);
      candidates.forEach((c: any) => {
        console.log(`  ✓ ${c.name} (${Math.round(c.similarity * 100)}% match)`);
      });

      return candidates;

    } catch (error) {
      console.error('Error finding similar folders:', error);
      return [];
    }
  }

  /**
   * Check all properties for sync status (with caching)
   * @param forceRefresh - If true, bypass cache and check all folders
   */
  async checkAllPropertiesSyncStatus(forceRefresh = false): Promise<Array<{
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

      // Try to load from cache first (unless force refresh requested)
      if (!forceRefresh) {
        const cacheAge = 24; // hours
        const cacheResults = await this.loadFromCache(cacheAge);

        if (cacheResults && cacheResults.length > 0) {
          console.log(`✅ Loaded ${cacheResults.length} properties from cache (last checked within ${cacheAge} hours)`);
          return cacheResults;
        }

        console.log('📭 No valid cache found, performing full sync check...');
      } else {
        console.log('🔄 Force refresh requested, bypassing cache...');
      }

      // Get all Dropbox mappings for properties (using the mapping table directly)
      // Note: We need to fetch ALL mappings, not just the first 1000
      let allMappings: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: mappingPage, error } = await supabase
          .from('dropbox_mapping')
          .select('*')
          .eq('entity_type', 'property')
          .range(offset, offset + pageSize - 1);

        if (error) {
          console.error('Error fetching mappings:', error);
          break;
        }

        if (mappingPage && mappingPage.length > 0) {
          allMappings.push(...mappingPage);
          console.log(`📄 Fetched ${mappingPage.length} mappings (total: ${allMappings.length})...`);

          if (mappingPage.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        } else {
          hasMore = false;
        }
      }

      const mappings = allMappings;

      if (!mappings || mappings.length === 0) {
        console.log('No Dropbox mappings found for properties');
        return [];
      }

      console.log(`📊 Found ${mappings.length} property mappings...`);

      // Get all properties referenced in the mappings
      // Batch the queries to avoid URL length limits (max ~100 IDs per query)
      const propertyIds = mappings.map(m => m.entity_id);
      const batchSize = 100;
      const propertyBatches: string[][] = [];

      for (let i = 0; i < propertyIds.length; i += batchSize) {
        propertyBatches.push(propertyIds.slice(i, i + batchSize));
      }

      console.log(`📦 Fetching properties in ${propertyBatches.length} batches...`);

      const allProperties: Array<{ id: string; property_name: string | null }> = [];

      for (const batch of propertyBatches) {
        const { data: batchProperties, error: propError } = await supabase
          .from('property')
          .select('id, property_name')
          .in('id', batch);

        if (propError) {
          console.error('Error fetching property batch:', propError);
          continue;
        }

        if (batchProperties) {
          allProperties.push(...batchProperties);
        }
      }

      if (allProperties.length === 0) {
        console.log('No properties found');
        return [];
      }

      console.log(`✅ Fetched ${allProperties.length} properties`);

      // Create a map of property ID to property name
      const propertyMap = new Map(allProperties.map(p => [p.id, p.property_name]));

      console.log(`📊 Checking ${mappings.length} properties...`);

      // Check each mapping's sync status
      // Process in batches to avoid overwhelming Dropbox API and hitting rate limits
      const checkBatchSize = 10; // Reduced from 50 to 10 to avoid rate limiting
      const delayBetweenBatches = 1000; // 1 second delay between batches
      const allResults: Array<{
        propertyId: string;
        propertyName: string;
        mappedFolderPath: string;
        mappedFolderName: string;
        status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
        lastVerified: string | null;
        sfId: string | null;
      } | null> = [];

      for (let i = 0; i < mappings.length; i += checkBatchSize) {
        const batch = mappings.slice(i, i + checkBatchSize);
        const batchNumber = Math.floor(i / checkBatchSize) + 1;
        const totalBatches = Math.ceil(mappings.length / checkBatchSize);
        console.log(`🔍 Checking batch ${batchNumber}/${totalBatches} (${i + 1}-${Math.min(i + checkBatchSize, mappings.length)} of ${mappings.length})...`);

        const batchResults = await Promise.all(
          batch.map(async (mapping: any) => {
            const propertyName = propertyMap.get(mapping.entity_id);

            if (!propertyName) {
              console.warn(`⚠️ Property not found for mapping: ${mapping.entity_id}`);
              return null;
            }

            const mappedPath = mapping.dropbox_folder_path;
            const mappedFolderName = mappedPath.split('/').pop() || '';

            // Check if folder exists
            let folderExists = false;
            try {
              folderExists = await this.dropboxService.folderExists(mappedPath);
            } catch (err) {
              console.warn(`⚠️ Could not check folder existence for ${mappedPath}:`, err);
            }

            // Determine status
            let status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
            if (!folderExists) {
              status = 'folder_not_found';
              console.log(`❌ Folder not found: ${propertyName} → ${mappedPath}`);
            } else if (mappedFolderName !== propertyName) {
              status = 'name_mismatch';
              console.log(`⚠️ Name mismatch: CRM="${propertyName}" vs Dropbox="${mappedFolderName}"`);
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

        allResults.push(...batchResults);

        // Add delay between batches to avoid rate limiting (except for the last batch)
        if (i + checkBatchSize < mappings.length) {
          console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      const results = allResults;

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

      // Save results to cache
      await this.saveToCache(validResults);

      return validResults;

    } catch (error) {
      console.error('Error checking sync status:', error);
      return [];
    }
  }

  /**
   * Load sync status from cache
   * @param maxAgeHours - Maximum age of cache in hours
   * @returns Cached results or null if cache is too old/empty
   */
  private async loadFromCache(maxAgeHours: number): Promise<Array<{
    propertyId: string;
    propertyName: string;
    mappedFolderPath: string;
    mappedFolderName: string;
    status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
    lastVerified: string | null;
    sfId: string | null;
  }> | null> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      console.log(`📦 Loading from cache (max age: ${maxAgeHours} hours, cutoff: ${cutoffTime.toISOString()})...`);

      // Fetch ALL cache entries with pagination (Supabase has 1000 row limit by default)
      let allCacheEntries: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: cachePage, error } = await supabase
          .from('dropbox_sync_cache')
          .select('*')
          .eq('entity_type', 'property')
          .gte('checked_at', cutoffTime.toISOString())
          .range(offset, offset + pageSize - 1);

        if (error) {
          console.error('Error loading cache:', error);
          return null;
        }

        if (cachePage && cachePage.length > 0) {
          allCacheEntries.push(...cachePage);
          console.log(`📦 Loaded ${cachePage.length} cache entries (total: ${allCacheEntries.length})...`);

          if (cachePage.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        } else {
          hasMore = false;
        }
      }

      if (allCacheEntries.length === 0) {
        console.log('📭 Cache is empty or too old');
        return null;
      }

      console.log(`✅ Loaded ${allCacheEntries.length} entries from cache`);

      return allCacheEntries.map(row => ({
        propertyId: row.entity_id,
        propertyName: row.property_name,
        mappedFolderPath: row.mapped_folder_path,
        mappedFolderName: row.mapped_folder_name,
        status: row.status as 'in_sync' | 'name_mismatch' | 'folder_not_found',
        lastVerified: row.checked_at,
        sfId: null // sf_id not stored in cache
      }));

    } catch (error) {
      console.error('Error loading from cache:', error);
      return null;
    }
  }

  /**
   * Save sync status to cache (upsert - insert or update)
   * @param results - Sync check results to cache
   */
  private async saveToCache(results: Array<{
    propertyId: string;
    propertyName: string;
    mappedFolderPath: string;
    mappedFolderName: string;
    status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
    lastVerified: string | null;
    sfId: string | null;
  }>): Promise<void> {
    try {
      console.log(`💾 Saving ${results.length} entries to cache...`);

      // Convert results to cache format
      const cacheEntries = results.map(result => ({
        entity_id: result.propertyId,
        entity_type: 'property' as const,
        status: result.status,
        property_name: result.propertyName,
        mapped_folder_path: result.mappedFolderPath,
        mapped_folder_name: result.mappedFolderName,
        checked_at: new Date().toISOString()
      }));

      // Upsert in batches (Supabase has limits on batch size)
      const batchSize = 500;
      for (let i = 0; i < cacheEntries.length; i += batchSize) {
        const batch = cacheEntries.slice(i, i + batchSize);

        const { error } = await supabase
          .from('dropbox_sync_cache')
          .upsert(batch, {
            onConflict: 'entity_id,entity_type'
          });

        if (error) {
          console.error(`Error saving cache batch ${i}-${i + batch.length}:`, error);
        } else {
          console.log(`✅ Saved batch ${i + 1}-${Math.min(i + batchSize, cacheEntries.length)} to cache`);
        }
      }

      console.log('✅ Cache updated successfully');

    } catch (error) {
      console.error('Error saving to cache:', error);
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
      console.log(`📂 Old path: "${oldPath}"`);
      console.log(`📂 Parent path to search: "${parentPath}"`);

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
