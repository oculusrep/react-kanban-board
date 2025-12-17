import crypto from 'crypto';

/**
 * Normalize company name for matching/deduplication
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')                    // Remove apostrophes
    .replace(/[^a-z0-9\s]/g, '')             // Remove punctuation
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .replace(/\b(inc|llc|corp|co|company|restaurant|restaurants|cafe|grill|kitchen|bar|eatery|the)\b/g, '')
    .trim();
}

/**
 * Generate MD5 hash for content deduplication
 */
export function generateContentHash(content: string): string {
  return crypto
    .createHash('md5')
    .update(content)
    .digest('hex');
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Check if two names likely refer to the same company
 */
export function isSameCompany(name1: string, name2: string): boolean {
  const norm1 = normalizeCompanyName(name1);
  const norm2 = normalizeCompanyName(name2);

  // Exact match
  if (norm1 === norm2) return true;

  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  // Levenshtein similarity
  const distance = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return true;

  const similarity = 1 - distance / maxLen;
  return similarity > 0.85;
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Clean and truncate text for storage
 */
export function cleanText(text: string, maxLength?: number): string {
  let cleaned = text
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[\x00-\x1F]/g, '')    // Remove control characters
    .trim();

  if (maxLength && cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength - 3) + '...';
  }

  return cleaned;
}

/**
 * Generate LinkedIn search URL for a person
 */
export function generateLinkedInSearchUrl(name: string, company?: string, title?: string): string {
  const parts = [name];
  if (company) parts.push(company);
  if (title) parts.push(title);

  const query = encodeURIComponent(parts.join(' '));
  return `https://www.linkedin.com/search/results/people/?keywords=${query}`;
}

/**
 * Parse person name from "FirstName LastName" or "LastName, FirstName" formats
 */
export function parseName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();

  // Check for "LastName, FirstName" format
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map(s => s.trim());
    return { firstName: first || '', lastName: last || '' };
  }

  // Assume "FirstName LastName" format
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}
