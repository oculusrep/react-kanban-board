/**
 * Supabase Helper Functions
 *
 * These utilities ensure database defaults (like auth.uid() for created_by_id)
 * work correctly when using the Supabase JS client.
 */

/**
 * Removes undefined fields from an object to allow database defaults to apply.
 *
 * When using Supabase JS client, passing undefined fields in INSERT/UPDATE
 * statements overrides database defaults. This function cleans the data object
 * to let defaults like `created_by_id DEFAULT auth.uid()` work properly.
 *
 * @param data - The data object to clean
 * @returns A new object with undefined fields removed
 *
 * @example
 * const cleanData = removeUndefinedFields({
 *   name: 'John',
 *   email: undefined,
 *   created_by_id: undefined
 * });
 * // Result: { name: 'John' }
 * // Database defaults will now apply for email and created_by_id
 */
export function removeUndefinedFields<T extends Record<string, any>>(data: T): Partial<T> {
  const cleaned = { ...data };

  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });

  return cleaned;
}

/**
 * Prepares data for INSERT by removing undefined fields.
 * Alias for removeUndefinedFields with a more explicit name.
 *
 * @param data - The data object to prepare for insertion
 * @returns A new object ready for database insertion
 *
 * @example
 * const insertData = prepareInsert(formData);
 * await supabase.from('contact').insert(insertData);
 */
export function prepareInsert<T extends Record<string, any>>(data: T): Partial<T> {
  return removeUndefinedFields(data);
}

/**
 * Prepares data for UPDATE by removing undefined fields.
 * Alias for removeUndefinedFields with a more explicit name.
 *
 * @param data - The data object to prepare for update
 * @returns A new object ready for database update
 *
 * @example
 * const updateData = prepareUpdate(formData);
 * await supabase.from('contact').update(updateData).eq('id', contactId);
 */
export function prepareUpdate<T extends Record<string, any>>(data: T): Partial<T> {
  return removeUndefinedFields(data);
}
