// Shared constants and helpers for the Merchants admin tabs.
// See docs/MERCHANTS_LAYER_SPEC.md and docs/MERCHANTS_ADMIN_ROADMAP.md.

export const BRAND_COLOR_DARK = '#002147';
export const BRAND_COLOR_MED = '#4A6B94';
export const BRAND_COLOR_LIGHT = '#8FA9C8';
export const BRAND_COLOR_WARN = '#A27B5C';

export const BRANDFETCH_CLIENT_ID =
  (import.meta.env.VITE_BRANDFETCH_CLIENT_ID as string) || '';

export type LogoVariant = 'auto' | 'icon' | 'logo' | 'symbol';

/**
 * Build a Brandfetch CDN URL for a given domain.
 *
 * When variant is 'auto' (default), Brandfetch picks the best asset.
 * Explicit variants insert a path segment: /icon, /logo, /symbol.
 * See docs/MERCHANTS_ADMIN_ROADMAP.md §6 for when to use which.
 */
export function buildLogoUrl(domain: string, variant: LogoVariant = 'auto'): string {
  const variantSegment = variant === 'auto' ? '' : `/${variant}`;
  return `https://cdn.brandfetch.io/${domain}${variantSegment}/w/128/h/128?c=${BRANDFETCH_CLIENT_ID}`;
}
