/**
 * IndexedDB-based cache for property data
 * Caches properties by geographic tiles for fast retrieval when panning the map
 */

const DB_NAME = 'PropertyCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'properties';
const TILE_STORE_NAME = 'tiles';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

// Tile size in degrees (approximately 10-20 miles at mid-latitudes)
const TILE_SIZE = 0.5;

interface CachedProperty {
  id: string;
  data: any;
  tileKey: string;
  cachedAt: number;
}

interface TileMetadata {
  tileKey: string;
  fetchedAt: number;
  propertyCount: number;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open PropertyCache IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('✅ PropertyCache IndexedDB initialized');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Properties store - keyed by property ID
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const propertyStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        propertyStore.createIndex('tileKey', 'tileKey', { unique: false });
        propertyStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }

      // Tiles store - tracks which tiles have been fetched
      if (!db.objectStoreNames.contains(TILE_STORE_NAME)) {
        db.createObjectStore(TILE_STORE_NAME, { keyPath: 'tileKey' });
      }

      console.log('📦 PropertyCache IndexedDB schema created');
    };
  });

  return dbInitPromise;
}

/**
 * Calculate tile key for a given lat/lng
 */
function getTileKey(lat: number, lng: number): string {
  const tileX = Math.floor(lng / TILE_SIZE);
  const tileY = Math.floor(lat / TILE_SIZE);
  return `${tileX},${tileY}`;
}

/**
 * Get all tile keys that overlap with a bounding box
 */
function getTileKeysForBounds(
  south: number,
  north: number,
  west: number,
  east: number
): string[] {
  const tiles: string[] = [];

  const minTileX = Math.floor(west / TILE_SIZE);
  const maxTileX = Math.floor(east / TILE_SIZE);
  const minTileY = Math.floor(south / TILE_SIZE);
  const maxTileY = Math.floor(north / TILE_SIZE);

  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      tiles.push(`${x},${y}`);
    }
  }

  return tiles;
}

/**
 * Check if a tile is cached and not expired
 */
async function isTileCached(tileKey: string): Promise<boolean> {
  try {
    const db = await initDB();

    return new Promise((resolve) => {
      const transaction = db.transaction([TILE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(TILE_STORE_NAME);
      const request = store.get(tileKey);

      request.onsuccess = () => {
        const tile = request.result as TileMetadata | undefined;
        if (!tile) {
          resolve(false);
          return;
        }

        // Check if expired
        const isExpired = Date.now() - tile.fetchedAt > CACHE_TTL_MS;
        resolve(!isExpired);
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

/**
 * Get cached properties for specific tile keys
 */
async function getPropertiesFromCache(tileKeys: string[]): Promise<any[]> {
  try {
    const db = await initDB();
    const properties: any[] = [];

    for (const tileKey of tileKeys) {
      await new Promise<void>((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('tileKey');
        const request = index.getAll(tileKey);

        request.onsuccess = () => {
          const cached = request.result as CachedProperty[];
          cached.forEach(item => {
            // Check if not expired
            if (Date.now() - item.cachedAt <= CACHE_TTL_MS) {
              properties.push(item.data);
            }
          });
          resolve();
        };

        request.onerror = () => resolve();
      });
    }

    return properties;
  } catch {
    return [];
  }
}

/**
 * Store properties in cache
 */
async function cacheProperties(properties: any[], bounds: {
  south: number;
  north: number;
  west: number;
  east: number;
}): Promise<void> {
  try {
    const db = await initDB();
    const now = Date.now();

    // Get tile keys for the fetched bounds
    const tileKeys = getTileKeysForBounds(bounds.south, bounds.north, bounds.west, bounds.east);

    // Store tile metadata
    const tileTransaction = db.transaction([TILE_STORE_NAME], 'readwrite');
    const tileStore = tileTransaction.objectStore(TILE_STORE_NAME);

    for (const tileKey of tileKeys) {
      const tileMeta: TileMetadata = {
        tileKey,
        fetchedAt: now,
        propertyCount: properties.filter(p => {
          const lat = p.verified_latitude || p.latitude;
          const lng = p.verified_longitude || p.longitude;
          return lat && lng && getTileKey(lat, lng) === tileKey;
        }).length
      };
      tileStore.put(tileMeta);
    }

    // Store properties
    const propTransaction = db.transaction([STORE_NAME], 'readwrite');
    const propStore = propTransaction.objectStore(STORE_NAME);

    for (const property of properties) {
      const lat = property.verified_latitude || property.latitude;
      const lng = property.verified_longitude || property.longitude;

      if (lat && lng) {
        const cached: CachedProperty = {
          id: property.id,
          data: property,
          tileKey: getTileKey(lat, lng),
          cachedAt: now
        };
        propStore.put(cached);
      }
    }

    console.log(`💾 Cached ${properties.length} properties in ${tileKeys.length} tiles`);
  } catch (err) {
    console.error('Failed to cache properties:', err);
  }
}

/**
 * Update a single property in cache (for real-time updates)
 */
async function updateCachedProperty(property: any): Promise<void> {
  try {
    const db = await initDB();
    const lat = property.verified_latitude || property.latitude;
    const lng = property.verified_longitude || property.longitude;

    if (!lat || !lng) return;

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const cached: CachedProperty = {
      id: property.id,
      data: property,
      tileKey: getTileKey(lat, lng),
      cachedAt: Date.now()
    };

    store.put(cached);
  } catch (err) {
    console.error('Failed to update cached property:', err);
  }
}

/**
 * Remove a property from cache
 */
async function removeCachedProperty(propertyId: string): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(propertyId);
  } catch (err) {
    console.error('Failed to remove cached property:', err);
  }
}

/**
 * Clear all expired cache entries
 */
async function clearExpiredCache(): Promise<void> {
  try {
    const db = await initDB();
    const now = Date.now();
    const expiredBefore = now - CACHE_TTL_MS;

    // Clear expired tiles
    const tileTransaction = db.transaction([TILE_STORE_NAME], 'readwrite');
    const tileStore = tileTransaction.objectStore(TILE_STORE_NAME);
    const tileRequest = tileStore.openCursor();

    tileRequest.onsuccess = () => {
      const cursor = tileRequest.result;
      if (cursor) {
        const tile = cursor.value as TileMetadata;
        if (tile.fetchedAt < expiredBefore) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    // Clear expired properties
    const propTransaction = db.transaction([STORE_NAME], 'readwrite');
    const propStore = propTransaction.objectStore(STORE_NAME);
    const propIndex = propStore.index('cachedAt');
    const range = IDBKeyRange.upperBound(expiredBefore);
    const propRequest = propIndex.openCursor(range);

    propRequest.onsuccess = () => {
      const cursor = propRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    console.log('🧹 Cleared expired cache entries');
  } catch (err) {
    console.error('Failed to clear expired cache:', err);
  }
}

/**
 * Clear entire cache (for debugging or manual refresh)
 */
async function clearAllCache(): Promise<void> {
  try {
    const db = await initDB();

    const tileTransaction = db.transaction([TILE_STORE_NAME], 'readwrite');
    tileTransaction.objectStore(TILE_STORE_NAME).clear();

    const propTransaction = db.transaction([STORE_NAME], 'readwrite');
    propTransaction.objectStore(STORE_NAME).clear();

    console.log('🗑️ Cleared all property cache');
  } catch (err) {
    console.error('Failed to clear cache:', err);
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats(): Promise<{ propertyCount: number; tileCount: number }> {
  try {
    const db = await initDB();

    const propCount = await new Promise<number>((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const request = transaction.objectStore(STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });

    const tileCount = await new Promise<number>((resolve) => {
      const transaction = db.transaction([TILE_STORE_NAME], 'readonly');
      const request = transaction.objectStore(TILE_STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });

    return { propertyCount: propCount, tileCount };
  } catch {
    return { propertyCount: 0, tileCount: 0 };
  }
}

// Main export interface
export const propertyCache = {
  getTileKeysForBounds,
  isTileCached,
  getPropertiesFromCache,
  cacheProperties,
  updateCachedProperty,
  removeCachedProperty,
  clearExpiredCache,
  clearAllCache,
  getCacheStats,
  CACHE_TTL_MS,
  TILE_SIZE
};
