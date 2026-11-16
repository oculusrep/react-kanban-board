/**
 * Source rules shared by the recently built pass and the Gemini unit-count step.
 * A listing or aggregator page is never a total-units source. Builder,
 * developer, property-management, government and news sites are fine.
 * Doc: docs/MARKET_RESEARCH_RECENTLY_BUILT.md
 */

const LISTING_HOST = /(^|\.)(zillow|redfin|realtor|trulia|homes|movoto|homesnap|point2homes|compass|remax|century21|coldwellbankerhomes|kw|bhhs|har|homefinder|fmls|georgiamls|newhomesource|newhomeguide|livabl|newhomesdirectory|apartments|apartmentlist|apartmentguide|apartmentfinder|apartmenthomeliving|rent|rentcafe|rentable|rentals|rentlingo|zumper|hotpads|padmapper|forrent|niche|neighborhoods|realestate|yelp|after55|seniorly|seniorcarefinder|caring|aplaceformom|seniorhousingnet|forsalebyowner|loopnet|crexi)\.(com|net|org)$/i;

/** A bare domain (Gemini's grounding chunk titles are domains). */
export function isListingHost(host: string | null): boolean {
  return !!host && LISTING_HOST.test(host.trim().toLowerCase().replace(/^www\./, ''));
}

export function isListingUrl(u: string | null): boolean {
  if (!u) return false;
  try { return isListingHost(new URL(u).hostname); } catch { return false; }
}

/** Gemini cites vertexaisearch grounding-api-redirect links; resolve them to the
 *  real page (they also expire). Unresolvable → null. */
export async function resolveUrl(u: string, cache: Map<string, string | null> = new Map()): Promise<string | null> {
  if (cache.has(u)) return cache.get(u)!;
  let out: string | null = u;
  if (/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(u)) {
    out = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(u, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
      clearTimeout(t);
      out = res.headers.get('location');
      await res.body?.cancel();
    } catch { out = null; }
  }
  cache.set(u, out);
  return out;
}
