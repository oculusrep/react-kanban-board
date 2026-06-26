/**
 * Merchant Logo Refresh
 *
 * Scheduled Edge Function that does TWO things per merchant_brand:
 *
 *   1. License renewal — re-pings Brandfetch's Search API. Required by their
 *      Logo API ToS, which expires a brand's license if no API call is made
 *      within 30 days. Bumps merchant_brand.logo_fetched_at on success.
 *
 *   2. CDN coverage check — HEAD's the actual logo CDN URL. Records the
 *      result in merchant_brand.brandfetch_logo_status:
 *        - 'ok'   → CDN returned 2xx → real logo will render
 *        - 'miss' → CDN returned 4xx → broken pin / fallback letter
 *      Lets the admin filter and surface "Brandfetch has no logo" cases
 *      that were previously invisible (logo_url set but URL doesn't serve).
 *
 * Selection:
 *   - Default: brands whose logo_fetched_at is NULL or older than 25 days.
 *     Steady state ~14 brands/day. Cap of 150/invocation fits 50s edge timeout.
 *   - ?verifyAll=true: ignores staleness filter — picks ANY brand with a
 *     brandfetch_domain set, including those still inside the 25-day window
 *     whose status is 'unknown'. Used for one-time backfill after deploy.
 *   - ?brandIds=<uuid>,<uuid>: scopes to specific brand IDs. Used by the
 *     admin Brands tab to re-verify immediately after a domain edit.
 *
 * Cost: Brandfetch Search API + CDN are both free for our usage volume.
 *
 * Manual invocations:
 *   curl ".../functions/v1/merchant-logo-refresh?dryRun=true"          # no DB writes
 *   curl ".../functions/v1/merchant-logo-refresh?max=10"               # tiny batch
 *   curl ".../functions/v1/merchant-logo-refresh?verifyAll=true"       # backfill mode
 *
 * Scheduled by: supabase/migrations/<...>_merchant_logo_refresh_cron.sql
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_PER_RUN = 150         // Cap per invocation; fits in 50s edge timeout.
const PACING_MS = 250           // Brandfetch Search limit: 1000/5min/IP.
const STALE_THRESHOLD_DAYS = 25 // 5-day cushion before Brandfetch's 30d expiry.
const RATE_LIMIT_BACKOFF_MS = 60_000
const CDN_TIMEOUT_MS = 5000     // Per-CDN-HEAD timeout to bound worst case.

interface BrandRow {
  id: string
  name: string
  brandfetch_domain: string
  logo_url: string | null
  logo_fetched_at: string | null
  brandfetch_logo_status: 'unknown' | 'ok' | 'miss'
}

function cleanSearchQuery(brandName: string): string {
  return brandName.replace(/&/g, ' and ').replace(/\s+/g, ' ').trim()
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * HEAD the Brandfetch CDN URL to determine whether a real logo is served.
 *
 * Quirks that make this trickier than "check the HTTP status":
 *
 *   1. Brandfetch's CDN enforces hotlink protection. Requests without a
 *      browser-like User-Agent + matching Referer/Origin get a 302 to their
 *      ToS docs (regardless of whether the brand exists). We forge those
 *      headers to look like the OVIS web app — matches the registered client
 *      domain for our BRANDFETCH_CLIENT_ID.
 *   2. With proper headers, Brandfetch returns 200 OK in BOTH cases:
 *        - Real logo  → ~1.5KB+ webp/png
 *        - Missing    → ~338 byte placeholder
 *      So we use Content-Length as the disambiguator. Anything <1000 bytes
 *      at 128x128 is the placeholder. Comfortable margin since the smallest
 *      real logos observed are >1500.
 *
 * Returns 'ok' / 'miss' / null (null = couldn't determine, don't overwrite).
 */
const REAL_LOGO_MIN_BYTES = 1000

async function checkCdnStatus(logoUrl: string): Promise<'ok' | 'miss' | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CDN_TIMEOUT_MS)
    const res = await fetch(logoUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://ovis.oculusrep.com/',
        'Origin': 'https://ovis.oculusrep.com',
      },
      signal: controller.signal,
    })
    clearTimeout(timer)
    // Hotlink-blocked / redirect = something's off, treat as undetermined.
    if (res.status >= 300 && res.status < 400) return null
    if (res.status >= 400) return 'miss'
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
    if (!Number.isFinite(contentLength) || contentLength === 0) return null
    return contentLength >= REAL_LOGO_MIN_BYTES ? 'ok' : 'miss'
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startedAt = Date.now()
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'
  const verifyAll = url.searchParams.get('verifyAll') === 'true'
  const brandIdsParam = url.searchParams.get('brandIds')
  const brandIds = brandIdsParam
    ? brandIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null
  const maxOverride = parseInt(url.searchParams.get('max') || '', 10)
  const effectiveMax = Number.isFinite(maxOverride) && maxOverride > 0
    ? Math.min(maxOverride, MAX_PER_RUN)
    : MAX_PER_RUN

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const brandfetchClientId = Deno.env.get('BRANDFETCH_CLIENT_ID')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    if (!brandfetchClientId) {
      throw new Error('Missing BRANDFETCH_CLIENT_ID secret')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const cutoff = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    let queue: BrandRow[]

    if (brandIds && brandIds.length > 0) {
      // Scoped re-verify (admin saveDomain flow).
      const { data, error } = await supabase
        .from('merchant_brand')
        .select('id, name, brandfetch_domain, logo_url, logo_fetched_at, brandfetch_logo_status')
        .in('id', brandIds)
        .not('brandfetch_domain', 'is', null)
        .limit(effectiveMax)
      if (error) throw error
      queue = (data ?? []) as BrandRow[]
    } else if (verifyAll) {
      // Backfill mode — pick any brand with a brandfetch_domain, oldest-checked first.
      // Prioritizes 'unknown' (never checked) by sorting brandfetch_checked_at NULLs first.
      const { data, error } = await supabase
        .from('merchant_brand')
        .select('id, name, brandfetch_domain, logo_url, logo_fetched_at, brandfetch_logo_status')
        .not('brandfetch_domain', 'is', null)
        .order('brandfetch_checked_at', { ascending: true, nullsFirst: true })
        .limit(effectiveMax)
      if (error) throw error
      queue = (data ?? []) as BrandRow[]
    } else {
      // Normal mode — only stale brands.
      const { data: nullRows, error: nullErr } = await supabase
        .from('merchant_brand')
        .select('id, name, brandfetch_domain, logo_url, logo_fetched_at, brandfetch_logo_status')
        .not('brandfetch_domain', 'is', null)
        .is('logo_fetched_at', null)
        .limit(effectiveMax)
      if (nullErr) throw nullErr

      const remainingSlots = effectiveMax - (nullRows?.length || 0)
      let staleRows: BrandRow[] = []
      if (remainingSlots > 0) {
        const { data: rows, error } = await supabase
          .from('merchant_brand')
          .select('id, name, brandfetch_domain, logo_url, logo_fetched_at, brandfetch_logo_status')
          .not('brandfetch_domain', 'is', null)
          .not('logo_fetched_at', 'is', null)
          .lt('logo_fetched_at', cutoff)
          .order('logo_fetched_at', { ascending: true })
          .limit(remainingSlots)
        if (error) throw error
        staleRows = (rows ?? []) as BrandRow[]
      }
      queue = [...((nullRows ?? []) as BrandRow[]), ...staleRows]
    }

    const mode = brandIds ? 'brandIds' : verifyAll ? 'verifyAll' : 'stale'
    console.log(
      `merchant-logo-refresh: ${queue.length} brand(s) (mode=${mode}, dryRun=${dryRun})`,
    )

    if (queue.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: 'No brands need refresh.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let licenseRenewedCount = 0
    let cdnOkCount = 0
    let cdnMissCount = 0
    let cdnUnknownCount = 0
    let notFoundCount = 0
    let errorCount = 0
    let rateLimited = false

    for (let i = 0; i < queue.length; i++) {
      const brand = queue[i]
      const query = cleanSearchQuery(brand.name)
      const apiUrl = `https://api.brandfetch.io/v2/search/${encodeURIComponent(query)}?c=${brandfetchClientId}`

      let licenseRenewed = false
      try {
        const res = await fetch(apiUrl)

        if (res.status === 429) {
          console.warn(`rate-limited after ${i} brands — aborting`)
          rateLimited = true
          await sleep(RATE_LIMIT_BACKOFF_MS)
          break
        }

        if (res.status === 404) {
          notFoundCount++
          console.warn(`  ? ${brand.name} -> Search 404`)
        } else if (!res.ok) {
          errorCount++
          console.warn(`  ! ${brand.name} -> Search HTTP ${res.status}`)
        } else {
          await res.json().catch(() => null) // drain body
          licenseRenewed = true
          licenseRenewedCount++
        }
      } catch (err) {
        errorCount++
        console.warn(`  ! ${brand.name} -> Search fetch error: ${err instanceof Error ? err.message : String(err)}`)
      }

      // CDN coverage check (independent of search outcome; brand may still be servable
      // even if Search 404's on the name).
      let cdnStatus: 'ok' | 'miss' | null = null
      if (brand.logo_url) {
        cdnStatus = await checkCdnStatus(brand.logo_url)
        if (cdnStatus === 'ok') cdnOkCount++
        else if (cdnStatus === 'miss') cdnMissCount++
        else cdnUnknownCount++
      }

      // Persist whatever we learned.
      if (!dryRun && (licenseRenewed || cdnStatus !== null)) {
        const update: Record<string, unknown> = {}
        if (licenseRenewed) update.logo_fetched_at = new Date().toISOString()
        if (cdnStatus !== null) {
          update.brandfetch_logo_status = cdnStatus
          update.brandfetch_checked_at = new Date().toISOString()
        }
        const { error: updErr } = await supabase
          .from('merchant_brand')
          .update(update)
          .eq('id', brand.id)
        if (updErr) {
          errorCount++
          console.warn(`  ! ${brand.name} -> DB update failed: ${updErr.message}`)
        }
      }

      if (i < queue.length - 1) await sleep(PACING_MS)
    }

    const elapsedMs = Date.now() - startedAt

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        mode,
        queued: queue.length,
        licenseRenewed: licenseRenewedCount,
        cdnOk: cdnOkCount,
        cdnMiss: cdnMissCount,
        cdnUnknown: cdnUnknownCount,
        notFound: notFoundCount,
        errors: errorCount,
        rateLimited,
        elapsedMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('merchant-logo-refresh fatal:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
