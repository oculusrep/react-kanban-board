/**
 * Utility functions for handling date strings without timezone issues
 */

/**
 * Format a date string (YYYY-MM-DD) for display without timezone conversion
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Formatted date string for display
 */
export const formatDateString = (dateString: string | null): string => {
  if (!dateString) return 'Unknown';
  
  // Parse the date components directly to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Create date in local timezone (not UTC)
  const date = new Date(year, month - 1, day);
  
  return date.toLocaleDateString();
};

/**
 * Format a date string for display, returning a fallback if null
 * @param dateString - Date string in YYYY-MM-DD format
 * @param fallback - Fallback text when date is null
 * @returns Formatted date string or fallback
 */
export const formatDateStringWithFallback = (
  dateString: string | null, 
  fallback: string = 'Not set'
): string => {
  if (!dateString) return fallback;
  return formatDateString(dateString);
};

/**
 * Format a date string for input value (no formatting, just return as-is)
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date string for input value or empty string
 */
export const formatDateForInput = (dateString: string | null): string => {
  return dateString || '';
};