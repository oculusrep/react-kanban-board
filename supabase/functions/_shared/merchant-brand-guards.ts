/**
 * THE merchant_location guards. One definition, three callers.
 *
 * Google Places Text Search is overly permissive: a "24 Hour Fitness" search returns Anytime
 * Fitness, YMCAs and dance studios; a "Roses" search returned 395 florists. It also returns
 * ancillary sub-listings at one storefront — Kroger Pharmacy, Wells Fargo ATM, Lowe's Garden
 * Center — as separate places. Two guards reject both classes.
 *
 * These shipped in July 2026 at ingest time and at map render time, as two hand-synced copies with
 * KEEP IN SYNC comments. Site research then read merchant_location directly, did not know the
 * contract existed, and pulled 54% junk into generators.csv. That is what a synced copy costs, so
 * there is now exactly one definition and every caller imports it:
 *
 *   - src/services/merchantIngestService.ts  (ingest: never store a row that fails these)
 *   - src/components/mapping/layers/MerchantLayer.tsx  (render: never draw one)
 *   - supabase/functions/_shared/site-research/generators.ts  (export: never export one)
 *
 * Render and export still have to filter because the stored data predates the ingest guard: every
 * row was loaded 2026-04 and 2026-06, ingest is upsert-only and never deletes, and nothing
 * re-ingests on a schedule. The pre-guard rows stay until someone cleans them.
 *
 * Deliberately dependency-free so it imports from Vite and from Deno alike.
 */

/** A brand as the guards need to see it. Both fields are admin overrides and usually null. */
export interface GuardBrand {
  name: string;
  /** Places' actual display name when it differs from brand.name ("Truist Bank" -> "Truist"). */
  places_display_name?: string | null;
  /** Comma-separated ancillary tokens for this brand, on top of the default list. */
  places_name_exclude?: string | null;
}

/**
 * Ancillary-service tokens that appear as separate Places entries at one physical storefront.
 * Case-insensitive whole-word match.
 */
export const DEFAULT_ANCILLARY_TOKENS = [
  'ATM',
  'Pharmacy',
  'Fuel Center',
  'Fuel Kiosk',
  'Fueling Center',
  'Deli',
  'Bakery',
  'Floral',
  'Money Services',
  'Advisors',
  'Clicklist',
  'Garden Center',
  'Pro Services',
  'Pro Center',
  'Pro Desk',
  'Tool Rental',
  'Auto Center',
  'Vision Center',
  'Optical Center',
  'Photo Lab',
];

export function tokensToRegex(tokens: string[]): RegExp {
  const escaped = tokens
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return /$^/;
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

const DEFAULT_ANCILLARY_REGEX = tokensToRegex(DEFAULT_ANCILLARY_TOKENS);

/** Is this Places result a sub-service at another store's address rather than a store? */
export function isAncillarySubListing(placesName: string | null | undefined, brand: Pick<GuardBrand, 'places_name_exclude'>): boolean {
  if (!placesName) return false;
  if (DEFAULT_ANCILLARY_REGEX.test(placesName)) return true;
  const custom = brand.places_name_exclude?.trim();
  if (!custom) return false;
  const customTokens = custom.split(',').map((s) => s.trim()).filter(Boolean);
  if (customTokens.length === 0) return false;
  return tokensToRegex(customTokens).test(placesName);
}

/** Alphanumeric-only, lowercased. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Does a Places display name look like it belongs to this brand?
 *
 * Matches against places_display_name when the admin set one, else brand.name. Also accepts a
 * "brand-minus-last-word" stem, so type suffixes like Bank/Wireless/Store/Donuts do not force a
 * manual override for every such brand. The stem must be >= 4 characters or "The X" matches
 * everything.
 */
export function nameMatchesBrand(placesName: string | null | undefined, brand: Pick<GuardBrand, 'name' | 'places_display_name'>): boolean {
  if (!placesName) return false;
  const expected = brand.places_display_name?.trim() || brand.name;
  if (!expected) return false;
  const nPlaces = normalizeForMatch(placesName);
  const nFull = normalizeForMatch(expected);
  if (nFull.length >= 3 && nPlaces.includes(nFull)) return true;
  const parts = expected.trim().split(/\s+/);
  if (parts.length > 1) {
    const stem = parts.slice(0, -1).join('');
    const nStem = normalizeForMatch(stem);
    if (nStem.length >= 4 && nPlaces.includes(nStem)) return true;
  }
  return false;
}

/** Both guards, as every caller applies them: keep only rows that pass each. */
export function passesBrandGuards(placesName: string | null | undefined, brand: GuardBrand): boolean {
  return nameMatchesBrand(placesName, brand) && !isAncillarySubListing(placesName, brand);
}
