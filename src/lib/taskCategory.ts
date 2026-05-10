import { supabase } from './supabaseClient';
import { TaskCategoryRow } from '../types/task';

// Tiny cached lookup of task_category rows. Used by inserts that need
// to populate task.category_id (NOT NULL FK) and by updateTask's sync
// logic. The cache is invalidated whenever a new category is created
// (CategoryDropdown calls invalidate() after CreateCategoryModal).

let cachePromise: Promise<TaskCategoryRow[]> | null = null;

async function loadCategories(): Promise<TaskCategoryRow[]> {
  const { data, error } = await supabase
    .from('task_category')
    .select('*')
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
  return all.find((c) => c.name === name) ?? null;
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
