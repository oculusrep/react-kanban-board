/**
 * Enhanced Search Utilities
 *
 * Provides robust fuzzy matching for all search implementations across the application.
 * Handles typos, word boundaries, abbreviations, and partial matches.
 */

/**
 * Generates multiple search patterns for robust fuzzy matching
 *
 * @param query - The user's search query
 * @returns Array of SQL ILIKE patterns for PostgreSQL
 */
export function generateSearchPatterns(query: string): string[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalized = query.trim().toLowerCase();
  const patterns: string[] = [];

  // 1. Exact substring match (original behavior)
  patterns.push(`%${normalized}%`);

  // 2. Remove special characters and spaces for flexible matching
  const alphanumeric = normalized.replace(/[^a-z0-9]/g, '');
  if (alphanumeric !== normalized && alphanumeric.length > 0) {
    patterns.push(`%${alphanumeric}%`);
  }

  // 3. Split into words for word boundary matching
  const words = normalized.split(/\s+/).filter(w => w.length > 0);

  if (words.length > 1) {
    // Match each word at word boundaries (e.g., "bagel run" matches "Jeff's Bagel Run")
    words.forEach(word => {
      patterns.push(`%${word}%`);
    });

    // Match first letters of each word for abbreviation search (e.g., "jbr" for "Jeff's Bagel Run")
    const firstLetters = words.map(w => w[0]).join('');
    if (firstLetters.length >= 2 && firstLetters !== normalized) {
      patterns.push(`%${firstLetters}%`);
    }
  }

  // 4. Common typo patterns - swap adjacent characters
  if (normalized.length >= 3) {
    for (let i = 0; i < normalized.length - 1; i++) {
      const chars = normalized.split('');
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      const swapped = chars.join('');
      if (!patterns.includes(`%${swapped}%`)) {
        patterns.push(`%${swapped}%`);
      }
    }
  }

  // Remove duplicates and return
  return [...new Set(patterns)];
}

/**
 * Builds a PostgreSQL OR query string for multiple field search with fuzzy patterns
 *
 * @param fields - Array of database field names to search
 * @param query - The user's search query
 * @returns SQL OR query string for Supabase
 *
 * @example
 * buildFuzzyOrQuery(['client_name', 'description'], 'bagel')
 * // Returns: "client_name.ilike.%bagel%,client_name.ilike.%bagle%,description.ilike.%bagel%,..."
 */
export function buildFuzzyOrQuery(fields: string[], query: string): string {
  const patterns = generateSearchPatterns(query);
  const conditions: string[] = [];

  patterns.forEach(pattern => {
    fields.forEach(field => {
      conditions.push(`${field}.ilike.${pattern}`);
    });
  });

  return conditions.join(',');
}

/**
 * Calculates relevance score for a search result
 * Higher scores indicate better matches
 *
 * @param text - The text to score against
 * @param query - The user's search query
 * @param isTitle - Whether this is a primary field (title/name) - gets bonus points
 * @returns Relevance score (higher = better match)
 */
export function calculateRelevanceScore(
  text: string | null | undefined,
  query: string,
  isTitle: boolean = false
): number {
  if (!text || !query) return 0;

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();

  let score = 0;
  const titleBonus = isTitle ? 5 : 0;

  // 1. Exact match (highest score)
  if (normalizedText === normalizedQuery) {
    return 100 + titleBonus;
  }

  // 2. Starts with query
  if (normalizedText.startsWith(normalizedQuery)) {
    score += 50 + titleBonus;
  }

  // 3. Contains query as whole word
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(normalizedQuery)}\\b`);
  if (wordBoundaryRegex.test(normalizedText)) {
    score += 30 + titleBonus;
  }

  // 4. Contains query as substring
  if (normalizedText.includes(normalizedQuery)) {
    score += 20 + titleBonus;
  }

  // 5. Word starts with query words
  const queryWords = normalizedQuery.split(/\s+/);
  const textWords = normalizedText.split(/\s+/);

  queryWords.forEach(qWord => {
    textWords.forEach(tWord => {
      if (tWord.startsWith(qWord)) {
        score += 10;
      }
    });
  });

  // 6. Abbreviation match - first letters of words
  if (queryWords.length === 1 && textWords.length > 1) {
    const firstLetters = textWords.map(w => w[0]).join('');
    if (firstLetters.includes(normalizedQuery)) {
      score += 15;
    }
  }

  // 7. Character proximity bonus - how close together are the matching characters?
  const queryChars = normalizedQuery.replace(/\s/g, '');
  let lastIndex = -1;
  let proximityScore = 0;

  for (const char of queryChars) {
    const index = normalizedText.indexOf(char, lastIndex + 1);
    if (index !== -1) {
      if (lastIndex !== -1 && index - lastIndex <= 3) {
        proximityScore += 2;
      }
      lastIndex = index;
    }
  }
  score += Math.min(proximityScore, 20);

  return score;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sorts search results by relevance score
 *
 * @param results - Array of search results with title/name field
 * @param query - The user's search query
 * @param titleField - The field name to use for relevance scoring (e.g., 'client_name', 'deal_name')
 * @returns Sorted array with highest relevance first
 */
export function sortByRelevance<T extends Record<string, any>>(
  results: T[],
  query: string,
  titleField: string
): T[] {
  return results.sort((a, b) => {
    const scoreA = calculateRelevanceScore(a[titleField], query, true);
    const scoreB = calculateRelevanceScore(b[titleField], query, true);
    return scoreB - scoreA;
  });
}

/**
 * Highlights matching text in search results for display
 *
 * @param text - The text to highlight
 * @param query - The search query to highlight
 * @returns HTML string with <mark> tags around matches
 */
export function highlightMatches(text: string, query: string): string {
  if (!text || !query) return text;

  const normalizedQuery = query.trim().toLowerCase();
  const words = normalizedQuery.split(/\s+/);

  let result = text;

  // Highlight whole query first
  const queryRegex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  result = result.replace(queryRegex, '<mark>$1</mark>');

  // Then highlight individual words
  words.forEach(word => {
    if (word.length > 2) {
      const wordRegex = new RegExp(`\\b(${escapeRegex(word)}\\w*)`, 'gi');
      result = result.replace(wordRegex, '<mark>$1</mark>');
    }
  });

  return result;
}
