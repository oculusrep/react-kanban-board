import { supabase } from './supabaseClient';
import { TaskCategoryRow } from '../types/task';

// Tiny cached lookup of task_category rows. Used by inserts that need
// to populate task.category_id (NOT NULL FK) and by updateTask's sync
// logic. Filtered to active (non-archived) rows. Cache is invalidated
// after create/edit/archive.

let cachePromise: Promise<TaskCategoryRow[]> | null = null;

async function loadCategories(): Promise<TaskCategoryRow[]> {
  // Caches ALL active categories regardless of scope/owner — callers
  // visible-to-user filter happens in the dropdown. Keeps the cache
  // hot for sync lookups in updateTask too.
  const { data, error } = await supabase
    .from('task_category')
    .select('*')
    .is('archived_at', null)
    .order('sort_order', { ascending: true });
  if (error) {
    console.warn('[taskCategory] load failed:', error);
    return [];
  }
  return data ?? [];
}

export function invalidateCategoryCache(): void {
  cachePromise = null;
}

async function getAll(): Promise<TaskCategoryRow[]> {
  if (!cachePromise) cachePromise = loadCategories();
  return cachePromise;
}

export async function getCategoryByName(
  name: string
): Promise<TaskCategoryRow | null> {
  const all = await getAll();
  // Case-insensitive lookup so 'other' matches whether stored as
  // 'other' or 'Other'. Prefer global when both exist.
  const lower = name.toLowerCase();
  const matches = all.filter((c) => c.name.toLowerCase() === lower);
  return matches.find((c) => c.scope === 'global') ?? matches[0] ?? null;
}

export async function getCategoryIdByName(
  name: string
): Promise<string | null> {
  const row = await getCategoryByName(name);
  return row?.id ?? null;
}

export async function getCategoryById(
  id: string
): Promise<TaskCategoryRow | null> {
  const all = await getAll();
  return all.find((c) => c.id === id) ?? null;
}

// Permission predicates. Centralized so the dropdown's pencil icon and
// the EditCategoryModal share one rule.
//
// - Personal: editable + archivable by owner OR by admin.
// - Global:   editable + archivable by admin only.
export function canEditCategory(
  cat: TaskCategoryRow,
  currentUserTableId: string | null,
  currentUserRole: string | null
): boolean {
  const isAdmin = currentUserRole === 'admin';
  if (cat.scope === 'global') return isAdmin;
  // personal
  return isAdmin || cat.created_by_id === currentUserTableId;
}

// Visibility filter for the dropdown — what the current user should
// see in their picker.
export function isCategoryVisibleTo(
  cat: TaskCategoryRow,
  currentUserTableId: string | null
): boolean {
  if (cat.archived_at) return false;
  if (cat.scope === 'global') return true;
  return cat.created_by_id === currentUserTableId;
}
