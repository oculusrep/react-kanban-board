import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface RecentItem {
  id: string;
  type: 'deal' | 'property' | 'contact' | 'assignment' | 'client' | 'site_submit';
  name: string;
  subtitle?: string; // Additional info like company, address, etc.
  viewedAt: string; // ISO string
}

interface RecentItemsStorage {
  deals: RecentItem[];
  properties: RecentItem[];
  contacts: RecentItem[];
  assignments: RecentItem[];
  clients: RecentItem[];
  site_submits: RecentItem[];
}

const STORAGE_KEY = 'kanban_recently_viewed';
const MAX_RECENT_ITEMS = 10; // Store more but show fewer
const RECENT_ITEMS_TO_SHOW = 3;

export function useRecentlyViewed() {
  const [recentItems, setRecentItems] = useState<RecentItemsStorage>({
    deals: [],
    properties: [],
    contacts: [],
    assignments: [],
    clients: [],
    site_submits: []
  });

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setRecentItems(parsed);
      }
    } catch (error) {
      console.error('Error loading recently viewed items:', error);
    }
  }, []);

  // Save to localStorage whenever recentItems changes
  const saveToStorage = useCallback((items: RecentItemsStorage) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error saving recently viewed items:', error);
    }
  }, []);

  // Add or update a recently viewed item
  const addRecentItem = useCallback((item: Omit<RecentItem, 'viewedAt'>) => {
    const newItem: RecentItem = {
      ...item,
      viewedAt: new Date().toISOString()
    };

    setRecentItems(prev => {
      const key = `${item.type}s` as keyof RecentItemsStorage;
      const currentItems = prev[key] || [];

      // Remove existing item with same id if it exists
      const filteredItems = currentItems.filter(existing => existing.id !== item.id);

      // Add new item at the beginning
      const updatedItems = [newItem, ...filteredItems].slice(0, MAX_RECENT_ITEMS);

      const newState = {
        ...prev,
        [key]: updatedItems
      };

      // Save to localStorage
      saveToStorage(newState);

      return newState;
    });
  }, [saveToStorage]);

  // Get recent items for a specific type
  const getRecentItems = useCallback((type: RecentItem['type'], limit: number = RECENT_ITEMS_TO_SHOW): RecentItem[] => {
    const key = `${type}s` as keyof RecentItemsStorage;
    return (recentItems[key] || []).slice(0, limit);
  }, [recentItems]);

  // Clear all recent items
  const clearRecentItems = useCallback(() => {
    const emptyState = {
      deals: [],
      properties: [],
      contacts: [],
      assignments: [],
      clients: [],
      site_submits: []
    };
    setRecentItems(emptyState);
    saveToStorage(emptyState);
  }, [saveToStorage]);

  // Clear recent items for a specific type
  const clearRecentItemsForType = useCallback((type: RecentItem['type']) => {
    setRecentItems(prev => {
      const key = `${type}s` as keyof RecentItemsStorage;
      const newState = {
        ...prev,
        [key]: []
      };
      saveToStorage(newState);
      return newState;
    });
  }, [saveToStorage]);

  // Remove a specific item by ID and type
  const removeRecentItem = useCallback((id: string, type: RecentItem['type']) => {
    console.log('🗑️ Removing recent item:', { id, type });
    setRecentItems(prev => {
      const key = `${type}s` as keyof RecentItemsStorage;
      const currentItems = prev[key] || [];
      console.log('📋 Current items before removal:', currentItems);
      const filteredItems = currentItems.filter(item => item.id !== id);
      console.log('📋 Items after removal:', filteredItems);

      const newState = {
        ...prev,
        [key]: filteredItems
      };
      saveToStorage(newState);
      console.log('💾 Saved to localStorage');
      return newState;
    });
  }, [saveToStorage]);

  // Validate and clean up stale items for a specific type
  const validateRecentItems = useCallback(async (type: RecentItem['type']) => {
    const key = `${type}s` as keyof RecentItemsStorage;
    const currentItems = recentItems[key] || [];

    if (currentItems.length === 0) return;

    console.log(`🔍 Validating ${currentItems.length} recent ${type}s...`);

    // Map type to table name
    const typeToTable: Record<RecentItem['type'], string> = {
      'deal': 'deal',
      'property': 'property',
      'contact': 'contact',
      'assignment': 'assignment',
      'client': 'client',
      'site_submit': 'site_submit'
    };

    const tableName = typeToTable[type];
    const ids = currentItems.map(item => item.id);

    try {
      // Check which IDs still exist in the database
      const { data, error } = await supabase
        .from(tableName)
        .select('id')
        .in('id', ids);

      if (error) {
        console.error(`Error validating ${type}s:`, error);
        return;
      }

      const existingIds = new Set(data?.map(item => item.id) || []);
      const validItems = currentItems.filter(item => existingIds.has(item.id));
      const removedCount = currentItems.length - validItems.length;

      if (removedCount > 0) {
        console.log(`🧹 Removed ${removedCount} stale ${type}(s) from recently viewed`);
        setRecentItems(prev => {
          const newState = {
            ...prev,
            [key]: validItems
          };
          saveToStorage(newState);
          return newState;
        });
      }
    } catch (error) {
      console.error(`Error validating ${type}s:`, error);
    }
  }, [recentItems, saveToStorage]);

  return {
    addRecentItem,
    getRecentItems,
    clearRecentItems,
    clearRecentItemsForType,
    removeRecentItem,
    validateRecentItems,
    recentItems
  };
}

// Hook specifically for tracking page views
export function useTrackPageView() {
  const { addRecentItem } = useRecentlyViewed();

  const trackView = useCallback((
    id: string,
    type: RecentItem['type'],
    name: string,
    subtitle?: string
  ) => {
    // Only track if we have valid data
    if (id && id !== 'new' && name) {
      addRecentItem({ id, type, name, subtitle });
    }
  }, [addRecentItem]);

  return { trackView };
}